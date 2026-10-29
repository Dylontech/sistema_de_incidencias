/** Sesiones activas para monitoreo y revocación (IP solo en hash). */
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
  if (await knex.schema.hasTable('sesiones_usuario')) return;

  await knex.schema.createTable('sesiones_usuario', (t) => {
    t.charset('utf8mb4');
    t.collate(colacion);
    t.string('id', 64).notNullable().primary();
    t.string('usuario_id', 64).nullable();
    t.string('user_key', 120).nullable();
    t.string('rol', 30).nullable();
    t.string('municipio_id', 64).nullable();
    t.string('ip_hash', 64).nullable();
    t.string('user_agent', 200).nullable();
    t.datetime('inicio', { precision: 3 }).defaultTo(knex.fn.now());
    t.datetime('ultima_actividad', { precision: 3 }).defaultTo(knex.fn.now());
    t.datetime('cerrada_en', { precision: 3 }).nullable();
    t.string('motivo_cierre', 160).nullable();
    t.index(['user_key']);
    t.index(['ultima_actividad']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('sesiones_usuario');
}
