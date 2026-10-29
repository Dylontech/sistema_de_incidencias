/** Tickets de soporte interno (errores del sistema reportados por usuarios). */
async function colacionDeUsuarios(knex) {
  const resultado = await knex.raw(
    `SELECT COLLATION_NAME AS col FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'id'`
  );
  const filas = Array.isArray(resultado) ? resultado[0] : null;
  return filas?.[0]?.col || 'utf8mb4_unicode_ci';
}

export async function up(knex) {
  const colacion = await colacionDeUsuarios(knex);

  if (!(await knex.schema.hasTable('tickets'))) {
    await knex.schema.createTable('tickets', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).notNullable().primary();
      t.string('folio', 32).notNullable().unique();
      t.string('autor_user_key', 120).notNullable();
      t.string('autor_rol', 30).nullable();
      t.string('municipio_id', 64).nullable();
      t.string('asunto', 200).notNullable();
      t.string('categoria', 30).notNullable().defaultTo('error');
      t.string('prioridad', 20).notNullable().defaultTo('media');
      t.string('estado', 20).notNullable().defaultTo('abierto');
      t.string('asignado_a', 120).nullable();
      t.text('cuerpo', 'longtext').notNullable();
      t.datetime('creado_en', { precision: 3 }).defaultTo(knex.fn.now());
      t.datetime('actualizado_en', { precision: 3 }).defaultTo(knex.fn.now());
      t.datetime('cerrado_en', { precision: 3 }).nullable();
      t.index(['estado']);
      t.index(['autor_user_key']);
    });
  }

  if (!(await knex.schema.hasTable('ticket_mensajes'))) {
    await knex.schema.createTable('ticket_mensajes', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).notNullable().primary();
      t.string('ticket_id', 64).notNullable();
      t.string('autor_user_key', 120).nullable();
      t.string('autor_rol', 30).nullable();
      t.text('cuerpo', 'longtext').notNullable();
      t.boolean('interno').notNullable().defaultTo(false);
      t.datetime('creado_en', { precision: 3 }).defaultTo(knex.fn.now());
      t.foreign('ticket_id').references('tickets.id').onDelete('CASCADE');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ticket_mensajes');
  await knex.schema.dropTableIfExists('tickets');
}
