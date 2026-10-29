/**
 * Claves de acceso para conjuntos de municipios.
 *
 * `municipios.clave` sigue existiendo por compatibilidad, pero una clave nueva
 * puede cubrir varios municipios, tener vigencia, límite de usos y revocarse.
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

  if (!(await knex.schema.hasTable('claves_acceso'))) {
    await knex.schema.createTable('claves_acceso', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).notNullable().primary();
      t.string('codigo', 40).notNullable().unique();
      t.string('nombre', 160).notNullable().defaultTo('');
      t.string('rol_sugerido', 30).nullable();
      t.boolean('activa').notNullable().defaultTo(true);
      t.integer('usos_maximos').nullable();
      t.integer('usos').notNullable().defaultTo(0);
      t.datetime('expira_en', { precision: 3 }).nullable();
      t.string('creado_por', 60).nullable();
      t.datetime('creado_en', { precision: 3 }).defaultTo(knex.fn.now());
      t.datetime('revocada_en', { precision: 3 }).nullable();
    });
  }

  if (!(await knex.schema.hasTable('clave_acceso_municipios'))) {
    await knex.schema.createTable('clave_acceso_municipios', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('clave_id', 64).notNullable();
      t.string('municipio_id', 64).notNullable();
      t.primary(['clave_id', 'municipio_id']);
      t.foreign('clave_id').references('claves_acceso.id').onDelete('CASCADE');
      t.foreign('municipio_id').references('municipios.id').onDelete('CASCADE');
    });
  }

  if (!(await knex.schema.hasTable('clave_acceso_usos'))) {
    await knex.schema.createTable('clave_acceso_usos', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).notNullable().primary();
      t.string('clave_id', 64).notNullable();
      t.string('usuario_id', 64).nullable();
      t.string('ip_hash', 64).nullable();
      t.datetime('creado_en', { precision: 3 }).defaultTo(knex.fn.now());
      t.foreign('clave_id').references('claves_acceso.id').onDelete('CASCADE');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('clave_acceso_usos');
  await knex.schema.dropTableIfExists('clave_acceso_municipios');
  await knex.schema.dropTableIfExists('claves_acceso');
}
