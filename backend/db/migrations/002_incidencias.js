/**
 * Migración 002 — incidencias y sus entidades dependientes.
 *
 * En el monolito, historial, comentarios y evidencia vivían dentro del propio
 * documento. Aquí pasan a tablas con clave foránea (y la evidencia guarda solo
 * metadatos: el archivo está en disco, ver /uploads).
 */

export async function up(knex) {
  await knex.schema.createTable('incidencias', (t) => {
    t.string('id', 64).primary();
    t.string('tipo_id', 120).notNullable();
    t.string('icono_custom', 32).notNullable().defaultTo('');
    t.string('titulo', 80).notNullable();
    t.text('descripcion').notNullable();
    t.text('indicaciones').notNullable();
    t.decimal('lat', 10, 7).notNullable();
    t.decimal('lng', 10, 7).notNullable();
    // Precisión de milisegundos: el driver JSON conserva los ms de la cadena
    // ISO, así que MySQL debe hacerlo igual para que ambos sean equivalentes.
    t.datetime('fecha', { precision: 3 }).notNullable();
    t.datetime('actualizado', { precision: 3 }).notNullable();
    t.enum('estado', ['reportada', 'en_proceso', 'resuelta']).notNullable().defaultTo('reportada');
    t.boolean('es_anonimo').notNullable().defaultTo(false);
    t.string('autor', 120).notNullable();
    t.string('autor_nombre', 120).notNullable();
    t.string('user_key', 120).notNullable();
    t.string('municipio_id', 64).notNullable();
    t.string('zona_id', 64).nullable();
    t.string('zona_nombre', 160).nullable();
    t.datetime('fecha_resolucion', { precision: 3 }).nullable();
    t.text('solucion').nullable();

    t.index(['municipio_id']);
    t.index(['user_key']);
    t.index(['estado']);
    t.index(['tipo_id']);
    t.index(['zona_id']);
    t.index(['fecha']);
  });

  await knex.schema.createTable('incidencia_evidencias', (t) => {
    t.string('id', 64).primary();
    t.string('incidencia_id', 64).notNullable().references('id').inTable('incidencias').onDelete('CASCADE');
    // 'reporte' = evidencia del ciudadano, 'solucion' = evidencia de la resolución.
    t.enum('clase', ['reporte', 'solucion']).notNullable().defaultTo('reporte');
    t.string('nombre', 255).notNullable();
    t.string('tipo', 100).notNullable();
    t.bigInteger('tamano').unsigned().notNullable().defaultTo(0);
    t.string('url', 400).notNullable();
    t.decimal('duracion', 10, 2).nullable();
    t.index(['incidencia_id']);
  });

  await knex.schema.createTable('incidencia_historial', (t) => {
    t.increments('id').primary();
    t.string('incidencia_id', 64).notNullable().references('id').inTable('incidencias').onDelete('CASCADE');
    t.datetime('fecha', { precision: 3 }).notNullable();
    t.string('estado', 32).notNullable();
    t.string('accion', 400).notNullable();
    t.string('por', 120).notNullable();
    t.index(['incidencia_id']);
  });

  await knex.schema.createTable('incidencia_comentarios', (t) => {
    t.string('id', 64).primary();
    t.string('incidencia_id', 64).notNullable().references('id').inTable('incidencias').onDelete('CASCADE');
    t.datetime('fecha', { precision: 3 }).notNullable();
    t.string('autor', 120).notNullable();
    t.text('texto').notNullable();
    t.index(['incidencia_id']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('incidencia_comentarios');
  await knex.schema.dropTableIfExists('incidencia_historial');
  await knex.schema.dropTableIfExists('incidencia_evidencias');
  await knex.schema.dropTableIfExists('incidencias');
}
