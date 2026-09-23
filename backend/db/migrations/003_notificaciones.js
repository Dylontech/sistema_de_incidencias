/** Migración 003 — notificaciones por usuario. */

export async function up(knex) {
  await knex.schema.createTable('notificaciones', (t) => {
    t.string('id', 64).primary();
    t.datetime('fecha', { precision: 3 }).notNullable();
    t.boolean('leida').notNullable().defaultTo(false);
    t.enum('tipo', ['reporte', 'resuelta', 'estado', 'alerta', 'comentario']).notNullable();
    t.string('titulo', 200).notNullable();
    t.text('mensaje').notNullable();
    t.string('incidencia_id', 64).nullable();
    // NULL = notificación global (la ven todos), igual que en el monolito.
    t.string('para_usuario', 120).nullable();
    t.index(['para_usuario']);
    t.index(['leida']);
    t.index(['incidencia_id']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('notificaciones');
}
