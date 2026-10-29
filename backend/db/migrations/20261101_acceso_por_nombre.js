/**
 * Acceso ciudadano por nombre.
 *
 * El ciudadano ya no entra con su correo: entra con el nombre (o el pseudónimo)
 * que eligió al registrarse. Por eso:
 *  - `usuarios.correo` deja de ser único: es un dato de contacto y varias
 *    cuentas pueden compartirlo (el alta nunca avisa de un correo «en uso»).
 *  - se indexa `usuarios.nombre`, que ahora se consulta en cada entrada.
 *
 * La unicidad del nombre entre ciudadanos se comprueba en
 * `auth.service.registrarCiudadano` (los datos antiguos pueden tener nombres
 * repetidos y no se quiere romper la migración).
 */
export async function up(knex) {
  const [indicesCorreo] = await knex.raw(
    `SELECT DISTINCT INDEX_NAME AS nombre
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'usuarios'
        AND COLUMN_NAME = 'correo'
        AND NON_UNIQUE = 0`
  );

  for (const fila of indicesCorreo) {
    const nombre = String(fila.nombre).replace(/`/g, '``');
    await knex.raw(`ALTER TABLE usuarios DROP INDEX \`${nombre}\``);
  }

  const [indiceNombre] = await knex.raw(
    `SELECT 1 AS existe
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'usuarios'
        AND INDEX_NAME = 'usuarios_nombre_idx'
      LIMIT 1`
  );

  if (!indiceNombre.length) {
    await knex.raw('ALTER TABLE usuarios ADD INDEX usuarios_nombre_idx (nombre)');
  }
}

export async function down(knex) {
  const [indiceNombre] = await knex.raw(
    `SELECT 1 AS existe
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'usuarios'
        AND INDEX_NAME = 'usuarios_nombre_idx'
      LIMIT 1`
  );

  if (indiceNombre.length) {
    await knex.raw('ALTER TABLE usuarios DROP INDEX usuarios_nombre_idx');
  }

  const [indicesCorreo] = await knex.raw(
    `SELECT DISTINCT INDEX_NAME AS nombre
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'usuarios'
        AND COLUMN_NAME = 'correo'
        AND NON_UNIQUE = 0`
  );

  if (!indicesCorreo.length) {
    await knex.raw('ALTER TABLE usuarios ADD UNIQUE INDEX correo (correo)');
  }
}
