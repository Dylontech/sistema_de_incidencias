/**
 * Bloqueos entre cuentas y mensajes opcionales en los reportes de conversación.
 *
 * - `bloqueos_usuario` impide que la otra persona vuelva a enviar mensajes
 *   (directos o internos). Es una decisión personal, reversible y silenciosa:
 *   no genera avisos ni sanciones.
 * - `reportes_conversacion.incluye_mensajes` deja constancia de si el autor
 *   adjuntó la copia de los mensajes o solo la descripción.
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
  const colacion = await colacionDeUsuarios(knex);

  if (!(await knex.schema.hasTable('bloqueos_usuario'))) {
    await knex.schema.createTable('bloqueos_usuario', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('usuario_id', 64).notNullable();
      t.string('usuario_username', 120).nullable();
      t.string('bloqueado_id', 64).notNullable();
      t.string('bloqueado_username', 120).nullable();
      t.string('bloqueado_nombre', 160).nullable();
      t.string('motivo', 300).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.foreign('usuario_id').references('usuarios.id').onDelete('CASCADE');
      t.foreign('bloqueado_id').references('usuarios.id').onDelete('CASCADE');
      t.unique(['usuario_id', 'bloqueado_id'], { indexName: 'bloqueo_usuario_par_unico' });
      t.index(['bloqueado_id'], 'bloqueo_usuario_bloqueado_idx');
    });
  }

  if (!(await knex.schema.hasColumn('reportes_conversacion', 'incluye_mensajes'))) {
    await knex.raw(
      'ALTER TABLE reportes_conversacion ADD COLUMN incluye_mensajes BOOLEAN NOT NULL DEFAULT 1'
    );
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('reportes_conversacion', 'incluye_mensajes')) {
    await knex.raw('ALTER TABLE reportes_conversacion DROP COLUMN incluye_mensajes');
  }
  if (await knex.schema.hasTable('bloqueos_usuario')) {
    await knex.schema.dropTable('bloqueos_usuario');
  }
}
