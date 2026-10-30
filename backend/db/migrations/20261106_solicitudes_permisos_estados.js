/**
 * Destino estatal de una solicitud de permisos.
 *
 * Una cuenta con alcance por estados (enlace estatal/federal, admin estatal)
 * no tiene un municipio concreto; sin esta columna su solicitud quedaba
 * invisible para los administradores de su ámbito.
 */
export async function up(knex) {
  if (!(await knex.schema.hasTable('solicitudes_permisos'))) return;
  if (await knex.schema.hasColumn('solicitudes_permisos', 'estados')) return;
  await knex.schema.alterTable('solicitudes_permisos', (t) => {
    t.text('estados').nullable();
  });
}

export async function down(knex) {
  if (!(await knex.schema.hasTable('solicitudes_permisos'))) return;
  if (!(await knex.schema.hasColumn('solicitudes_permisos', 'estados'))) return;
  await knex.schema.alterTable('solicitudes_permisos', (t) => {
    t.dropColumn('estados');
  });
}
