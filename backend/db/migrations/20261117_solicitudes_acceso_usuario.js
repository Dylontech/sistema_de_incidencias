/**
 * Vincula una solicitud de acceso con la cuenta ciudadana que ya usa ese correo.
 *
 * Así una persona que ya tiene cuenta puede solicitar acceso al panel sin
 * crear una segunda cuenta: la administración la promueve y conserva su
 * historial, su correo y su contraseña.
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
  if (!(await knex.schema.hasColumn('solicitudes_acceso', 'usuario_id'))) {
    await knex.schema.alterTable('solicitudes_acceso', (t) => {
      t.string('usuario_id', 64).nullable().collate(colacion);
      t.foreign('usuario_id', 'solicitudes_acceso_usuario_fk')
        .references('usuarios.id')
        .onDelete('SET NULL');
      t.index(['usuario_id'], 'solicitudes_acceso_usuario_idx');
    });
  }

  // Backfill: solo se vincula cuando el correo pertenece a una cuenta
  // ciudadana. Si hubiera más de una (bases antiguas), se deja sin vínculo y
  // la aprobación lo resolverá comprobando la unicidad.
  await knex.raw(`
    UPDATE solicitudes_acceso s
    INNER JOIN usuarios u ON LOWER(u.correo) = LOWER(s.correo)
    SET s.usuario_id = u.id
    WHERE s.usuario_id IS NULL
      AND u.rol = 'ciudadano'
      AND u.correo IS NOT NULL
      AND (
        SELECT COUNT(*) FROM usuarios u2
        WHERE u2.correo IS NOT NULL AND LOWER(u2.correo) = LOWER(s.correo)
      ) = 1
  `);
}

export async function down(knex) {
  if (!(await knex.schema.hasColumn('solicitudes_acceso', 'usuario_id'))) return;
  await knex.schema.alterTable('solicitudes_acceso', (t) => {
    t.dropForeign('usuario_id', 'solicitudes_acceso_usuario_fk');
    t.dropIndex(['usuario_id'], 'solicitudes_acceso_usuario_idx');
    t.dropColumn('usuario_id');
  });
}
