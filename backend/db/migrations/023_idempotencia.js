/** Clave de idempotencia para no duplicar un reporte reintentado offline. */
export async function up(knex) {
  if (!(await knex.schema.hasColumn('incidencias', 'clave_idempotencia'))) {
    await knex.schema.alterTable('incidencias', (t) => {
      t.string('clave_idempotencia', 80).nullable();
      t.index(['user_key', 'clave_idempotencia']);
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('incidencias', 'clave_idempotencia')) {
    await knex.schema.alterTable('incidencias', (t) => {
      t.dropColumn('clave_idempotencia');
    });
  }
}
