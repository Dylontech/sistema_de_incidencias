/**
 * Claves con alcance estatal, clave asociada a cada sesión y bitácora de
 * auditoría de acciones.
 *
 * - `clave_acceso_estados`: una clave puede cubrir estados completos; los
 *   municipios se expanden al validar la clave, de modo que también incluya
 *   municipios importados después.
 * - `sesiones_usuario.clave_id`: permite saber con qué clave entró cada sesión
 *   y cerrar todas las sesiones de una clave al eliminarla.
 * - `auditoria`: registro de cada petición mutadora, con actor, permisos,
 *   clave, ruta, resultado y huella de IP.
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

  if (!(await knex.schema.hasTable('clave_acceso_estados'))) {
    await knex.schema.createTable('clave_acceso_estados', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('clave_id', 64).notNullable();
      t.string('estado', 120).notNullable();
      t.primary(['clave_id', 'estado']);
      t.foreign('clave_id').references('claves_acceso.id').onDelete('CASCADE');
    });
  }

  if (await knex.schema.hasTable('sesiones_usuario')) {
    if (!(await knex.schema.hasColumn('sesiones_usuario', 'clave_id'))) {
      await knex.schema.alterTable('sesiones_usuario', (t) => {
        t.string('clave_id', 64).nullable();
      });
    }
    const indices = await knex.raw(
      `SHOW INDEX FROM sesiones_usuario WHERE Key_name = 'sesiones_usuario_clave_id_index'`
    );
    const filas = Array.isArray(indices) ? indices[0] : [];
    if (!filas?.length) {
      await knex.raw(
        'ALTER TABLE sesiones_usuario ADD INDEX sesiones_usuario_clave_id_index (clave_id)'
      );
    }
  }

  if (!(await knex.schema.hasTable('auditoria'))) {
    await knex.schema.createTable('auditoria', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).notNullable().primary();
      t.string('usuario_id', 64).nullable();
      t.string('username', 120).nullable();
      t.string('user_key', 120).nullable();
      t.string('rol', 30).nullable();
      t.string('clave_id', 64).nullable();
      t.string('metodo', 10).notNullable();
      t.string('ruta', 240).notNullable();
      t.integer('estado_http').nullable();
      t.string('accion', 160).nullable();
      t.string('entidad', 80).nullable();
      t.string('entidad_id', 120).nullable();
      t.text('detalle').nullable();
      t.string('ip_hash', 64).nullable();
      t.string('user_agent', 200).nullable();
      t.datetime('creado_en', { precision: 3 }).defaultTo(knex.fn.now());
      t.index(['creado_en']);
      t.index(['username']);
      t.index(['clave_id']);
      t.index(['ruta']);
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('auditoria');
  await knex.schema.dropTableIfExists('clave_acceso_estados');
  if (await knex.schema.hasTable('sesiones_usuario')) {
    if (await knex.schema.hasColumn('sesiones_usuario', 'clave_id')) {
      await knex.schema.alterTable('sesiones_usuario', (t) => {
        t.dropColumn('clave_id');
      });
    }
  }
}
