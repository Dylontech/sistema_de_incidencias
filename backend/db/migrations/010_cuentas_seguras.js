/**
 * Migración 010 — cuentas seguras (correo verificado, tokens y bloqueo).
 *
 * Añade a `usuarios` los campos que sostienen el ciclo de vida de una cuenta
 * ciudadana:
 *
 *  1. `correo_verificado`: hasta que el ciudadano no abre el enlace del correo,
 *     la cuenta no sirve para entrar (si no, cualquiera podría registrarse con
 *     la dirección de otra persona).
 *  2. Los **tokens de un solo uso** de verificación y de restablecimiento. En la
 *     tabla solo vive su hash sha256, nunca el token que viaja en el enlace.
 *  3. `token_version`: versión de la sesión. Cambiar la contraseña la sube y los
 *     tokens emitidos antes dejan de valer (permite expulsar sesiones sin listar
 *     los tokens uno a uno).
 *  4. `intentos_fallidos` / `bloqueado_hasta`: bloqueo temporal de la cuenta tras
 *     demasiados intentos, que frena el ataque por fuerza bruta repartido entre
 *     varias direcciones IP.
 *
 * Es idempotente (comprueba antes de crear columnas) porque puede correr sobre
 * bases que ya traían parte del esquema de una prueba anterior.
 */
export async function up(knex) {
  if (await knex.schema.hasColumn('usuarios', 'correo_verificado')) return;

  await knex.schema.alterTable('usuarios', (t) => {
    t.boolean('correo_verificado').notNullable().defaultTo(false);
    t.string('token_verificacion_hash', 64).nullable();
    t.datetime('token_verificacion_expira', { precision: 3 }).nullable();
    t.string('reset_token_hash', 64).nullable();
    t.datetime('reset_expira', { precision: 3 }).nullable();
    t.integer('token_version').unsigned().notNullable().defaultTo(1);
    t.integer('intentos_fallidos').unsigned().notNullable().defaultTo(0);
    t.datetime('bloqueado_hasta', { precision: 3 }).nullable();
    t.index(['token_verificacion_hash']);
    t.index(['reset_token_hash']);
  });

  // Las cuentas que ya existían se dan por verificadas: se registraron cuando
  // no había correo de confirmación, así que exigirlo ahora las dejaría fuera
  // sin manera de arreglarlo (nadie puede confirmar un correo que nunca se le
  // pidió).
  await knex('usuarios').update({ correo_verificado: true });
}

export async function down(knex) {
  if (!(await knex.schema.hasColumn('usuarios', 'correo_verificado'))) return;

  await knex.schema.alterTable('usuarios', (t) => {
    t.dropIndex(['token_verificacion_hash']);
    t.dropIndex(['reset_token_hash']);
    t.dropColumn('correo_verificado');
    t.dropColumn('token_verificacion_hash');
    t.dropColumn('token_verificacion_expira');
    t.dropColumn('reset_token_hash');
    t.dropColumn('reset_expira');
    t.dropColumn('token_version');
    t.dropColumn('intentos_fallidos');
    t.dropColumn('bloqueado_hasta');
  });
}
