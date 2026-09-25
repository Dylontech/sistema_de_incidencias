/**
 * Migración 005 — marca de peligro.
 *
 * El personal del municipio puede señalar un reporte como peligroso para que el
 * panel de administración lo destaque por encima del resto: se guarda quién lo
 * marcó, cuándo y por qué.
 */
export async function up(knex) {
  await knex.schema.alterTable('incidencias', (t) => {
    t.boolean('peligrosa').notNullable().defaultTo(false);
    t.string('peligrosa_por', 120).nullable();
    t.datetime('peligrosa_fecha', { precision: 3 }).nullable();
    t.string('peligrosa_motivo', 140).nullable();
    t.index(['peligrosa', 'estado']);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('incidencias', (t) => {
    t.dropIndex(['peligrosa', 'estado']);
    t.dropColumn('peligrosa');
    t.dropColumn('peligrosa_por');
    t.dropColumn('peligrosa_fecha');
    t.dropColumn('peligrosa_motivo');
  });
}
