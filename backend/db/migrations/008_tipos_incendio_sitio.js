/**
 * Migración 008 — conceptos «Incendio forestal» y «Sitio peligroso».
 *
 * Además de los dos tipos nuevos, esta migración estrena la columna `aviso`:
 * el texto que la aplicación muestra al elegir un concepto delicado (hoy solo
 * «Sitio peligroso», que avisa de la inseguridad de una zona y no señala a
 * nadie). Como los tipos son catálogo, los nombres, los emojis y el aviso se
 * leen de la semilla para no repetir los literales.
 *
 * Es idempotente: si la columna ya existe no la vuelve a crear y solo inserta
 * lo que falte, así que puede correrse sobre una instalación en marcha.
 */
import { tiposSemilla } from '../../src/config/semilla.js';

const IDS_NUEVOS = ['incendio_forestal', 'sitio_peligroso'];

export async function up(knex) {
  if (!(await knex.schema.hasColumn('tipos', 'aviso'))) {
    await knex.schema.alterTable('tipos', (t) => {
      t.text('aviso').nullable();
    });
  }

  const nuevos = tiposSemilla.filter((t) => IDS_NUEVOS.includes(t.id));
  if (nuevos.length) {
    const existentes = await knex('tipos').whereIn('id', IDS_NUEVOS).pluck('id');
    const faltantes = nuevos.filter((t) => !existentes.includes(t.id));
    if (faltantes.length) {
      await knex('tipos').insert(
        faltantes.map((t) => ({
          id: t.id,
          nombre: t.nombre,
          icono: t.icono,
          aviso: t.aviso || null,
          custom: false
        }))
      );
    }
  }

  // Los tipos base no se editan desde el panel, así que el aviso de la semilla
  // se aplica a quien no lo tenga (instalaciones que ya venían con la columna).
  for (const tipo of tiposSemilla.filter((t) => t.aviso)) {
    await knex('tipos').where({ id: tipo.id }).whereNull('aviso').update({ aviso: tipo.aviso });
  }
}

export async function down(knex) {
  await knex('tipos').whereIn('id', IDS_NUEVOS).del();

  if (await knex.schema.hasColumn('tipos', 'aviso')) {
    await knex.schema.alterTable('tipos', (t) => {
      t.dropColumn('aviso');
    });
  }
}
