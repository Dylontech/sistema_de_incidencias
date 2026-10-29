/**
 * Alcance territorial N:M.
 *
 * Hasta ahora un funcionario solo podía estar atado a un municipio
 * (`usuarios.municipio_id`). Esta migración añade:
 *
 *  - roles nuevos: auditor, enlace_estatal y enlace_federal (solo lectura);
 *  - `usuarios.puede_escribir`, para revocar la escritura sin cambiar de rol;
 *  - `usuario_municipios` y `usuario_estados` (asignaciones múltiples);
 *  - `incidencias.estado_entidad`, para filtrar por estado sin unir tablas.
 *
 * `usuarios.municipio_id` se conserva como municipio principal (compatibilidad
 * y municipio activo por defecto), pero la autorización usa las asignaciones.
 */

const ROLES_ANTERIORES = "'ciudadano', 'funcionario', 'admin'";
const ROLES_NUEVOS =
  "'ciudadano', 'funcionario', 'auditor', 'enlace_estatal', 'enlace_federal', 'admin'";

/**
 * Colación real de `usuarios.id`.
 *
 * MySQL/MariaDB exige la MISMA colación en las columnas de una clave foránea.
 * Si la base se creó con una colación distinta de la que usa la conexión, una
 * tabla nueva hereda otra y la migración falla con «Foreign key constraint is
 * incorrectly formed». Se consulta la colación existente y se usa esa.
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

  // 1. Ampliar el enum de roles.
  await knex.raw(`ALTER TABLE usuarios MODIFY rol ENUM(${ROLES_NUEVOS}) NOT NULL`);

  // 2. Permiso de escritura explícito.
  if (!(await knex.schema.hasColumn('usuarios', 'puede_escribir'))) {
    await knex.schema.alterTable('usuarios', (t) => {
      t.boolean('puede_escribir').notNullable().defaultTo(false);
    });
  }
  // Los funcionarios y administradores existentes conservan su capacidad de
  // escritura; los roles nuevos nacen en solo lectura.
  await knex('usuarios')
    .whereIn('rol', ['funcionario', 'admin'])
    .update({ puede_escribir: true });

  // 3. Asignaciones municipales.
  if (!(await knex.schema.hasTable('usuario_municipios'))) {
    await knex.schema.createTable('usuario_municipios', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('usuario_id', 64).notNullable();
      t.string('municipio_id', 64).notNullable();
      t.timestamp('creado_en').defaultTo(knex.fn.now());
      t.primary(['usuario_id', 'municipio_id']);
      t.foreign('usuario_id').references('id').inTable('usuarios').onDelete('CASCADE');
      t.foreign('municipio_id').references('id').inTable('municipios').onDelete('CASCADE');
      t.index('municipio_id');
    });
  }

  // 4. Asignaciones estatales. `municipios.estado` es texto libre; se guarda el
  //    nombre normalizado que ya usa el catálogo (por ejemplo «Michoacán»).
  if (!(await knex.schema.hasTable('usuario_estados'))) {
    await knex.schema.createTable('usuario_estados', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('usuario_id', 64).notNullable();
      t.string('estado', 120).notNullable();
      t.timestamp('creado_en').defaultTo(knex.fn.now());
      t.primary(['usuario_id', 'estado']);
      t.foreign('usuario_id').references('id').inTable('usuarios').onDelete('CASCADE');
      t.index('estado');
    });
  }

  // 5. Volcar el municipio único en la tabla de asignaciones (sin duplicar).
  const conMunicipio = await knex('usuarios')
    .whereNotNull('municipio_id')
    .select('id', 'municipio_id');
  if (conMunicipio.length) {
    const filas = conMunicipio.map((u) => ({
      usuario_id: u.id,
      municipio_id: u.municipio_id
    }));
    await knex('usuario_municipios').insert(filas).onConflict().ignore();
  }

  // 6. Estado de la incidencia, para el alcance estatal/federal.
  if (!(await knex.schema.hasColumn('incidencias', 'estado_entidad'))) {
    await knex.schema.alterTable('incidencias', (t) => {
      t.string('estado_entidad', 120).nullable();
      t.index('estado_entidad');
    });
  }
  await knex.raw(`
    UPDATE incidencias i
    JOIN municipios m ON m.id = i.municipio_id
    SET i.estado_entidad = m.estado
    WHERE i.estado_entidad IS NULL
  `);

  // 7. Índices de consulta por estado en el catálogo.
  const indicesMunicipios = await knex.raw('SHOW INDEX FROM municipios WHERE Key_name = ?', [
    'municipios_estado_index'
  ]);
  const listaIndices = indicesMunicipios[0] || [];
  if (!listaIndices.length) {
    await knex.schema.alterTable('municipios', (t) => t.index('estado'));
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('incidencias', 'estado_entidad')) {
    await knex.schema.alterTable('incidencias', (t) => {
      t.dropIndex('estado_entidad');
      t.dropColumn('estado_entidad');
    });
  }
  await knex.schema.dropTableIfExists('usuario_estados');
  await knex.schema.dropTableIfExists('usuario_municipios');
  if (await knex.schema.hasColumn('usuarios', 'puede_escribir')) {
    await knex.schema.alterTable('usuarios', (t) => t.dropColumn('puede_escribir'));
  }
  // Al volver atrás, los roles nuevos pasan a funcionario para no perder acceso.
  await knex('usuarios')
    .whereIn('rol', ['auditor', 'enlace_estatal', 'enlace_federal'])
    .update({ rol: 'funcionario' });
  await knex.raw(`ALTER TABLE usuarios MODIFY rol ENUM(${ROLES_ANTERIORES}) NOT NULL`);
}
