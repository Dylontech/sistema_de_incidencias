/**
 * Índices para las consultas del mapa y de los informes.
 *
 * El listado filtra por municipio y ordena por fecha; el alcance estatal filtra
 * por `estado_entidad`; y los reportes viales se filtran por `ambito`.
 */
async function existeIndice(knex, tabla, nombre) {
  const [filas] = await knex.raw('SHOW INDEX FROM ?? WHERE Key_name = ?', [tabla, nombre]);
  return Array.isArray(filas) && filas.length > 0;
}

export async function up(knex) {
  const indices = [
    ['incidencias', 'incidencias_municipio_fecha_index', ['municipio_id', 'fecha']],
    ['incidencias', 'incidencias_estado_fecha_index', ['estado_entidad', 'fecha']],
    ['incidencias', 'incidencias_ambito_fecha_index', ['ambito', 'fecha']]
  ];

  for (const [tabla, nombre, columnas] of indices) {
    if (await existeIndice(knex, tabla, nombre)) continue;
    await knex.schema.alterTable(tabla, (t) => {
      t.index(columnas, nombre);
    });
  }
}

export async function down(knex) {
  const nombres = [
    'incidencias_municipio_fecha_index',
    'incidencias_estado_fecha_index',
    'incidencias_ambito_fecha_index'
  ];
  for (const nombre of nombres) {
    if (!(await existeIndice(knex, 'incidencias', nombre))) continue;
    await knex.schema.alterTable('incidencias', (t) => t.dropIndex(nombre));
  }
}
