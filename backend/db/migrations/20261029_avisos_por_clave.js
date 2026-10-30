/**
 * Permisos de avisos por clave de acceso.
 *
 * La clave sigue sirviendo para entrar aunque el administrador revoque sus
 * avisos: `notificaciones_activas` es independiente de `activa`. El alcance de
 * avisos es un subconjunto de municipios de la propia clave; si no hay filas,
 * se usan todos los municipios de la clave.
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

  if (!(await knex.schema.hasColumn('claves_acceso', 'notificaciones_activas'))) {
    await knex.schema.alterTable('claves_acceso', (t) => {
      t.boolean('notificaciones_activas').notNullable().defaultTo(true);
    });
  }

  if (!(await knex.schema.hasTable('clave_notificacion_municipios'))) {
    await knex.schema.createTable('clave_notificacion_municipios', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('clave_id', 64).notNullable();
      t.string('municipio_id', 64).notNullable();
      t.primary(['clave_id', 'municipio_id']);
      t.foreign('clave_id').references('claves_acceso.id').onDelete('CASCADE');
      t.foreign('municipio_id').references('municipios.id').onDelete('CASCADE');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('clave_notificacion_municipios');
  if (await knex.schema.hasColumn('claves_acceso', 'notificaciones_activas')) {
    await knex.schema.alterTable('claves_acceso', (t) => {
      t.dropColumn('notificaciones_activas');
    });
  }
}
