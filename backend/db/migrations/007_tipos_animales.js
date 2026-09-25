/**
 * Migración 007 — conceptos «Animal atropellado» y «Crueldad animal».
 *
 * Los tipos son datos de catálogo y viven en la semilla, pero una instalación
 * que ya está en marcha no puede volver a sembrar (`npm run seed` borra
 * incidencias, notificaciones y usuarios), así que los conceptos nuevos se
 * añaden aquí, y solo si faltan.
 *
 * Los nombres y emojis se leen de la semilla para no repetir los literales.
 */
import { tiposSemilla } from '../../src/config/semilla.js';

const IDS_NUEVOS = ['animal_atropellado', 'crueldad_animal'];

export async function up(knex) {
  const nuevos = tiposSemilla.filter((t) => IDS_NUEVOS.includes(t.id));
  if (!nuevos.length) return;

  const existentes = await knex('tipos').whereIn('id', IDS_NUEVOS).pluck('id');
  const faltantes = nuevos.filter((t) => !existentes.includes(t.id));
  if (!faltantes.length) return;

  await knex('tipos').insert(
    faltantes.map((t) => ({ id: t.id, nombre: t.nombre, icono: t.icono, custom: false }))
  );
}

export async function down(knex) {
  await knex('tipos').whereIn('id', IDS_NUEVOS).del();
}
