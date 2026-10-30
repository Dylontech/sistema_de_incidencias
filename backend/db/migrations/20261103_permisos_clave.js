/**
 * Permisos por clave de acceso.
 *
 * Una clave puede llevar el conjunto de permisos que concede (rol + CRUD).
 * Al iniciar sesión con ella, el servidor recorta los permisos de la cuenta y
 * el territorio a lo que la clave autoriza. Las claves anteriores quedan con
 * `permisos = NULL`, que significa «sin recorte» (compatibilidad).
 */
export async function up(knex) {
  if (!(await knex.schema.hasTable('claves_acceso'))) return;
  if (await knex.schema.hasColumn('claves_acceso', 'permisos')) return;
  await knex.schema.alterTable('claves_acceso', (t) => {
    t.text('permisos').nullable();
  });
}

export async function down(knex) {
  if (!(await knex.schema.hasTable('claves_acceso'))) return;
  if (!(await knex.schema.hasColumn('claves_acceso', 'permisos'))) return;
  await knex.schema.alterTable('claves_acceso', (t) => {
    t.dropColumn('permisos');
  });
}
