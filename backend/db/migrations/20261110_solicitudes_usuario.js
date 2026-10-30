/**
 * Solicitudes de alta de cuentas y teléfono de contacto.
 *
 * Un funcionario con `crear_usuarios` ya no crea cuentas directamente: rellena
 * el formulario con los datos de la persona (nombre, usuario, correo y
 * teléfono) y la administración decide. Al aprobarla se crea la cuenta como
 * funcionario en los municipios del solicitante y la contraseña temporal se
 * entrega a quien la pidió.
 *
 * `usuarios.telefono` guarda el dato de contacto de la cuenta; es opcional y no
 * se usa para entrar.
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

  if (
    (await knex.schema.hasTable('usuarios')) &&
    !(await knex.schema.hasColumn('usuarios', 'telefono'))
  ) {
    await knex.raw(
      `ALTER TABLE usuarios ADD COLUMN telefono VARCHAR(40) COLLATE ${colacion} NULL`
    );
  }

  if (!(await knex.schema.hasTable('solicitudes_usuario'))) {
    await knex.schema.createTable('solicitudes_usuario', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('username', 60).notNullable();
      t.string('nombre', 160).notNullable();
      t.string('correo', 160).nullable();
      t.string('telefono', 40).nullable();
      t.string('notas', 600).nullable();
      t.text('municipios').nullable();
      t.enum('estado', ['pendiente', 'aprobada', 'rechazada'])
        .notNullable()
        .defaultTo('pendiente');
      t.string('solicitado_por_id', 64).nullable();
      t.string('solicitado_por', 120).nullable();
      t.string('resuelto_por', 120).nullable();
      t.datetime('resuelto_en', { precision: 3 }).nullable();
      t.string('respuesta', 600).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.index(['estado', 'creado_en'], 'solicitud_usuario_estado_idx');
      t.index(['solicitado_por_id'], 'solicitud_usuario_solicitante_idx');
      t.index(['username'], 'solicitud_usuario_username_idx');
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('solicitudes_usuario')) {
    await knex.schema.dropTable('solicitudes_usuario');
  }
  if (
    (await knex.schema.hasTable('usuarios')) &&
    (await knex.schema.hasColumn('usuarios', 'telefono'))
  ) {
    await knex.raw('ALTER TABLE usuarios DROP COLUMN telefono');
  }
}
