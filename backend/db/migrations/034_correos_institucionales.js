/** Directorio de correos institucionales de municipios y del estado. */
export async function up(knex) {
  if (!(await knex.schema.hasTable('correos_institucionales'))) {
    await knex.schema.createTable('correos_institucionales', (t) => {
      t.string('id', 64).primary();
      t.string('estado', 120).notNullable();
      t.string('municipio_id', 64).nullable();
      t.string('entidad', 160).notNullable();
      t.string('dependencia', 160).nullable();
      t.string('cargo', 120).nullable();
      t.string('correo', 160).notNullable();
      t.string('telefono', 40).nullable();
      t.string('fuente_url', 500).nullable();
      t.boolean('verificado').notNullable().defaultTo(false);
      t.text('notas', 'longtext').nullable();
      t.datetime('invitado_en', { precision: 3 }).nullable();
      t.datetime('ultima_invitacion_en', { precision: 3 }).nullable();
      t.string('creado_por', 120).nullable();
      t.datetime('actualizado_en', { precision: 3 }).notNullable();
      t.boolean('simulado').notNullable().defaultTo(false);
      t.string('simulacion_id', 64).nullable();

      t.unique(['municipio_id', 'correo'], 'correo_inst_muni_correo_uq');
      t.index(['estado', 'municipio_id'], 'correo_inst_estado_idx');
      t.index(['verificado'], 'correo_inst_verificado_idx');
      t.index(['simulado'], 'correo_inst_sim_idx');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('correos_institucionales');
}
