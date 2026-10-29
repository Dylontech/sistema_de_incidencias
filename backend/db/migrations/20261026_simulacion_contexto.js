/** Contexto de la sesión de simulación: municipio, usuarios y datos iniciales. */
export async function up(knex) {
  const tabla = 'simulacion_sesiones';
  if (!(await knex.schema.hasTable(tabla))) return;

  const columnas = [
    ['municipio_id', (t) => t.string('municipio_id', 64).nullable()],
    ['usuario_simulado', (t) => t.string('usuario_simulado', 120).nullable()],
    ['usuario_incidencia', (t) => t.string('usuario_incidencia', 120).nullable()],
    ['incidencia_simulada_id', (t) => t.string('incidencia_simulada_id', 64).nullable()],
    ['datos', (t) => t.text('datos', 'longtext').nullable()]
  ];

  for (const [nombre, agregar] of columnas) {
    if (!(await knex.schema.hasColumn(tabla, nombre))) {
      await knex.schema.alterTable(tabla, (t) => agregar(t));
    }
  }
}

export async function down(knex) {
  const tabla = 'simulacion_sesiones';
  if (!(await knex.schema.hasTable(tabla))) return;
  for (const nombre of [
    'municipio_id',
    'usuario_simulado',
    'usuario_incidencia',
    'incidencia_simulada_id',
    'datos'
  ]) {
    if (await knex.schema.hasColumn(tabla, nombre)) {
      await knex.schema.alterTable(tabla, (t) => t.dropColumn(nombre));
    }
  }
}
