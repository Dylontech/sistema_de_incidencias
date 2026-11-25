/** Control de concurrencia e idempotencia garantizados por el almacenamiento. */
export async function up(knex) {
  if (!(await knex.schema.hasColumn('incidencias', 'revision'))) {
    await knex.schema.alterTable('incidencias', (t) => {
      t.integer('revision').unsigned().notNullable().defaultTo(0);
    });
  }
  // Conservar todos los reportes existentes. Solo la primera incidencia retiene
  // una clave repetida; las demás dejan de participar en la deduplicación.
  const duplicadas = await knex('incidencias')
    .select('user_key', 'clave_idempotencia')
    .whereNotNull('clave_idempotencia')
    .groupBy('user_key', 'clave_idempotencia').havingRaw('COUNT(*) > 1');
  for (const grupo of duplicadas) {
    const filas = await knex('incidencias').where(grupo).select('id').orderBy('fecha').orderBy('id');
    await knex('incidencias').whereIn('id', filas.slice(1).map((f) => f.id))
      .update({ clave_idempotencia: null });
  }
  await knex.schema.alterTable('incidencias', (t) => {
    t.unique(['user_key', 'clave_idempotencia'], 'incidencias_usuario_idempotencia_unique');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('incidencias', (t) => {
    t.dropUnique(['user_key', 'clave_idempotencia'], 'incidencias_usuario_idempotencia_unique');
    t.dropColumn('revision');
  });
}
