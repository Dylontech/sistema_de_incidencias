/**
 * Migración 006 — cuentas de ciudadano.
 *
 * Hasta ahora la tabla `usuarios` solo guardaba al personal (funcionario y
 * admin). El ciudadano que quería seguimiento se quedaba como anónimo, sin
 * buzón de avisos. Con esta migración aparece el rol `ciudadano`, que entra con
 * correo y contraseña, y la marca `pseudonimo` (nombre generado en lugar del
 * nombre real).
 */
export async function up(knex) {
  await knex.schema.alterTable('usuarios', (t) => {
    t.string('correo', 160).nullable().unique();
    t.boolean('pseudonimo').notNullable().defaultTo(false);
  });

  // El enum de MySQL/MariaDB no acepta un valor nuevo sin redefinirse.
  await knex.raw("ALTER TABLE usuarios MODIFY rol ENUM('ciudadano', 'funcionario', 'admin') NOT NULL");
}

export async function down(knex) {
  await knex.raw("ALTER TABLE usuarios MODIFY rol ENUM('funcionario', 'admin') NOT NULL");

  await knex.schema.alterTable('usuarios', (t) => {
    t.dropColumn('pseudonimo');
    t.dropColumn('correo');
  });
}
