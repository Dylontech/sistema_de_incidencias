/**
 * Vialidades con polígonos de calzada, eje para el degradado y ancho.
 *
 * `geometria` puede ser LineString, MultiLineString, Polygon o MultiPolygon.
 * `eje` conserva la línea de referencia para calcular el color por subtramo.
 * Las columnas se añaden de forma idempotente para instalaciones existentes.
 */
const COLUMNAS = [
  ['eje', 'LONGTEXT NULL'],
  ['ancho_m', 'DECIMAL(6,2) NULL'],
  ['bbox', 'VARCHAR(120) NULL'],
  ['geometria_tipo', 'VARCHAR(24) NULL'],
  ['osm_id', 'VARCHAR(64) NULL']
];

async function tieneColumna(knex, tabla, columna) {
  return knex.schema.hasColumn(tabla, columna);
}

async function tieneIndice(knex, tabla, indice) {
  const filas = await knex.raw(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [knex.client.config.connection.database, tabla, indice]
  );
  return Boolean(filas?.[0]?.length);
}

export async function up(knex) {
  for (const [columna, tipo] of COLUMNAS) {
    if (!(await tieneColumna(knex, 'vialidades', columna))) {
      await knex.raw(`ALTER TABLE vialidades ADD COLUMN ${columna} ${tipo}`);
    }
  }
  if (!(await tieneIndice(knex, 'vialidades', 'vialidades_municipio_osm_idx'))) {
    await knex.raw(
      'ALTER TABLE vialidades ADD INDEX vialidades_municipio_osm_idx (municipio_id, osm_id)'
    );
  }
}

export async function down(knex) {
  if (await tieneIndice(knex, 'vialidades', 'vialidades_municipio_osm_idx')) {
    await knex.raw('ALTER TABLE vialidades DROP INDEX vialidades_municipio_osm_idx');
  }
  for (const [columna] of COLUMNAS) {
    if (await tieneColumna(knex, 'vialidades', columna)) {
      await knex.raw(`ALTER TABLE vialidades DROP COLUMN ${columna}`);
    }
  }
}
