/**
 * Administradores territoriales.
 *
 * El rol `admin` sigue siendo el administrador maestro (ve todo el país y es
 * el único que crea o edita administradores). Se añaden:
 *
 *  - `admin_estatal`: administra los municipios de sus estados.
 *  - `admin_municipal`: administra los municipios que tenga asignados.
 *
 * También se guarda el municipio de las sugerencias para poder contar y
 * filtrar por zona en el panel.
 */
const ROLES_ANTERIORES =
  "'ciudadano', 'funcionario', 'auditor', 'enlace_estatal', 'enlace_federal', 'soporte', 'admin'";
const ROLES_NUEVOS =
  "'ciudadano', 'funcionario', 'auditor', 'enlace_estatal', 'enlace_federal', 'soporte', 'admin_municipal', 'admin_estatal', 'admin'";

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

  // 1. Enum de roles con los dos niveles de administración territorial.
  await knex.raw(`ALTER TABLE usuarios MODIFY rol ENUM(${ROLES_NUEVOS}) NOT NULL`);

  // 2. Los administradores territoriales escriben incidencias dentro de su
  //    ámbito (el alcance se valida en cada petición).
  await knex('usuarios')
    .whereIn('rol', ['admin_municipal', 'admin_estatal'])
    .update({ puede_escribir: true });

  // 3. Municipio de la sugerencia (para el resumen por zona).
  if (await knex.schema.hasTable('sugerencias')) {
    if (!(await knex.schema.hasColumn('sugerencias', 'municipio_id'))) {
      // Knex no permite fijar el charset en `alterTable`; se usa SQL directo.
      await knex.raw(
        `ALTER TABLE sugerencias
           ADD COLUMN municipio_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ${colacion} NULL,
           ADD INDEX sugerencias_municipio_id_index (municipio_id)`
      );
    }
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('sugerencias', 'municipio_id')) {
    await knex.schema.alterTable('sugerencias', (t) => t.dropColumn('municipio_id'));
  }
  await knex.raw(`ALTER TABLE usuarios MODIFY rol ENUM(${ROLES_ANTERIORES}) NOT NULL`);
}
