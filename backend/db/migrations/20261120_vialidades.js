/**
 * Capa de condición de vialidades.
 *
 * Guarda el trazado real de las calles y carreteras importadas (GeoJSON) para
 * colorearlas según las incidencias cercanas. Si un municipio no tiene
 * vialidades importadas, el servicio genera tramos heurísticos con los puntos
 * de las incidencias; la tabla es una mejora, no un requisito de arranque.
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
  const existe = await knex.schema.hasTable('vialidades');
  if (!existe) {
    await knex.schema.createTable('vialidades', (t) => {
      t.string('id', 64).collate(colacion).primary();
      t.string('municipio_id', 64)
        .collate(colacion)
        .notNullable()
        .references('id')
        .inTable('municipios')
        .onDelete('CASCADE');
      t.string('nombre', 160).notNullable().defaultTo('');
      t.string('clave', 160).notNullable().defaultTo('');
      t.string('tipo', 40).notNullable().defaultTo('calle');
      t.text('geometria', 'longtext').notNullable();
      t.string('fuente', 120).notNullable().defaultTo('manual');
      t.timestamp('actualizado_en').notNullable().defaultTo(knex.fn.now());
      t.index(['municipio_id']);
      t.index(['municipio_id', 'clave']);
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('vialidades');
}
