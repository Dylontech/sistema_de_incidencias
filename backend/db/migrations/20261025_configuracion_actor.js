/** Auditoría de quién cambió cada clave de configuración. */
export async function up(knex) {
  if (!(await knex.schema.hasColumn('configuracion', 'actualizado_por'))) {
    await knex.raw('ALTER TABLE configuracion ADD COLUMN actualizado_por VARCHAR(120) NULL');
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('configuracion', 'actualizado_por')) {
    await knex.schema.alterTable('configuracion', (t) => t.dropColumn('actualizado_por'));
  }
}
