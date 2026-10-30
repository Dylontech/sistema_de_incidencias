/**
 * Completa la matriz de los administradores territoriales con los permisos
 * que introduce V2.11.
 *
 * `20261104_roles_permisos.js` sembró `roles` con la constante tal como estaba
 * en ese momento. En bases ya migradas, `admin_municipal` y `admin_estatal`
 * quedaron sin `gestionar_solicitudes_permisos` ni `revelar_password_usuarios`.
 * Esta migración los añade solo si faltan: nunca quita permisos ni pisa una
 * matriz personalizada.
 */
const ROLES = ['admin_municipal', 'admin_estatal'];
const NUEVOS = ['gestionar_solicitudes_permisos', 'revelar_password_usuarios'];

export async function up(knex) {
  if (!(await knex.schema.hasTable('roles'))) return;
  for (const clave of ROLES) {
    const fila = await knex('roles').where({ clave }).first();
    if (!fila) continue;
    let permisos = [];
    try {
      const valor = fila.permisos ? JSON.parse(fila.permisos) : [];
      permisos = Array.isArray(valor) ? valor : [];
    } catch {
      permisos = [];
    }
    const faltantes = NUEVOS.filter((permiso) => !permisos.includes(permiso));
    if (!faltantes.length) continue;
    await knex('roles')
      .where({ clave })
      .update({
        permisos: JSON.stringify([...permisos, ...faltantes]),
        actualizado_en: new Date()
      });
  }
}

export async function down(knex) {
  if (!(await knex.schema.hasTable('roles'))) return;
  for (const clave of ROLES) {
    const fila = await knex('roles').where({ clave }).first();
    if (!fila) continue;
    let permisos = [];
    try {
      const valor = fila.permisos ? JSON.parse(fila.permisos) : [];
      permisos = Array.isArray(valor) ? valor : [];
    } catch {
      permisos = [];
    }
    const restantes = permisos.filter((permiso) => !NUEVOS.includes(permiso));
    if (restantes.length === permisos.length) continue;
    await knex('roles')
      .where({ clave })
      .update({
        permisos: JSON.stringify(restantes),
        actualizado_en: new Date()
      });
  }
}
