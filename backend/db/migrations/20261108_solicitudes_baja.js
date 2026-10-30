/**
 * Solicitudes de baja de cuentas del personal.
 *
 * Un funcionario con `editar_usuarios` ya no puede desactivar cuentas: solicita
 * la baja y la resuelve la administración de su ámbito. La tabla guarda el
 * motivo, quién la pidió y el resultado.
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
  if (await knex.schema.hasTable('solicitudes_baja')) return;
  const colacion = await colacionDeUsuarios(knex);
  await knex.schema.createTable('solicitudes_baja', (t) => {
    t.charset('utf8mb4');
    t.collate(colacion);
    t.string('id', 64).primary();
    t.string('usuario_id', 64).notNullable();
    t.string('username', 120).notNullable();
    t.string('nombre', 160).nullable();
    t.string('solicitado_por_id', 64).nullable();
    t.string('solicitado_por', 120).nullable();
    t.string('motivo', 600).notNullable();
    t.enum('estado', ['pendiente', 'aprobada', 'rechazada']).notNullable().defaultTo('pendiente');
    t.string('resuelto_por', 120).nullable();
    t.datetime('resuelto_en', { precision: 3 }).nullable();
    t.string('respuesta', 600).nullable();
    t.datetime('creado_en', { precision: 3 }).notNullable();
    t.foreign('usuario_id').references('usuarios.id').onDelete('CASCADE');
    t.index(['estado', 'creado_en'], 'solicitud_baja_estado_idx');
    t.index(['usuario_id'], 'solicitud_baja_usuario_idx');
  });
}

export async function down(knex) {
  if (await knex.schema.hasTable('solicitudes_baja')) {
    await knex.schema.dropTable('solicitudes_baja');
  }
}
