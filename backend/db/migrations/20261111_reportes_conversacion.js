/**
 * Reportes de conversación y restricción de mensajes.
 *
 * `reportes_conversacion` guarda una copia de los últimos mensajes (con sus
 * adjuntos) para que la moderación pueda decidir aunque el autor borre el
 * contenido. `restricciones_mensajes` bloquea el envío de mensajes de una
 * cuenta con vigencia opcional, igual que `restricciones_comentarios`.
 *
 * Las columnas denormalizadas en `usuarios` permiten resolver el estado sin
 * consultar la tabla en cada envío.
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

  if (!(await knex.schema.hasTable('reportes_conversacion'))) {
    await knex.schema.createTable('reportes_conversacion', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.datetime('fecha', { precision: 3 }).notNullable();
      t.string('municipio_id', 64).nullable();
      t.string('canal', 20).notNullable();
      t.string('conversacion_id', 120).notNullable();
      t.string('conversacion_asunto', 160).nullable();
      t.string('objetivo_user_key', 64).nullable();
      t.string('objetivo_username', 120).nullable();
      t.string('objetivo_nombre', 160).nullable();
      t.string('autor_user_key', 64).nullable();
      t.string('autor_username', 120).nullable();
      t.string('autor_nombre', 160).nullable();
      t.string('motivo', 60).notNullable();
      t.string('detalle', 600).nullable();
      t.text('mensajes').nullable();
      t.enum('estado', ['pendiente', 'resuelto', 'descartado', 'revertido'])
        .notNullable()
        .defaultTo('pendiente');
      t.string('accion', 40).nullable();
      t.string('resolucion', 600).nullable();
      t.string('resuelto_por', 120).nullable();
      t.datetime('resuelto_en', { precision: 3 }).nullable();
      t.string('revertido_por', 120).nullable();
      t.datetime('revertido_en', { precision: 3 }).nullable();
      t.text('sancion').nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.index(['estado', 'fecha'], 'reporte_conversacion_estado_idx');
      t.index(['municipio_id'], 'reporte_conversacion_municipio_idx');
      t.index(['conversacion_id'], 'reporte_conversacion_conversacion_idx');
    });
  }

  if (!(await knex.schema.hasTable('restricciones_mensajes'))) {
    await knex.schema.createTable('restricciones_mensajes', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('usuario_id', 64).notNullable();
      t.string('user_key', 64).nullable();
      t.string('motivo', 300).notNullable();
      t.datetime('hasta', { precision: 3 }).nullable();
      t.boolean('activo').notNullable().defaultTo(true);
      t.string('creado_por', 120).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.foreign('usuario_id').references('usuarios.id').onDelete('CASCADE');
      t.index(['usuario_id', 'activo'], 'restriccion_mensaje_usuario_idx');
    });
  }

  const columnas = [
    ['mensajes_restringidos', 'BOOLEAN NOT NULL DEFAULT 0'],
    ['mensajes_restringidos_hasta', 'DATETIME(3) NULL'],
    ['mensajes_restringidos_motivo', 'VARCHAR(300) NULL'],
    ['mensajes_restringidos_por', 'VARCHAR(120) NULL']
  ];
  for (const [columna, tipo] of columnas) {
    if (!(await knex.schema.hasColumn('usuarios', columna))) {
      await knex.raw(`ALTER TABLE usuarios ADD COLUMN ${columna} ${tipo}`);
    }
  }
}

export async function down(knex) {
  for (const columna of [
    'mensajes_restringidos',
    'mensajes_restringidos_hasta',
    'mensajes_restringidos_motivo',
    'mensajes_restringidos_por'
  ]) {
    if (await knex.schema.hasColumn('usuarios', columna)) {
      await knex.raw(`ALTER TABLE usuarios DROP COLUMN ${columna}`);
    }
  }
  if (await knex.schema.hasTable('restricciones_mensajes')) {
    await knex.schema.dropTable('restricciones_mensajes');
  }
  if (await knex.schema.hasTable('reportes_conversacion')) {
    await knex.schema.dropTable('reportes_conversacion');
  }
}
