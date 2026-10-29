/** Archivos adjuntos de mensajería y comentarios, con contexto y propietario. */
export async function up(knex) {
  if (!(await knex.schema.hasTable('adjuntos'))) {
    await knex.schema.createTable('adjuntos', (t) => {
      t.string('id', 64).primary();
      t.string('archivo', 255).notNullable();
      t.string('nombre_original', 255).notNullable();
      t.string('tipo', 100).notNullable();
      t.bigInteger('tamano').unsigned().notNullable().defaultTo(0);
      t.string('hash_sha256', 64).nullable();
      t.string('proposito', 30).notNullable().defaultTo('chat');
      t.string('subido_por_usuario_id', 64).nullable();
      t.string('subido_por_user_key', 120).nullable();
      t.string('contexto_tipo', 40).nullable();
      t.string('contexto_id', 64).nullable();
      t.string('estado', 20).notNullable().defaultTo('pendiente');
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.datetime('vinculado_en', { precision: 3 }).nullable();
      t.boolean('simulado').notNullable().defaultTo(false);
      t.string('simulacion_id', 64).nullable();
      t.index(['contexto_tipo', 'contexto_id'], 'adjuntos_contexto_idx');
      t.index(['subido_por_usuario_id', 'creado_en'], 'adjuntos_autor_idx');
      t.index(['estado', 'creado_en'], 'adjuntos_estado_idx');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('adjuntos');
}
