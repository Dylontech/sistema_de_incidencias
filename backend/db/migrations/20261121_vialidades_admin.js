/**
 * Administración manual de vialidades y permiso del panel.
 *
 * Añade los datos de verificación y el enlace a Google Maps que usa la nueva
 * pestaña «Vialidades». No modifica los trazados existentes: las filas
 * importadas quedan activas y sin verificar hasta que la administración las
 * revise.
 */
const ROLES = ['admin_municipal', 'admin_estatal'];
const PERMISO = 'gestionar_vialidades';

async function tieneColumna(knex, tabla, columna) {
  return knex.schema.hasColumn(tabla, columna);
}

async function tieneIndice(knex, tabla, indice) {
  const filas = await knex.raw(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [knex.client.config.connection.database, tabla, indice]
  );
  return Boolean(filas?.[0]?.length);
}

async function agregarPermiso(knex, agregar = true) {
  if (!(await knex.schema.hasTable('roles'))) return;
  for (const clave of ROLES) {
    const fila = await knex('roles').where({ clave }).first();
    if (!fila) continue;
    let permisos = [];
    try {
      permisos = fila.permisos ? JSON.parse(fila.permisos) : [];
      if (!Array.isArray(permisos)) permisos = [];
    } catch {
      permisos = [];
    }
    const siguiente = agregar
      ? [...new Set([...permisos, PERMISO])]
      : permisos.filter((permiso) => permiso !== PERMISO);
    if (siguiente.length === permisos.length) continue;
    await knex('roles')
      .where({ clave })
      .update({ permisos: JSON.stringify(siguiente), actualizado_en: new Date() });
  }
}

export async function up(knex) {
  const columnas = [
    ['google_maps_url', 'VARCHAR(500) NULL'],
    ['notas', 'TEXT NULL'],
    ['verificada_en', 'DATETIME(3) NULL'],
    ['verificada_por', 'VARCHAR(60) NULL'],
    ['activo', 'BOOLEAN NOT NULL DEFAULT 1']
  ];
  for (const [columna, tipo] of columnas) {
    if (!(await tieneColumna(knex, 'vialidades', columna))) {
      await knex.raw(`ALTER TABLE vialidades ADD COLUMN ${columna} ${tipo}`);
    }
  }
  if (!(await tieneIndice(knex, 'vialidades', 'vialidades_municipio_activo_idx'))) {
    await knex.raw(
      'ALTER TABLE vialidades ADD INDEX vialidades_municipio_activo_idx (municipio_id, activo)'
    );
  }
  if (!(await tieneIndice(knex, 'vialidades', 'vialidades_municipio_tipo_idx'))) {
    await knex.raw(
      'ALTER TABLE vialidades ADD INDEX vialidades_municipio_tipo_idx (municipio_id, tipo)'
    );
  }
  await agregarPermiso(knex, true);
}

export async function down(knex) {
  await agregarPermiso(knex, false);
  if (await tieneIndice(knex, 'vialidades', 'vialidades_municipio_tipo_idx')) {
    await knex.raw('ALTER TABLE vialidades DROP INDEX vialidades_municipio_tipo_idx');
  }
  if (await tieneIndice(knex, 'vialidades', 'vialidades_municipio_activo_idx')) {
    await knex.raw('ALTER TABLE vialidades DROP INDEX vialidades_municipio_activo_idx');
  }
  for (const [columna] of [
    ['google_maps_url'],
    ['notas'],
    ['verificada_en'],
    ['verificada_por'],
    ['activo']
  ]) {
    if (await tieneColumna(knex, 'vialidades', columna)) {
      await knex.raw(`ALTER TABLE vialidades DROP COLUMN ${columna}`);
    }
  }
}
