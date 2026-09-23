#!/usr/bin/env node
/**
 * MIGRACIÓN AL CATÁLOGO GEOESTADÍSTICO DEL INEGI
 *
 * Al cambiar el catálogo geográfico, los identificadores de municipio pasan de
 * un nombre corto (`maravatio`) a la clave geoestadística del INEGI (`16050`) y
 * las zonas dejan de ser colonias dibujadas a mano para ser comunidades
 * (localidades) oficiales. Este script pone al día los datos que ya existían:
 *
 *   1. `municipioId` de incidencias y usuarios: se busca el municipio nuevo por
 *      NOMBRE (la vieja lista tiene el nombre, la nueva la clave).
 *   2. `zonaId` de cada incidencia: se recalcula con el polígono que ahora
 *      contiene sus coordenadas.
 *
 * Antes de escribir nada deja una copia `<archivo>.antes.json`.
 *
 * Uso: npm --prefix backend run migrar-catalogo  [-- --seco]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { puntoEnPoligono } from '../src/utils/geometria.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const DATOS = path.join(RAIZ, 'data');
const SEMILLA = path.join(RAIZ, 'src', 'config', 'seed-data');

const seco = process.argv.includes('--seco') || process.argv.includes('--dry-run');

const leer = (ruta, porDefecto) => {
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return porDefecto;
  }
};

const respaldar = (ruta) => {
  const copia = ruta.replace(/\.json$/, '.antes.json');
  if (!fs.existsSync(copia) && fs.existsSync(ruta)) fs.copyFileSync(ruta, copia);
};

const escribir = (ruta, datos) => {
  if (seco) return;
  respaldar(ruta);
  fs.writeFileSync(ruta, `${JSON.stringify(datos, null, 2)}\n`);
};

/** Normaliza un nombre para comparar ("Maravatío" == "maravatio"). */
const normalizar = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/* ------------------------- catálogos nuevos y viejos ------------------------ */

const municipiosNuevos = leer(path.join(SEMILLA, 'municipios.json'), []);
const zonasNuevas = leer(path.join(SEMILLA, 'zonas.json'), {});
const municipiosViejos = leer(path.join(DATOS, 'municipios.json'), []);
const zonasViejas = leer(path.join(DATOS, 'zonas.json'), []);

if (!municipiosNuevos.length) {
  console.error('No hay catálogo nuevo en src/config/seed-data. Ejecuta primero el importador.');
  process.exit(1);
}

const idsNuevos = new Set(municipiosNuevos.map((m) => m.id));
/** municipio viejo (id) -> municipio nuevo (id), emparejando por nombre. */
const equivalencias = new Map();

/**
 * Busca el municipio nuevo equivalente a un identificador viejo.
 *
 * Los identificadores anteriores eran el nombre en formato corto
 * (`maravatio`), así que además de comparar con la lista vieja se compara el
 * propio identificador con el nombre del municipio. Ese respaldo es el que
 * funciona cuando el catálogo viejo ya se sobrescribió (el arranque del
 * servidor lo sincroniza en cuanto detecta el nuevo).
 */
function municipioEquivalente(idViejo, nombreViejo) {
  if (idsNuevos.has(idViejo)) return idViejo;
  const candidatos = [nombreViejo, idViejo].filter(Boolean).map(normalizar);
  const encontrado = municipiosNuevos.find((m) => candidatos.includes(normalizar(m.nombre)));
  return encontrado ? encontrado.id : null;
}

for (const viejo of municipiosViejos) {
  if (idsNuevos.has(viejo.id)) {
    equivalencias.set(viejo.id, viejo.id);
    continue;
  }
  const objetivo =
    municipioEquivalente(viejo.id, viejo.nombre) ||
    municipiosNuevos.find((m) => m.clave && m.clave === viejo.clave)?.id;
  if (objetivo) equivalencias.set(viejo.id, objetivo);
  else console.warn(`  ! No se encontró el municipio nuevo de "${viejo.nombre}" (${viejo.id})`);
}

