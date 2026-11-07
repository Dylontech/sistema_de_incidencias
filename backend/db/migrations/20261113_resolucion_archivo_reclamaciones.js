/**
 * Resolución con costo y documentos, archivo de incidencias y reclamaciones.
 *
 * - `incidencias.costo_reparacion` y `documentos_resolucion` guardan lo que el
 *   funcionario registra al resolver.
 * - `incidencias.archivada_en` marca el paso al archivo (24 h después de
 *   resolverse). El servicio también lo calcula al vuelo para no depender de un
 *   proceso en segundo plano.
 * - `reclamaciones` recoge las inconformidades de la ciudadanía: las revisa el
 *   funcionario del municipio y la administración, que puede delegar la
 *   decisión final o reabrir la incidencia.
 */
async function colacionDeUsuarios(knex) {
  try {
    const filas = await knex.raw(
      "SELECT COLLATION_NAME AS colacion FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'id' LIMIT 1",
      [knex.client.config.connection.database]
    );
    return filas?.[0]?.[0]?.colacion || 'utf8mb4_unicode_ci';
  } catch {
    return 'utf8mb4_unicode_ci';
  }
}

export async function up(knex) {
  const colacion = await colacionDeUsuarios(knex);
  const columnas = [
    ['costo_reparacion', 'DECIMAL(12,2) NULL'],
    ['documentos_resolucion', 'TEXT NULL'],
    ['archivada_en', 'DATETIME(3) NULL']
  ];
  for (const [columna, tipo] of columnas) {
    if (!(await knex.schema.hasColumn('incidencias', columna))) {
      await knex.raw(`ALTER TABLE incidencias ADD COLUMN ${columna} ${tipo}`);
    }
  }

  if (!(await knex.schema.hasTable('reclamaciones'))) {
    await knex.schema.createTable('reclamaciones', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('incidencia_id', 64).notNullable();
      t.string('municipio_id', 64).nullable();
      t.string('incidencia_titulo', 200).nullable();
      t.string('usuario_id', 64).nullable();
      t.string('user_key', 64).nullable();
      t.string('username', 120).nullable();
      t.string('nombre', 160).nullable();
      t.string('motivo', 60).notNullable();
      t.string('detalle', 600).notNullable();
      t.enum('estado', ['pendiente', 'en_revision', 'resuelta', 'rechazada'])
        .notNullable()
        .defaultTo('pendiente');
      t.enum('decision', ['revertir', 'mantener']).nullable();
      t.string('respuesta', 600).nullable();
      t.string('resuelto_por', 120).nullable();
      t.datetime('resuelto_en', { precision: 3 }).nullable();
      t.string('delegado_a', 120).nullable();
      t.datetime('delegado_en', { precision: 3 }).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.foreign('incidencia_id').references('incidencias.id').onDelete('CASCADE');
      t.index(['estado', 'creado_en'], 'reclamacion_estado_idx');
      t.index(['incidencia_id'], 'reclamacion_incidencia_idx');
      t.index(['municipio_id'], 'reclamacion_municipio_idx');
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('reclamaciones')) await knex.schema.dropTable('reclamaciones');
  for (const [columna] of [
    ['costo_reparacion'],
    ['documentos_resolucion'],
    ['archivada_en']
  ]) {
    if (await knex.schema.hasColumn('incidencias', columna)) {
      await knex.raw(`ALTER TABLE incidencias DROP COLUMN ${columna}`);
    }
  }
}
