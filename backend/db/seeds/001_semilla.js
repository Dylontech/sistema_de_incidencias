/**
 * Semilla de la base de datos con los mismos datos que el driver JSON
 * (extraídos del monolito por scripts/extraer-semilla.mjs).
 *
 *   npm --prefix backend run seed
 */
import {
  municipiosSemilla,
  zonasSemilla,
  tiposSemilla,
  usuariosSemilla
} from '../../src/config/semilla.js';
import { TIPOS_ZONA } from '../../src/models/zona.model.js';
import { hashearPassword } from '../../src/models/usuario.model.js';

/**
 * Trocea una lista para insertarla por lotes.
 *
 * Con los tres estados el catálogo pasa de 6 000 comunidades y una sola
 * sentencia INSERT se acerca al `max_allowed_packet` de MariaDB, así que se
 * inserta por partes.
 */
function enLotes(lista, tamano = 500) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
}

export async function seed(knex) {
  // Idempotente: se vacían las tablas de catálogo respetando las dependencias.
  await knex('incidencia_comentarios').del();
  await knex('incidencia_historial').del();
  await knex('incidencia_evidencias').del();
  await knex('incidencias').del();
  await knex('notificaciones').del();
  await knex('usuarios').del();
  await knex('zonas').del();
  await knex('tipos').del();
  await knex('municipios').del();

  await knex('municipios').insert(
    municipiosSemilla.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      estado: m.estado,
      clave: m.clave,
      center_lat: m.center[0],
      center_lng: m.center[1],
      zoom: m.zoom,
      poblacion: Number(m.poblacion) || 0,
      cabecera: m.cabecera || null,
      poligono: JSON.stringify(m.poligono)
    }))
  );

  const zonas = zonasSemilla.map((z) => ({
    id: z.id,
    municipio_id: z.municipioId,
    nombre: z.nombre,
    tipo: TIPOS_ZONA.includes(z.tipo) ? z.tipo : 'localidad',
    ambito: z.ambito || null,
    clave: z.clave || null,
    poblacion: Number(z.poblacion) || 0,
    color: z.color,
    poligono: JSON.stringify(z.poligono)
  }));
  for (const lote of enLotes(zonas)) {
    await knex('zonas').insert(lote);
  }

  await knex('tipos').insert(
    tiposSemilla.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      icono: t.icono,
      aviso: t.aviso || null,
      custom: t.custom === true
    }))
  );

  const usuarios = [];
  for (const u of usuariosSemilla) {
    usuarios.push({
      id: u.id,
      username: u.username,
      nombre: u.nombre,
      rol: u.rol,
      municipio_id: u.municipioId ?? null,
      activo: u.activo !== false,
      password_hash: await hashearPassword(u.passwordInicial)
    });
  }
  await knex('usuarios').insert(usuarios);

  console.log(
    `Semilla aplicada: ${municipiosSemilla.length} municipios, ${zonasSemilla.length} zonas, ` +
      `${tiposSemilla.length} tipos y ${usuarios.length} usuarios.`
  );}
