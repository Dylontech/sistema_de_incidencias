/**
 * Migración 004 — catálogo geográfico del INEGI.
 *
 * Los municipios y sus comunidades (localidades) se generan con
 * `scripts/importar-inegi.mjs`, que añade población y cabecera al municipio y
 * ámbito, clave geoestadística y población a cada zona. El tipo `localidad`
 * entra en el enum porque es el nombre que el INEGI da a las comunidades.
 */
export async function up(knex) {
  await knex.schema.alterTable('municipios', (t) => {
    t.integer('poblacion').notNullable().defaultTo(0);
    t.string('cabecera', 160).nullable();
  });

  await knex.schema.alterTable('zonas', (t) => {
    t.enum('tipo', ['localidad', 'colonia', 'tenencia', 'zona', 'municipio'])
      .notNullable()
      .defaultTo('localidad')
      .alter();
    t.string('ambito', 10).nullable();
    t.string('clave', 32).nullable();
    t.integer('poblacion').notNullable().defaultTo(0);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('zonas', (t) => {
    t.enum('tipo', ['colonia', 'tenencia', 'zona']).notNullable().defaultTo('zona').alter();
    t.dropColumn('ambito');
    t.dropColumn('clave');
    t.dropColumn('poblacion');
  });

  await knex.schema.alterTable('municipios', (t) => {
    t.dropColumn('poblacion');
    t.dropColumn('cabecera');
  });
}
