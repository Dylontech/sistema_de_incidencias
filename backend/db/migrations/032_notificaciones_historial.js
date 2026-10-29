/**
 * Historial de notificaciones y datos de simulación.
 *
 * Borrar una notificación deja de ser destructivo: se archiva y se puede
 * restaurar. `simulado`/`simulacion_id` permiten que el simulador admin cree
 * avisos sin enviarlos por correo ni SSE real.
 */
export async function up(knex) {
  const columnas = [
    ['archivada_en', 'DATETIME(3) NULL'],
    ['eliminada_en', 'DATETIME(3) NULL'],
    ['simulado', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['simulacion_id', 'VARCHAR(64) NULL']
  ];

  for (const [columna, definicion] of columnas) {
    if (!(await knex.schema.hasColumn('notificaciones', columna))) {
      await knex.raw(`ALTER TABLE notificaciones ADD COLUMN ${columna} ${definicion}`);
    }
  }

  await knex.raw(
    'ALTER TABLE notificaciones ADD INDEX notif_hist_idx (para_usuario, archivada_en, fecha)'
  );
}

export async function down(knex) {
  await knex.raw('ALTER TABLE notificaciones DROP INDEX notif_hist_idx');
  for (const columna of ['archivada_en', 'eliminada_en', 'simulado', 'simulacion_id']) {
    if (await knex.schema.hasColumn('notificaciones', columna)) {
      await knex.schema.alterTable('notificaciones', (t) => t.dropColumn(columna));
    }
  }
}
