/** Publicaciones generadas para redes sociales (sin envío por API). */
export async function up(knex) {
  if (!(await knex.schema.hasTable('publicaciones_redes'))) {
    await knex.schema.createTable('publicaciones_redes', (t) => {
      t.string('id', 64).primary();
      t.enum('red', ['facebook', 'instagram', 'tiktok', 'whatsapp', 'x']).notNullable();
      t.string('plantilla', 80).notNullable();
      t.string('municipio_id', 64).nullable();
      t.string('titulo', 160).notNullable();
      t.text('texto', 'longtext').notNullable();
      t.string('hashtags', 300).nullable();
      t.string('enlace', 500).nullable();
      t.string('imagen_url', 500).nullable();
      t.string('qr_url', 500).nullable();
      t.enum('estado', ['borrador', 'lista', 'archivada']).notNullable().defaultTo('borrador');
      t.string('creado_por', 120).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.boolean('simulado').notNullable().defaultTo(false);
      t.string('simulacion_id', 64).nullable();

      t.index(['red', 'creado_en'], 'pub_red_fecha_idx');
      t.index(['municipio_id'], 'pub_muni_idx');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('publicaciones_redes');
}
