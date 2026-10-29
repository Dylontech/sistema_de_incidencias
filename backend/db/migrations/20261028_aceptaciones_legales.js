/**
 * Aceptaciones de los términos y el aviso de privacidad.
 *
 * La aceptación es por identidad (`user_key`: usuario registrado o identidad
 * anónima del navegador) y guarda la pareja de versiones publicadas. Si el
 * administrador publica una versión nueva, la aceptación anterior deja de ser
 * vigente y el usuario debe aceptar otra vez.
 */
async function colacionDeUsuarios(knex) {
  try {
    const filas = await knex.raw(
      "SELECT COLLATION_NAME AS colacion FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'id' LIMIT 1",
      [knex.client.config.connection.database]
    );
    return filas?.[0]?.[0]?.colacion || 'utf8mb4_unicode_ci';
  } catch {
    return 'utf8mb4_unicode_ci';
  }
}

export async function up(knex) {
  if (await knex.schema.hasTable('aceptaciones_legales')) return;

  const colacion = await colacionDeUsuarios(knex);
  await knex.schema.createTable('aceptaciones_legales', (t) => {
    t.charset('utf8mb4');
    t.collate(colacion);
    t.string('id', 64).primary();
    t.string('usuario_id', 64).nullable();
    t.string('user_key', 120).notNullable();
    t.integer('version_terminos').notNullable();
    t.integer('version_privacidad').notNullable();
    t.datetime('aceptado_en', { precision: 3 }).notNullable();
    t.string('ip_hash', 64).nullable();
    t.string('user_agent', 255).nullable();
    t.foreign('usuario_id').references('usuarios.id').onDelete('CASCADE');
    t.index(['user_key', 'aceptado_en'], 'aceptacion_user_fecha_idx');
  });
}

export async function down(knex) {
  if (await knex.schema.hasTable('aceptaciones_legales')) {
    await knex.schema.dropTable('aceptaciones_legales');
  }
}
