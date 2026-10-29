/**
 * Campañas de promoción por correo con consentimiento (doble opt-in) y baja
 * en un clic, conforme a la LFPDPPP.
 */

export async function up(knex) {
  if (!(await knex.schema.hasTable('suscripciones_correo'))) {
    await knex.schema.createTable('suscripciones_correo', (t) => {
      t.string('id', 64).primary();
      t.string('correo', 160).notNullable().unique();
      t.string('nombre', 120).nullable();
      t.string('municipio_id', 64).nullable();
      t.enum('estado', ['pendiente', 'activa', 'baja'])
        .notNullable()
        .defaultTo('pendiente');
      // Token único para confirmar el alta y para darse de baja.
      t.string('token', 64).notNullable().unique();
      t.string('origen', 40).nullable();
      t.datetime('confirmado_en', { precision: 3 }).nullable();
      t.datetime('baja_en', { precision: 3 }).nullable();
      t.string('ip_hash', 64).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      t.datetime('actualizado_en', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      t.index('estado');
      t.index('municipio_id');
    });
  }

  if (!(await knex.schema.hasTable('campanas_correo'))) {
    await knex.schema.createTable('campanas_correo', (t) => {
      t.string('id', 64).primary();
      t.string('nombre', 160).notNullable();
      t.string('asunto', 200).notNullable();
      t.text('html', 'longtext').notNullable();
      t.text('texto', 'longtext').nullable();
      // Segmento serializado: { todos, municipioId, estado }.
      t.text('segmento', 'longtext').nullable();
      t.enum('estado', ['borrador', 'enviando', 'enviada', 'cancelada'])
        .notNullable()
        .defaultTo('borrador');
      t.integer('total').notNullable().defaultTo(0);
      t.integer('enviados').notNullable().defaultTo(0);
      t.integer('errores').notNullable().defaultTo(0);
      t.string('creado_por', 120).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      t.datetime('enviada_en', { precision: 3 }).nullable();
      t.index('estado');
      t.index('creado_en');
    });
  }

  if (!(await knex.schema.hasTable('campana_destinatarios'))) {
    await knex.schema.createTable('campana_destinatarios', (t) => {
      t.string('id', 64).primary();
      t.string('campana_id', 64).notNullable();
      t.string('correo', 160).notNullable();
      t.string('suscripcion_id', 64).nullable();
      t.string('token_baja', 64).nullable();
      t.enum('estado', ['pendiente', 'enviado', 'error', 'omitido'])
        .notNullable()
        .defaultTo('pendiente');
      t.string('error', 400).nullable();
      t.datetime('enviado_en', { precision: 3 }).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      t.foreign('campana_id').references('id').inTable('campanas_correo').onDelete('CASCADE');
      t.unique(['campana_id', 'correo']);
      t.index('campana_id');
      t.index('estado');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('campana_destinatarios');
  await knex.schema.dropTableIfExists('campanas_correo');
  await knex.schema.dropTableIfExists('suscripciones_correo');
}
