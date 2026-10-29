/**
 * Contacto directo a funcionarios de un municipio.
 *
 * El ciudadano elige estado, municipio y uno o varios funcionarios. No se
 * piden nombre, correo ni teléfono: la cuenta autenticada es la identidad.
 * Si el municipio no tiene funcionarios se crea una solicitud de mediación
 * para el administrador.
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

  if (!(await knex.schema.hasTable('contactos_funcionarios'))) {
    await knex.schema.createTable('contactos_funcionarios', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('folio', 32).notNullable().unique();
      t.string('de_usuario_id', 64).nullable();
      t.string('de_user_key', 120).nullable();
      t.string('de_nombre', 120).notNullable();
      t.string('estado_entidad', 120).nullable();
      t.string('municipio_id', 64).nullable();
      t.string('asunto', 160).notNullable();
      t.text('mensaje', 'longtext').notNullable();
      t.enum('estado', ['nuevo', 'leido', 'respondido', 'cerrado'])
        .notNullable()
        .defaultTo('nuevo');
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.boolean('simulado').notNullable().defaultTo(false);
      t.string('simulacion_id', 64).nullable();

      t.foreign('de_usuario_id', 'contacto_func_usuario_fk')
        .references('id')
        .inTable('usuarios')
        .onDelete('SET NULL');
      t.index(['municipio_id', 'estado'], 'contacto_func_muni_idx');
      t.index(['de_usuario_id', 'creado_en'], 'contacto_func_autor_idx');
      t.index(['simulado'], 'contacto_func_sim_idx');
    });
  }

  if (!(await knex.schema.hasTable('contacto_funcionario_destinatarios'))) {
    await knex.schema.createTable('contacto_funcionario_destinatarios', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('contacto_id', 64).notNullable();
      t.string('usuario_id', 64).notNullable();
      t.datetime('leido_en', { precision: 3 }).nullable();
      t.datetime('respondido_en', { precision: 3 }).nullable();

      t.primary(['contacto_id', 'usuario_id']);
      t.foreign('contacto_id', 'contacto_dest_contacto_fk')
        .references('id')
        .inTable('contactos_funcionarios')
        .onDelete('CASCADE');
      t.foreign('usuario_id', 'contacto_dest_usuario_fk')
        .references('id')
        .inTable('usuarios')
        .onDelete('CASCADE');
    });
  }

  if (!(await knex.schema.hasTable('contacto_funcionario_mensajes'))) {
    await knex.schema.createTable('contacto_funcionario_mensajes', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('contacto_id', 64).notNullable();
      t.string('de_usuario_id', 64).nullable();
      t.string('de_nombre', 120).notNullable();
      t.text('cuerpo', 'longtext').notNullable();
      t.boolean('interno').notNullable().defaultTo(false);
      t.datetime('creado_en', { precision: 3 }).notNullable();

      t.foreign('contacto_id', 'contacto_msg_contacto_fk')
        .references('id')
        .inTable('contactos_funcionarios')
        .onDelete('CASCADE');
      t.index(['contacto_id', 'creado_en'], 'contacto_msg_fecha_idx');
    });
  }

  if (!(await knex.schema.hasTable('solicitudes_funcionario'))) {
    await knex.schema.createTable('solicitudes_funcionario', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('folio', 32).notNullable().unique();
      t.string('municipio_id', 64).nullable();
      t.string('estado_entidad', 120).nullable();
      t.string('solicitado_por_usuario_id', 64).nullable();
      t.string('solicitado_por_user_key', 120).nullable();
      t.text('mensaje', 'longtext').nullable();
      t.enum('estado', ['pendiente', 'atendida', 'rechazada'])
        .notNullable()
        .defaultTo('pendiente');
      t.string('atendido_por', 120).nullable();
      t.datetime('atendido_en', { precision: 3 }).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();

      t.foreign('solicitado_por_usuario_id', 'solicitud_func_usuario_fk')
        .references('id')
        .inTable('usuarios')
        .onDelete('SET NULL');
      t.index(['estado', 'creado_en'], 'solicitud_func_estado_idx');
      t.index(['municipio_id'], 'solicitud_func_muni_idx');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('solicitudes_funcionario');
  await knex.schema.dropTableIfExists('contacto_funcionario_mensajes');
  await knex.schema.dropTableIfExists('contacto_funcionario_destinatarios');
  await knex.schema.dropTableIfExists('contactos_funcionarios');
}
