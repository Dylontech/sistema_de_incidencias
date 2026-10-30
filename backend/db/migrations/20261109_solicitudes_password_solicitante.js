/**
 * Solicitante de un cambio de contraseña.
 *
 * Hasta la V2.11 el cambio lo pedía el propio titular desde «Mi cuenta». Desde
 * la V2.11.2 un funcionario con `editar_usuarios` puede pedir el
 * restablecimiento de otra cuenta de su ámbito: hace falta saber quién lo pidió
 * para avisarle cuando la administración la resuelva y para entregarle la
 * contraseña nueva.
 *
 * Ambas columnas son nullable: las solicitudes anteriores siguen valiendo y se
 * interpretan como «las pidió el propio titular».
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
  if (!(await knex.schema.hasTable('solicitudes_password'))) return;
  const colacion = await colacionDeUsuarios(knex);

  if (!(await knex.schema.hasColumn('solicitudes_password', 'solicitado_por_id'))) {
    await knex.raw(
      `ALTER TABLE solicitudes_password ADD COLUMN solicitado_por_id VARCHAR(64) COLLATE ${colacion} NULL`
    );
  }
  if (!(await knex.schema.hasColumn('solicitudes_password', 'solicitado_por'))) {
    await knex.raw(
      `ALTER TABLE solicitudes_password ADD COLUMN solicitado_por VARCHAR(120) COLLATE ${colacion} NULL`
    );
  }
  await knex.raw(
    'ALTER TABLE solicitudes_password ADD INDEX solicitud_password_solicitante_idx (solicitado_por_id)'
  );
}

export async function down(knex) {
  if (!(await knex.schema.hasTable('solicitudes_password'))) return;
  try {
    await knex.raw('ALTER TABLE solicitudes_password DROP INDEX solicitud_password_solicitante_idx');
  } catch {
    // El índice puede no existir si la migración se interrumpió.
  }
  for (const columna of ['solicitado_por_id', 'solicitado_por']) {
    if (await knex.schema.hasColumn('solicitudes_password', columna)) {
      await knex.raw(`ALTER TABLE solicitudes_password DROP COLUMN ${columna}`);
    }
  }
}
