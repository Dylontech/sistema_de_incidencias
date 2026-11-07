/**
 * Claves de activación por cuenta.
 *
 * Una clave `unica` se genera al crear la cuenta, se usa una vez para
 * activarla y queda vinculada a esa cuenta hasta su fecha de expiración.
 * Las claves `compartida` conservan el comportamiento anterior de las claves
 * de municipio. `clave_acceso_cuentas` queda lista para vincular una clave
 * compartida a varias cuentas sin reutilizar el código.
 */

export async function up(knex) {
  const colacion = await colacionDeUsuarios(knex);

  const columnasClave = [
    ['modo', "VARCHAR(16) NOT NULL DEFAULT 'compartida'"],
    ['activada_en', 'DATETIME(3) NULL'],
    ['activada_por_usuario_id', `VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ${colacion} NULL`],
    ['renovada_de_id', 'VARCHAR(64) NULL']
  ];
  for (const [columna, tipo] of columnasClave) {
    if (!(await knex.schema.hasColumn('claves_acceso', columna))) {
      await knex.raw(`ALTER TABLE claves_acceso ADD COLUMN ${columna} ${tipo}`);
    }
  }

  const columnasUsuario = [
    ['clave_id', 'VARCHAR(64) NULL'],
    ['clave_activada_en', 'DATETIME(3) NULL'],
    ['clave_vigente_hasta', 'DATETIME(3) NULL']
  ];
  for (const [columna, tipo] of columnasUsuario) {
    if (!(await knex.schema.hasColumn('usuarios', columna))) {
      await knex.raw(`ALTER TABLE usuarios ADD COLUMN ${columna} ${tipo}`);
    }
  }

  if (!(await indiceExiste(knex, 'usuarios', 'usuarios_clave_idx'))) {
    await knex.raw('ALTER TABLE usuarios ADD INDEX usuarios_clave_idx (clave_id)');
  }
  if (!(await indiceExiste(knex, 'claves_acceso', 'claves_acceso_activada_idx'))) {
    await knex.raw(
      'ALTER TABLE claves_acceso ADD INDEX claves_acceso_activada_idx (activada_por_usuario_id)'
    );
  }

  if (!(await knex.schema.hasTable('clave_acceso_cuentas'))) {
    await knex.schema.createTable('clave_acceso_cuentas', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('clave_id', 64).notNullable();
      t.string('usuario_id', 64).notNullable();
      t.datetime('activada_en', { precision: 3 }).nullable();
      t.primary(['clave_id', 'usuario_id']);
      t.foreign('clave_id').references('claves_acceso.id').onDelete('CASCADE');
      t.foreign('usuario_id').references('usuarios.id').onDelete('CASCADE');
      t.index(['usuario_id'], 'clave_cuenta_usuario_idx');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('clave_acceso_cuentas');

  for (const [columna, indice] of [
    ['clave_id', 'usuarios_clave_idx'],
    ['clave_activada_en', null],
    ['clave_vigente_hasta', null]
  ]) {
    if (await knex.schema.hasColumn('usuarios', columna)) {
      if (indice && (await indiceExiste(knex, 'usuarios', indice))) {
        await knex.raw(`ALTER TABLE usuarios DROP INDEX ${indice}`);
      }
      await knex.raw(`ALTER TABLE usuarios DROP COLUMN ${columna}`);
    }
  }

  for (const [columna, indice] of [
    ['modo', null],
    ['activada_en', null],
    ['activada_por_usuario_id', 'claves_acceso_activada_idx'],
    ['renovada_de_id', null]
  ]) {
    if (await knex.schema.hasColumn('claves_acceso', columna)) {
      if (indice && (await indiceExiste(knex, 'claves_acceso', indice))) {
        await knex.raw(`ALTER TABLE claves_acceso DROP INDEX ${indice}`);
      }
      await knex.raw(`ALTER TABLE claves_acceso DROP COLUMN ${columna}`);
    }
  }
}

async function colacionDeUsuarios(knex) {
  try {
    const [fila] = await knex('information_schema.COLUMNS')
      .select('COLLATION_NAME')
      .where({
        TABLE_SCHEMA: knex.client.config.connection.database,
        TABLE_NAME: 'usuarios',
        COLUMN_NAME: 'id'
      })
      .limit(1);
    return fila?.COLLATION_NAME || 'utf8mb4_unicode_ci';
  } catch {
    return 'utf8mb4_unicode_ci';
  }
}

async function indiceExiste(knex, tabla, indice) {
  try {
    const filas = await knex('information_schema.STATISTICS')
      .select('INDEX_NAME')
      .where({
        TABLE_SCHEMA: knex.client.config.connection.database,
        TABLE_NAME: tabla,
        INDEX_NAME: indice
      })
      .limit(1);
    return filas.length > 0;
  } catch {
    return false;
  }
}
