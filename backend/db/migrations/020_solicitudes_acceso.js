/** Solicitudes públicas de acceso para personal estatal/federal o municipal. */
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
  if (await knex.schema.hasTable('solicitudes_acceso')) return;

  await knex.schema.createTable('solicitudes_acceso', (t) => {
    t.charset('utf8mb4');
    t.collate(colacion);
    t.string('id', 64).notNullable().primary();
    t.string('folio', 32).notNullable().unique();
    t.string('nombre', 160).notNullable();
    t.string('correo', 160).notNullable();
    t.string('telefono', 40).nullable();
    t.string('usuario_sugerido', 60).nullable();
    t.string('rol_solicitado', 30).notNullable();
    t.text('municipios', 'longtext').nullable();
    t.text('estados', 'longtext').nullable();
    t.text('justificacion', 'longtext').nullable();
    t.string('estado', 24).notNullable().defaultTo('pendiente');
    t.string('revisado_por', 120).nullable();
    t.datetime('revisado_en', { precision: 3 }).nullable();
    t.string('motivo_rechazo', 300).nullable();
    t.string('ip_hash', 64).nullable();
    t.datetime('creado_en', { precision: 3 }).defaultTo(knex.fn.now());
    t.index(['estado']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('solicitudes_acceso');
}
