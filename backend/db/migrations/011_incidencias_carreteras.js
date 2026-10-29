/**
 * Incidencias viales: carreteras estatales/federales, autopistas y caminos.
 *
 * El modelo sigue siendo de punto (lat/lng), pero añade el ámbito y los datos
 * de la vía. Para los ámbitos no urbanos el punto puede caer fuera del polígono
 * municipal: se guarda el municipio de referencia elegido por el usuario y la
 * entidad federativa derivada de él.
 */
export async function up(knex) {
  if (!(await knex.schema.hasColumn('incidencias', 'ambito'))) {
    await knex.schema.alterTable('incidencias', (t) => {
      t.enum('ambito', [
        'urbano',
        'carretera_estatal',
        'carretera_federal',
        'autopista',
        'camino_rural',
        'otro'
      ])
        .notNullable()
        .defaultTo('urbano');
      t.enum('jurisdiccion', ['municipal', 'estatal', 'federal', 'concesionada']).nullable();
      t.string('via_nombre', 160).nullable();
      t.string('via_clave', 40).nullable();
      t.decimal('kilometro', 8, 2).nullable();
      t.string('sentido', 40).nullable();
      t.string('tramo', 160).nullable();
      t.string('dependencia', 160).nullable();
      t.index('ambito');
    });
  }
}

export async function down(knex) {
  if (!(await knex.schema.hasColumn('incidencias', 'ambito'))) return;
  await knex.schema.alterTable('incidencias', (t) => {
    t.dropIndex('ambito');
    t.dropColumn('ambito');
    t.dropColumn('jurisdiccion');
    t.dropColumn('via_nombre');
    t.dropColumn('via_clave');
    t.dropColumn('kilometro');
    t.dropColumn('sentido');
    t.dropColumn('tramo');
    t.dropColumn('dependencia');
  });
}
