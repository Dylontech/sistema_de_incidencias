/**
 * El rol `cuadrilla` debe existir en el ENUM de `usuarios.rol`.
 *
 * Sin este cambio MariaDB inserta la cuenta con `rol=''` (o la rechaza en modo
 * estricto), aunque el servicio ya la haya validado.
 */
const ROLES_BASE = [
  'ciudadano',
  'cuadrilla',
  'funcionario',
  'auditor',
  'enlace_estatal',
  'enlace_federal',
  'soporte',
  'admin_municipal',
  'admin_estatal',
  'admin'
];

const ROLES_SIN_CUADRILLA = ROLES_BASE.filter((rol) => rol !== 'cuadrilla');

function enumSql(roles) {
  return roles.map((rol) => `'${rol}'`).join(',');
}

export async function up(knex) {
  await knex.raw(`ALTER TABLE usuarios MODIFY COLUMN rol ENUM(${enumSql(ROLES_BASE)}) NOT NULL`);
}

export async function down(knex) {
  await knex('usuarios').where({ rol: 'cuadrilla' }).update({ rol: 'funcionario' });
  await knex.raw(
    `ALTER TABLE usuarios MODIFY COLUMN rol ENUM(${enumSql(ROLES_SIN_CUADRILLA)}) NOT NULL`
  );
}
