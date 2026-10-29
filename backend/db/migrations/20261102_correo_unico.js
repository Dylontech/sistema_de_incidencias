/**
 * El correo vuelve a ser único.
 *
 * El acceso ciudadano es por nombre, pero el correo sigue siendo el canal de
 * avisos: dos cuentas no pueden compartirlo o los avisos llegarían a la persona
 * equivocada. Esta migración restaura la restricción UNIQUE de `usuarios.correo`
 * que la V2.9.0 había retirado.
 *
 * Si existen correos repetidos, la migración se detiene y los lista: no se
 * borran ni se cambian datos a ciegas.
 */

/** Correos repetidos (no nulos) que impiden crear el índice único. */
async function correosRepetidos(knex) {
  const [filas] = await knex.raw(
    `SELECT correo, COUNT(*) AS total
       FROM usuarios
      WHERE correo IS NOT NULL AND correo <> ''
      GROUP BY correo
     HAVING total > 1
      ORDER BY total DESC, correo`
  );
  return filas;
}

/** Índices únicos actuales sobre `usuarios.correo`. */
async function indicesUnicos(knex) {
  const [filas] = await knex.raw(
    `SELECT DISTINCT INDEX_NAME AS nombre
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'usuarios'
        AND COLUMN_NAME = 'correo'
        AND NON_UNIQUE = 0`
  );
  return filas;
}

export async function up(knex) {
  if ((await indicesUnicos(knex)).length) return; // Ya existe la restricción.

  const repetidos = await correosRepetidos(knex);
  if (repetidos.length) {
    const detalle = repetidos.map((fila) => `${fila.correo} (${fila.total})`).join(', ');
    throw new Error(
      `No se puede hacer único usuarios.correo: hay correos repetidos: ${detalle}. ` +
        'Corrige esos registros (conserva el correo en la cuenta correcta o vacíalo en las demás) y vuelve a ejecutar la migración.'
    );
  }

  await knex.raw('ALTER TABLE usuarios ADD UNIQUE INDEX correo (correo)');
}

export async function down(knex) {
  for (const fila of await indicesUnicos(knex)) {
    const nombre = String(fila.nombre).replace(/`/g, '``');
    await knex.raw(`ALTER TABLE usuarios DROP INDEX \`${nombre}\``);
  }
}
