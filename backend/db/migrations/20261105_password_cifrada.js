/**
 * Contraseña consultable y solicitudes de cambio.
 *
 * `usuarios.password_cifrada` guarda una copia cifrada (AES-256-GCM) de la
 * contraseña para que un administrador pueda consultarla o restablecerla, con
 * registro obligatorio en auditoría. El hash bcrypt de `password_hash` sigue
 * siendo la única fuente para verificar el acceso.
 *
 * Las cuentas creadas antes de esta migración quedan con `password_cifrada`
 * en NULL: su contraseña no se puede recuperar (bcrypt es irreversible) y el
 * panel ofrece restablecerla.
 *
 * `solicitudes_password` registra las peticiones del personal para que el
 * administrador cambie su contraseña.
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
    !(await knex.schema.hasColumn('usuarios', 'password_cifrada'))
  ) {
    await knex.schema.alterTable('usuarios', (t) => {
      t.text('password_cifrada').nullable();
    });
  }

  if (!(await knex.schema.hasTable('solicitudes_password'))) {
    await knex.schema.createTable('solicitudes_password', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('usuario_id', 64).notNullable();
      t.string('username', 120).notNullable();
      t.string('nombre', 160).nullable();
      t.string('motivo', 600).notNullable();
      t.enum('estado', ['pendiente', 'resuelta', 'rechazada'])
        .notNullable()
        .defaultTo('pendiente');
      t.string('resuelto_por', 120).nullable();
      t.datetime('resuelto_en', { precision: 3 }).nullable();
      t.string('respuesta', 600).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.foreign('usuario_id').references('usuarios.id').onDelete('CASCADE');
      t.index(['estado', 'creado_en'], 'solicitud_password_estado_idx');
      t.index(['usuario_id'], 'solicitud_password_usuario_idx');
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('solicitudes_password')) {
    await knex.schema.dropTable('solicitudes_password');
  }
  if (
    (await knex.schema.hasTable('usuarios')) &&
    (await knex.schema.hasColumn('usuarios', 'password_cifrada'))
  ) {
    await knex.schema.alterTable('usuarios', (t) => {
      t.dropColumn('password_cifrada');
    });
  }
}
