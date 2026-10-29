/**
 * Sincroniza el catálogo geográfico de MySQL/MariaDB con los JSON del INEGI.
 *
 * A diferencia de `npm run seed` (destructivo), este script SOLO inserta o
 * actualiza municipios y zonas. No borra usuarios, incidencias, claves ni
 * ningún otro dato; se puede ejecutar varias veces y es idempotente.
 *
 * Uso:
 *   npm --prefix backend run sincronizar-catalogo
 *   npm --prefix backend run sincronizar-catalogo -- --seco
 *
 * Requiere haber ejecutado `npm run importar-inegi` para generar
 * `src/config/seed-data/municipios.json` y `zonas.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import knexFactory from 'knex';
import { config } from '../src/config/index.js';

const seco = process.argv.includes('--seco') || process.argv.includes('--dry-run');
const rutaMunicipios = path.join(config.paths.seedData, 'municipios.json');
const rutaZonas = path.join(config.paths.seedData, 'zonas.json');

function leerJson(ruta, porDefecto) {
  if (!fs.existsSync(ruta)) {
    console.error(`No existe el archivo: ${ruta}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (error) {
    console.error(`El archivo ${ruta} no es un JSON válido: ${error.message}`);
    process.exit(1);
  }
}

function enLotes(lista, tamano) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
}

function centroDe(municipio) {
  const centro = municipio.center;
  if (Array.isArray(centro)) return { lat: centro[0], lng: centro[1] };
  return { lat: centro?.lat, lng: centro?.lng };
}

async function main() {
  if (config.storageDriver !== 'mysql') {
    console.error(
      `Este script escribe en MySQL/MariaDB. El driver actual es "${config.storageDriver}".`
    );
    process.exit(1);
  }

  const municipios = leerJson(rutaMunicipios, []);
  if (!Array.isArray(municipios) || !municipios.length) {
    console.error('El catálogo de municipios está vacío. Ejecuta primero el importador del INEGI.');
    process.exit(1);
  }

  console.log(
    `Catálogo: ${municipios.length} municipios en ${config.db.connection.database}` +
      `${seco ? ' · modo seco (no escribe)' : ''}`
  );

  const db = knexFactory(config.db);
  try {
    const idsMunicipios = new Set(municipios.map((m) => String(m.id)));
    let municipiosEscritos = 0;

    const lotesMunicipios = enLotes(municipios, 10);
    for (const [indice, lote] of lotesMunicipios.entries()) {
      const filas = lote.map((m) => {
        const centro = centroDe(m);
        return {
          id: String(m.id),
          nombre: m.nombre,
          estado: m.estado,
          clave: m.clave || String(m.id),
          center_lat: centro.lat,
          center_lng: centro.lng,
          zoom: Number(m.zoom) || 12,
          poblacion: Number(m.poblacion) || 0,
          cabecera: m.cabecera || null,
          poligono: JSON.stringify(m.poligono)
        };
      });
      if (!seco) {
        await db('municipios').insert(filas).onConflict('id').merge();
      }
      municipiosEscritos += filas.length;
      if (indice % 25 === 0 || indice === lotesMunicipios.length - 1) {
        console.log(`  · municipios: ${municipiosEscritos}/${municipios.length}`);
      }
    }

    // Las zonas se leen después de los municipios para no tener ambos JSON
    // completos en memoria al mismo tiempo.
    const zonasPorMunicipio = leerJson(rutaZonas, {});
    const zonas = [];
    const huerfanas = [];
    for (const [municipioId, lista] of Object.entries(zonasPorMunicipio || {})) {
      for (const zona of lista || []) {
        const municipio = String(zona.municipioId || municipioId);
        if (!idsMunicipios.has(municipio)) {
          huerfanas.push(zona.id || `${municipio}/${zona.nombre}`);
          continue;
        }
        zonas.push({ ...zona, municipioId: municipio });
      }
    }
    if (huerfanas.length) {
      console.warn(
        `  ! ${huerfanas.length} zona(s) fuera del catálogo de municipios; se omiten` +
          ` (${huerfanas.slice(0, 5).join(', ')}${huerfanas.length > 5 ? '…' : ''})`
      );
    }

    console.log(`Zonas: ${zonas.length} por sincronizar`);
    let zonasEscritas = 0;
    const lotesZonas = enLotes(zonas, 500);
    for (const [indice, lote] of lotesZonas.entries()) {
      const filas = lote.map((z) => ({
        id: String(z.id),
        municipio_id: String(z.municipioId),
        nombre: z.nombre,
        tipo: ['localidad', 'colonia', 'tenencia', 'zona', 'municipio'].includes(z.tipo)
          ? z.tipo
          : 'localidad',
        ambito: z.ambito || null,
        clave: z.clave || null,
        poblacion: Number(z.poblacion) || 0,
        color: z.color || '#2563eb',
        poligono: JSON.stringify(z.poligono)
      }));
      if (!seco) {
        await db('zonas').insert(filas).onConflict('id').merge();
      }
      zonasEscritas += filas.length;
      if (indice % 10 === 0 || indice === lotesZonas.length - 1) {
        console.log(`  · zonas: ${zonasEscritas}/${zonas.length}`);
      }
    }

    const [{ total: totalMunicipios }] = await db('municipios').count('* as total');
    const [{ total: totalZonas }] = await db('zonas').count('* as total');
    const estados = await db('municipios').distinct('estado').orderBy('estado');
    console.log(
      `\nCatálogo sincronizado: ${totalMunicipios} municipios y ${totalZonas} zonas ` +
        `en ${estados.length} entidad(es).`
    );
    if (seco) console.log('Modo seco: no se escribió nada.');
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error('No se pudo sincronizar el catálogo:', error.message);
  process.exit(1);
});
