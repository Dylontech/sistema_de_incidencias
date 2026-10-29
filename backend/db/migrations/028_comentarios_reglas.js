/**
 * Reglas y restricciones de comentarios.
 *
 * - Borrado lógico y edición de comentarios.
 * - Restricciones por cuenta o por `user_key` (sesiones anónimas).
 * - Columnas de restricción en usuarios para que la ficha de moderación pueda
 *   mostrarla sin consultar la tabla auxiliar.
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

  if (!(await knex.schema.hasColumn('incidencia_comentarios', 'eliminado_en'))) {
    await knex.raw(
      `ALTER TABLE incidencia_comentarios
         ADD COLUMN eliminado_en DATETIME(3) NULL,
         ADD COLUMN editado_en DATETIME(3) NULL`
    );
  }

  if (!(await knex.schema.hasTable('restricciones_comentarios'))) {
    await knex.schema.createTable('restricciones_comentarios', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('usuario_id', 64).nullable();
      t.string('user_key', 120).nullable();
      t.string('motivo', 300).notNullable();
      t.datetime('hasta', { precision: 3 }).nullable();
      t.boolean('activo').notNullable().defaultTo(true);
      t.string('creado_por', 120).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();

      t.foreign('usuario_id', 'restriccion_usuario_fk')
        .references('id')
        .inTable('usuarios')
        .onDelete('CASCADE');
      t.index(['usuario_id', 'activo'], 'restriccion_usuario_idx');
      t.index(['user_key', 'activo'], 'restriccion_userkey_idx');
    });
  }

  const columnas = [
    ['comentarios_restringidos', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['comentarios_restringidos_hasta', 'DATETIME(3) NULL'],
    ['comentarios_restringidos_motivo', 'VARCHAR(300) NULL'],
    ['comentarios_restringidos_por', 'VARCHAR(120) NULL']
  ];

  for (const [columna, definicion] of columnas) {
    if (!(await knex.schema.hasColumn('usuarios', columna))) {
      await knex.raw(`ALTER TABLE usuarios ADD COLUMN ${columna} ${definicion}`);
    }
  }
}

export async function down(knex) {
  for (const columna of [
    'comentarios_restringidos',
    'comentarios_restringidos_hasta',
    'comentarios_restringidos_motivo',
    'comentarios_restringidos_por'
  ]) {
    if (await knex.schema.hasColumn('usuarios', columna)) {
      await knex.schema.alterTable('usuarios', (t) => t.dropColumn(columna));
    }
  }
  await knex.schema.dropTableIfExists('restricciones_comentarios');
  if (await knex.schema.hasColumn('incidencia_comentarios', 'eliminado_en')) {
    await knex.schema.alterTable('incidencia_comentarios', (t) => {
      t.dropColumn('eliminado_en');
      t.dropColumn('editado_en');
    });
  }
}
