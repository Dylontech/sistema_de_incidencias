/**
 * Solicitudes públicas de informes, bloqueos de solicitantes y bitácora de
 * correos.
 *
 * El ciudadano no genera el informe: lo solicita con sus datos de contacto, lo
 * confirma por correo (doble opt-in) y el servidor se lo envía. Los bloqueos
 * son reversibles y pueden caducar.
 */
export async function up(knex) {
  if (!(await knex.schema.hasTable('solicitudes_informe'))) {
    await knex.schema.createTable('solicitudes_informe', (t) => {
      t.string('id', 64).primary();
      t.string('folio', 24).notNullable().unique();
      t.string('nombre', 120).notNullable();
      t.string('correo', 160).notNullable();
      t.string('telefono', 40).nullable();
      t.string('municipio_id', 64).nullable();
      t.string('estado_entidad', 120).nullable();
      t.string('ambito', 40).notNullable().defaultTo('todos');
      t.datetime('desde', { precision: 3 }).nullable();
      t.datetime('hasta', { precision: 3 }).nullable();
      t.text('tipos', 'longtext').nullable();
      t.enum('formato', ['pdf', 'csv']).notNullable().defaultTo('pdf');
      t.text('mensaje', 'longtext').nullable();
      t.enum('estado', [
        'pendiente_verificacion',
        'pendiente',
        'procesando',
        'enviada',
        'error',
        'rechazada'
      ])
        .notNullable()
        .defaultTo('pendiente_verificacion');
      t.string('token_verificacion', 64).nullable();
      t.datetime('verificado_en', { precision: 3 }).nullable();
      t.integer('intentos').notNullable().defaultTo(0);
      t.text('error', 'longtext').nullable();
      t.string('ip_hash', 64).nullable();
      t.string('user_agent', 255).nullable();
      t.boolean('acepta_terminos').notNullable().defaultTo(false);
      t.datetime('creado_en', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      t.datetime('procesado_en', { precision: 3 }).nullable();
      t.index('correo');
      t.index('estado');
      t.index(['estado', 'creado_en']);
    });
  }

  if (!(await knex.schema.hasTable('bloqueos_publicos'))) {
    await knex.schema.createTable('bloqueos_publicos', (t) => {
      t.string('id', 64).primary();
      t.string('correo', 160).nullable();
      t.string('ip_hash', 64).nullable();
      t.string('motivo', 300).notNullable();
      t.boolean('activo').notNullable().defaultTo(true);
      t.datetime('hasta', { precision: 3 }).nullable();
      t.string('creado_por', 120).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      t.index('correo');
      t.index('ip_hash');
      t.index('activo');
    });
  }

  if (!(await knex.schema.hasTable('envios_correo'))) {
    await knex.schema.createTable('envios_correo', (t) => {
      t.string('id', 64).primary();
      t.string('para', 160).notNullable();
      t.string('asunto', 200).notNullable();
      t.string('tipo', 60).notNullable().defaultTo('general');
      t.enum('estado', ['enviado', 'simulado', 'error']).notNullable();
      t.text('error', 'longtext').nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      t.index('para');
      t.index('creado_en');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('envios_correo');
  await knex.schema.dropTableIfExists('bloqueos_publicos');
  await knex.schema.dropTableIfExists('solicitudes_informe');
}
