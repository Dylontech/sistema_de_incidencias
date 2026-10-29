/**
 * Excepciones de permisos por cuenta.
 *
 * El rol define una matriz base (`PERMISOS_POR_ROL`); aquí se guardan solo las
 * diferencias de una cuenta concreta en un JSON: `{ "moderar": false }`.
 */
export async function up(knex) {
  if (!(await knex.schema.hasColumn('usuarios', 'permisos'))) {
    await knex.schema.alterTable('usuarios', (t) => {
      t.text('permisos', 'longtext').nullable();
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('usuarios', 'permisos')) {
    await knex.schema.alterTable('usuarios', (t) => {
      t.dropColumn('permisos');
    });
  }
}
