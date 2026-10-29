/**
 * Preferencias de notificación del personal.
 *
 * `modo` decide qué incidencias nuevas avisan a la cuenta:
 *   - asignados: solo los municipios/estados de su alcance (por defecto);
 *   - municipios: solo los municipios marcados en `preferencia_municipios`;
 *   - todos: cualquier incidencia;
 *   - ninguno: silencio total.
 *
 * El administrador puede elegir cualquier modo; los funcionarios y auditores
 * quedan limitados a su alcance (la validación vive en el servicio).
 */

/** Colación real de `usuarios.id` (ver 010_alcance_territorial.js). */
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

  if (!(await knex.schema.hasTable('preferencias_notificacion'))) {
    await knex.schema.createTable('preferencias_notificacion', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('usuario_id', 64).notNullable().primary();
      t.string('modo', 20).notNullable().defaultTo('asignados');
      t.boolean('por_correo').notNullable().defaultTo(false);
      t.datetime('actualizado_en', { precision: 3 }).defaultTo(knex.fn.now());
      t.foreign('usuario_id').references('usuarios.id').onDelete('CASCADE');
    });
  }

  if (!(await knex.schema.hasTable('preferencia_municipios'))) {
    await knex.schema.createTable('preferencia_municipios', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('usuario_id', 64).notNullable();
      t.string('municipio_id', 64).notNullable();
      t.primary(['usuario_id', 'municipio_id']);
      t.foreign('usuario_id').references('usuarios.id').onDelete('CASCADE');
      t.foreign('municipio_id').references('municipios.id').onDelete('CASCADE');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('preferencia_municipios');
  await knex.schema.dropTableIfExists('preferencias_notificacion');
}
