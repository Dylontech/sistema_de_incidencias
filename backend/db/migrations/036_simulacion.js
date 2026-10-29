/**
 * Sesiones de simulación del administrador.
 *
 * Los datos creados durante una simulación se etiquetan con `simulado` y
 * `simulacion_id` en cada tabla de dominio. El journal permite revertir las
 * operaciones en orden inverso.
 */
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

  if (!(await knex.schema.hasTable('simulacion_sesiones'))) {
    await knex.schema.createTable('simulacion_sesiones', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('admin_id', 120).notNullable();
      t.string('rol_simulado', 30).notNullable();
      t.enum('estado', ['abierta', 'cerrada', 'revertida'])
        .notNullable()
        .defaultTo('abierta');
      t.datetime('creada_en', { precision: 3 }).notNullable();
      t.datetime('cerrada_en', { precision: 3 }).nullable();
      t.datetime('revertida_en', { precision: 3 }).nullable();
      t.text('notas', 'longtext').nullable();
    });
  }

  if (!(await knex.schema.hasTable('simulacion_operaciones'))) {
    await knex.schema.createTable('simulacion_operaciones', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('sesion_id', 64).notNullable();
      t.integer('orden').notNullable();
      t.string('accion_id', 80).nullable();
      t.string('entidad_tipo', 60).notNullable();
      t.string('entidad_id', 64).nullable();
      t.enum('operacion', ['crear', 'actualizar', 'eliminar']).notNullable();
      t.text('antes', 'longtext').nullable();
      t.text('despues', 'longtext').nullable();
      t.string('endpoint', 255).nullable();
      t.text('resultado', 'longtext').nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();

      t.foreign('sesion_id', 'simulacion_op_sesion_fk')
        .references('id')
        .inTable('simulacion_sesiones')
        .onDelete('CASCADE');
      t.index(['sesion_id', 'orden'], 'simulacion_op_orden_idx');
    });
  }

  const tablasSimuladas = [
    'usuarios',
    'incidencias',
    'incidencia_evidencias',
    'incidencia_comentarios',
    'recolecciones_firmas',
    'recoleccion_firmas',
    'tickets',
    'ticket_mensajes',
    'mensajes_directos',
    'contactos_funcionarios',
    'contacto_funcionario_mensajes',
    'solicitudes_funcionario',
    'mensajes_contacto',
    'sugerencias',
    'solicitudes_informe',
    'notificaciones',
    'publicaciones_redes',
    'correos_institucionales'
  ];

  for (const tabla of tablasSimuladas) {
    if (!(await knex.schema.hasTable(tabla))) continue;
    if (!(await knex.schema.hasColumn(tabla, 'simulado'))) {
      await knex.raw(
        `ALTER TABLE ${tabla} ADD COLUMN simulado TINYINT(1) NOT NULL DEFAULT 0`
      );
    }
    if (!(await knex.schema.hasColumn(tabla, 'simulacion_id'))) {
      await knex.raw(`ALTER TABLE ${tabla} ADD COLUMN simulacion_id VARCHAR(64) NULL`);
    }
    await knex.raw(`ALTER TABLE ${tabla} ADD INDEX ${tabla}_simulado_idx (simulado)`);
  }
}

export async function down(knex) {
  const tablasSimuladas = [
    'usuarios',
    'incidencias',
    'incidencia_evidencias',
    'incidencia_comentarios',
    'recolecciones_firmas',
    'recoleccion_firmas',
    'tickets',
    'ticket_mensajes',
    'mensajes_directos',
    'contactos_funcionarios',
    'contacto_funcionario_mensajes',
    'solicitudes_funcionario',
    'mensajes_contacto',
    'sugerencias',
    'solicitudes_informe',
    'notificaciones',
    'publicaciones_redes',
    'correos_institucionales'
  ];

  for (const tabla of tablasSimuladas) {
    if (!(await knex.schema.hasTable(tabla))) continue;
    await knex.raw(`ALTER TABLE ${tabla} DROP INDEX ${tabla}_simulado_idx`);
    if (await knex.schema.hasColumn(tabla, 'simulacion_id')) {
      await knex.schema.alterTable(tabla, (t) => t.dropColumn('simulacion_id'));
    }
    if (await knex.schema.hasColumn(tabla, 'simulado')) {
      await knex.schema.alterTable(tabla, (t) => t.dropColumn('simulado'));
    }
  }

  await knex.schema.dropTableIfExists('simulacion_operaciones');
  await knex.schema.dropTableIfExists('simulacion_sesiones');
}