/** Identificadores de municipio que aparecen en los datos (pueden faltar en la lista). */
for (const incidencia of leer(path.join(DATOS, 'incidencias.json'), [])) {
  if (incidencia.municipioId && !equivalencias.has(incidencia.municipioId)) {
    const objetivo = municipioEquivalente(incidencia.municipioId, null);
    if (objetivo) equivalencias.set(incidencia.municipioId, objetivo);
    else console.warn(`  ! Incidencia ${incidencia.id}: municipio "${incidencia.municipioId}" sin equivalencia`);
  }
}
for (const usuario of leer(path.join(DATOS, 'usuarios.json'), [])) {
  if (usuario.municipioId && !equivalencias.has(usuario.municipioId)) {
    const objetivo = municipioEquivalente(usuario.municipioId, null);
    if (objetivo) equivalencias.set(usuario.municipioId, objetivo);
  }
}

/** municipio viejo (id) -> zonas nuevas de su municipio. */
const zonasPorMunicipioNuevo = (municipioNuevoId) => zonasNuevas[municipioNuevoId] || [];

/** Zona nueva que contiene un punto (o null). */
const zonaDePunto = (municipioNuevoId, lat, lng) => {
  if (lat == null || lng == null) return null;
  return zonasPorMunicipioNuevo(municipioNuevoId).find((z) => puntoEnPoligono(lat, lng, z.poligono)) || null;
};

console.log(
  `Municipios: ${municipiosViejos.length} datos → ${municipiosNuevos.length} catálogo · ` +
    `equivalencias: ${equivalencias.size} · zonas nuevas: ${Object.values(zonasNuevas).flat().length}`
);
if (!equivalencias.size) {
  console.log('Nada que migrar: los identificadores ya coinciden.');
}

/* -------------------------------- incidencias ------------------------------ */

const rutaIncidencias = path.join(DATOS, 'incidencias.json');
const incidencias = leer(rutaIncidencias, []);
let municipiosCambiados = 0;
let zonasCambiadas = 0;
let sinZona = 0;

const incidenciasMigradas = incidencias.map((incidencia) => {
  const nuevoId = equivalencias.get(incidencia.municipioId) || incidencia.municipioId;
  const copia = { ...incidencia, municipioId: nuevoId };
  if (nuevoId !== incidencia.municipioId) municipiosCambiados++;

  const sigueExistiendo = zonasPorMunicipioNuevo(nuevoId).some((z) => z.id === incidencia.zonaId);
  if (sigueExistiendo) return copia;

  const zona = zonaDePunto(nuevoId, incidencia.lat, incidencia.lng);
  if (!zona) {
    sinZona++;
    console.warn(
      `  ! ${incidencia.id} (${incidencia.titulo}): sin comunidad del INEGI que la contenga; se deja sin zona`
    );
    return { ...copia, zonaId: null, zonaNombre: null };
  }
  zonasCambiadas++;
  return { ...copia, zonaId: zona.id, zonaNombre: zona.nombre };
});

if (incidencias.length) {
  escribir(rutaIncidencias, incidenciasMigradas);
  console.log(
    `Incidencias: ${incidencias.length} revisadas · ${municipiosCambiados} municipios reasignados · ` +
      `${zonasCambiadas} zonas recolocadas · ${sinZona} sin zona`
  );
}

/* --------------------------------- usuarios -------------------------------- */

const rutaUsuarios = path.join(DATOS, 'usuarios.json');
const usuarios = leer(rutaUsuarios, []);
let usuariosCambiados = 0;

const usuariosMigrados = usuarios.map((usuario) => {
  if (!usuario.municipioId) return usuario;
  const nuevoId = equivalencias.get(usuario.municipioId) || usuario.municipioId;
  if (nuevoId === usuario.municipioId) return usuario;
  usuariosCambiados++;
  return { ...usuario, municipioId: nuevoId };
});

if (usuarios.length) {
  escribir(rutaUsuarios, usuariosMigrados);
  console.log(`Usuarios: ${usuarios.length} revisados · ${usuariosCambiados} reasignados`);
}

/* --------------------------- resumen de zonas viejas ----------------------- */

const idsZonasViejas = new Set(zonasViejas.map((z) => z.id));
const idsZonasNuevas = new Set(Object.values(zonasNuevas).flat().map((z) => z.id));
const desaparecidas = [...idsZonasViejas].filter((id) => !idsZonasNuevas.has(id));
if (desaparecidas.length) {
  console.log(
    `Zonas antiguas sustituidas por comunidades del INEGI: ${desaparecidas.length} ` +
      `(${desaparecidas.slice(0, 6).join(', ')}${desaparecidas.length > 6 ? '…' : ''})`
  );
}

console.log(seco ? 'Simulación terminada (no se escribió nada).' : 'Migración terminada.');
