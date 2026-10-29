/**
 * Cadena de soporte para tickets.
 *
 *  - Rol `soporte`: atiende tickets sin poder moderar ni administrar cuentas.
 *  - `tickets.asignado_en/asignado_por/grupo/reabierto_en`: responsable actual
 *    e histórico de la asignación.
 *  - `ticket_eventos`: bitácora del ticket (creado, asignado, respondido,
 *    cambio de estado/prioridad, nota interna).
 *  - `reglas_tickets`: asignación automática por municipio/estado/prioridad a
 *    una cuenta concreta o a una cola por rol.
 */
const ROLES_CON_SOPORTE =
  "'ciudadano', 'funcionario', 'auditor', 'enlace_estatal', 'enlace_federal', 'soporte', 'admin'";

async function colacionDeUsuarios(knex) {
  const resultado = await knex.raw(
    `SELECT COLLATION_NAME AS col FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'id'`
  );
  const filas = Array.isArray(resultado) ? resultado[0] : null;
  return filas?.[0]?.col || 'utf8mb4_unicode_ci';
}

async function agregarColumna(knex, tabla, columna, definidor) {
  if (await knex.schema.hasColumn(tabla, columna)) return;
  await knex.schema.alterTable(tabla, (t) => definidor(t));
}

export async function up(knex) {
  const colacion = await colacionDeUsuarios(knex);

  // 1. Rol de soporte en el enum de usuarios.
  await knex.raw(`ALTER TABLE usuarios MODIFY rol ENUM(${ROLES_CON_SOPORTE}) NOT NULL`);

  // 2. Responsable y trazas del ticket.
  await agregarColumna(knex, 'tickets', 'asignado_en', (t) =>
    t.datetime('asignado_en', { precision: 3 }).nullable()
  );
  await agregarColumna(knex, 'tickets', 'asignado_por', (t) =>
    t.string('asignado_por', 120).nullable()
  );
  await agregarColumna(knex, 'tickets', 'grupo', (t) => t.string('grupo', 30).nullable());
  await agregarColumna(knex, 'tickets', 'reabierto_en', (t) =>
    t.datetime('reabierto_en', { precision: 3 }).nullable()
  );

  const indices = await knex.raw('SHOW INDEX FROM tickets');
  const filasIndices = Array.isArray(indices) ? indices[0] : [];
  const nombres = new Set(filasIndices.map((i) => i.Key_name));
  if (!nombres.has('tickets_asignado_a_index')) {
    await knex.raw(
      'ALTER TABLE `tickets` ADD INDEX `tickets_asignado_a_index` (`asignado_a`)'
    );
  }
  if (!nombres.has('tickets_municipio_estado_index')) {
    await knex.raw(
      'ALTER TABLE `tickets` ADD INDEX `tickets_municipio_estado_index` (`municipio_id`, `estado`)'
    );
  }

  // 3. Historial del ticket.
  if (!(await knex.schema.hasTable('ticket_eventos'))) {
    await knex.schema.createTable('ticket_eventos', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).notNullable().primary();
      t.string('ticket_id', 64).notNullable();
      t.string('tipo', 30).notNullable();
      t.string('de', 120).nullable();
      t.string('a', 160).nullable();
      t.string('actor', 120).nullable();
      t.text('nota', 'longtext').nullable();
      t.datetime('creado_en', { precision: 3 }).defaultTo(knex.fn.now());
      t.foreign('ticket_id').references('tickets.id').onDelete('CASCADE');
      t.index(['ticket_id', 'creado_en']);
    });
  }

  // 4. Reglas de asignación automática.
  if (!(await knex.schema.hasTable('reglas_tickets'))) {
    await knex.schema.createTable('reglas_tickets', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).notNullable().primary();
      t.string('municipio_id', 64).nullable();
      t.string('estado', 120).nullable();
      t.string('prioridad', 20).nullable();
      t.string('asignar_a', 120).nullable();
      t.string('asignar_rol', 30).nullable();
      t.boolean('activo').notNullable().defaultTo(true);
      t.datetime('creado_en', { precision: 3 }).defaultTo(knex.fn.now());
      t.index(['municipio_id']);
      t.index(['estado']);
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('reglas_tickets');
  await knex.schema.dropTableIfExists('ticket_eventos');
  for (const columna of ['reabierto_en', 'grupo', 'asignado_por', 'asignado_en']) {
    if (await knex.schema.hasColumn('tickets', columna)) {
      await knex.schema.alterTable('tickets', (t) => t.dropColumn(columna));
    }
  }
  await knex.raw(
    `ALTER TABLE usuarios MODIFY rol ENUM('ciudadano','funcionario','auditor','enlace_estatal','enlace_federal','admin') NOT NULL`
  );
}
