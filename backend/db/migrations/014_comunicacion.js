/**
 * Comunicación: contacto ciudadano→funcionarios, sugerencias y mensajería
 * directa entre el personal (admin↔funcionario).
 */

export async function up(knex) {
  if (!(await knex.schema.hasTable('mensajes_contacto'))) {
    await knex.schema.createTable('mensajes_contacto', (t) => {
      t.string('id', 64).primary();
      t.string('folio', 24).notNullable().unique();
      t.string('municipio_id', 64).nullable();
      t.string('nombre', 120).notNullable();
      t.string('correo', 160).notNullable();
      t.string('telefono', 40).nullable();
      t.string('asunto', 160).notNullable();
      t.text('mensaje', 'longtext').notNullable();
      t.enum('estado', ['nuevo', 'en_revision', 'respondido', 'cerrado'])
        .notNullable()
        .defaultTo('nuevo');
      t.text('respuesta', 'longtext').nullable();
      t.string('respondido_por', 120).nullable();
      t.datetime('respondido_en', { precision: 3 }).nullable();
      t.string('ip_hash', 64).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      t.index('municipio_id');
      t.index('estado');
      t.index('correo');
    });
  }

  if (!(await knex.schema.hasTable('sugerencias'))) {
    await knex.schema.createTable('sugerencias', (t) => {
      t.string('id', 64).primary();
      t.string('folio', 24).notNullable().unique();
      t.enum('tipo', ['mejora', 'problema', 'contenido', 'otro']).notNullable().defaultTo('mejora');
      t.string('nombre', 120).nullable();
      t.string('correo', 160).nullable();
      t.text('mensaje', 'longtext').notNullable();
      t.enum('estado', ['nueva', 'en_revision', 'atendida', 'cerrada'])
        .notNullable()
        .defaultTo('nueva');
      t.text('respuesta', 'longtext').nullable();
      t.string('respondido_por', 120).nullable();
      t.datetime('respondido_en', { precision: 3 }).nullable();
      t.string('ip_hash', 64).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      t.index('estado');
      t.index('creado_en');
    });
  }

  if (!(await knex.schema.hasTable('mensajes_directos'))) {
    await knex.schema.createTable('mensajes_directos', (t) => {
      t.string('id', 64).primary();
      t.string('hilo', 64).notNullable();
      t.string('de_usuario', 120).notNullable();
      t.string('de_nombre', 120).notNullable();
      t.string('de_rol', 40).notNullable();
      t.string('para_usuario', 120).nullable();
      t.string('para_municipio', 64).nullable();
      t.string('para_estado', 120).nullable();
      t.string('asunto', 160).notNullable();
      t.text('cuerpo', 'longtext').notNullable();
      t.boolean('leido').notNullable().defaultTo(false);
      t.datetime('creado_en', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      t.index('hilo');
      t.index('para_usuario');
      t.index('de_usuario');
      t.index('leido');
      t.index('creado_en');
    });
  }

  // Nuevos tipos de notificación para la bandeja.
  await knex.raw(
    "ALTER TABLE notificaciones MODIFY tipo ENUM('reporte','resuelta','estado','alerta','comentario','mensaje','contacto','sugerencia','solicitud') NOT NULL"
  );
}

export async function down(knex) {
  await knex.raw(
    "ALTER TABLE notificaciones MODIFY tipo ENUM('reporte','resuelta','estado','alerta','comentario') NOT NULL"
  );
  await knex.schema.dropTableIfExists('mensajes_directos');
  await knex.schema.dropTableIfExists('sugerencias');
  await knex.schema.dropTableIfExists('mensajes_contacto');
}
