/**
 * Documentos legales editables: términos, privacidad y «Acerca de».
 *
 * Se guarda un borrador y una versión publicada por clave. El historial
 * conserva cada publicación para poder restaurar una versión anterior.
 */
async function colacionDeUsuarios(knex) {
  const resultado = await knex.raw(
    `SELECT COLLATION_NAME AS col FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'id'`
  );
  const filas = Array.isArray(resultado) ? resultado[0] : null;
  return filas?.[0]?.col || 'utf8mb4_unicode_ci';
}

export async function up(knex) {
  const colacion = await colacionDeUsuarios(knex);

  if (!(await knex.schema.hasTable('documentos_legales'))) {
    await knex.schema.createTable('documentos_legales', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('clave', 40).primary();
      t.string('titulo', 160).notNullable();
      t.text('html_publicado', 'longtext').nullable();
      t.integer('version_publicada').notNullable().defaultTo(0);
      t.string('publicado_por', 120).nullable();
      t.datetime('publicado_en', { precision: 3 }).nullable();
      t.text('html_borrador', 'longtext').nullable();
      t.string('actualizado_por', 120).nullable();
      t.datetime('actualizado_en', { precision: 3 }).nullable();
    });
  }

  if (!(await knex.schema.hasTable('documentos_legales_historial'))) {
    await knex.schema.createTable('documentos_legales_historial', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('clave', 40).notNullable();
      t.integer('version').notNullable();
      t.string('titulo', 160).notNullable();
      t.text('html', 'longtext').notNullable();
      t.string('publicado_por', 120).nullable();
      t.datetime('publicado_en', { precision: 3 }).notNullable();

      t.index(['clave', 'version'], 'legal_hist_clave_version_idx');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('documentos_legales_historial');
  await knex.schema.dropTableIfExists('documentos_legales');
}
