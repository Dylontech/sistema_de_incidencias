/**
 * Extrae el CSS del monolito (legacy/) y lo reparte en los archivos del
 * frontend modular.
 *
 *   node scripts/extraer-css.mjs
 *
 * Reparto:
 *   base.css        BASE + LOGIN (reset, variables, botones, formularios, login)
 *   layout.css      APP SHELL (topbar, sidebar, filtros, listado, mapa, leyenda)
 *   componentes.css MODALES + detalle + notificaciones + panel de leyenda +
 *                   toast/loading, marcadores y utilidades
 *   admin.css       Panel de administración y tablas de datos
 *
 * IMPORTANTE: las secciones se delimitan por sus BLOQUES DE COMENTARIO
 * completos, no por la línea del título. Cortar por el título dejaba un `*​/`
 * huérfano que el navegador interpretaba como fin de comentario y con ello
 * DESCARTABA LA REGLA SIGUIENTE (así se perdieron `.app` y `.modal-overlay`,
 * que dejaron la aplicación sin columna y los modales sin ser flotantes).
 *
 * Al final se verifica que el CSS extraído, sin comentarios, sea idéntico al
 * del monolito: si no coincide, el script falla y no escribe nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const legacyHtml = path.resolve(backendRoot, '../legacy/sistema_de_incidencias.html');
const destino = path.resolve(backendRoot, '../frontend/css');

/** Título del bloque de comentario → archivo de destino. */
const DESTINO = {
  BASE: 'base.css',
  LOGIN: 'base.css',
  'APP SHELL': 'layout.css',
  MODALES: 'componentes.css',
  'Admin panel': 'admin.css',
  Toast: 'componentes.css'
};
const POR_DEFECTO = 'componentes.css';
const TITULOS = Object.keys(DESTINO);

const html = fs.readFileSync(legacyHtml, 'utf8');
const css = html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>'));

/** Quita comentarios y normaliza espacios, para poder comparar CSS. */
const normalizar = (texto) =>
  texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Localiza los bloques de comentario que actúan como cabecera de sección. */
function secciones(texto) {
  const encontradas = [];
  const re = /\/\*[\s\S]*?\*\//g;
  let coincidencia;
  while ((coincidencia = re.exec(texto))) {
    const titulo = TITULOS.find((t) => coincidencia[0].includes(t));
    if (titulo) encontradas.push({ titulo, inicio: coincidencia.index, fin: re.lastIndex });
  }
  if (!encontradas.length) throw new Error('No se encontró ninguna cabecera de sección en el CSS');

  // El contenido de cada sección va desde el FINAL de su comentario hasta el
  // inicio del siguiente (así se conservan los subcomentarios internos).
  return encontradas.map((seccion, indice) => ({
    titulo: seccion.titulo,
    contenido: texto
      .slice(seccion.fin, indice + 1 < encontradas.length ? encontradas[indice + 1].inicio : texto.length)
      .trim()
  }));
}

const lista = secciones(css);

// Contenido previo a la primera cabecera (si lo hubiera) no debe perderse.
const preludio = css.slice(0, css.indexOf('/*')).trim();

const porArchivo = new Map();
for (const { titulo, contenido } of lista) {
  const archivo = DESTINO[titulo] || POR_DEFECTO;
  if (!porArchivo.has(archivo)) porArchivo.set(archivo, []);
  porArchivo.get(archivo).push({ titulo, contenido });
}
if (preludio) {
  const primero = [...porArchivo.keys()][0];
  porArchivo.get(primero).unshift({ titulo: 'PRELUDIO', contenido: preludio });
}

// --- Verificación previa: no se puede perder ni duplicar una sola regla -----
// La comparación se hace en el ORDEN ORIGINAL del monolito; la agrupación por
// archivo puede reordenar secciones (p. ej. `Admin panel` va a admin.css).
const reconstruido = [preludio, ...lista.map((s) => s.contenido)].join(' ');
if (normalizar(reconstruido) !== normalizar(css)) {
  console.error('ERROR: el CSS extraído no coincide con el del monolito. No se escribió nada.');
  const original = normalizar(css);
  const extraido = normalizar(reconstruido);
  let i = 0;
  while (i < original.length && original[i] === extraido[i]) i++;
  console.error(`  Primera diferencia en el carácter ${i}:`);
  console.error(`  original: …${original.slice(Math.max(0, i - 60), i + 60)}`);
  console.error(`  extraído: …${extraido.slice(Math.max(0, i - 60), i + 60)}`);
  process.exit(1);
}

// --- Escritura --------------------------------------------------------------
fs.mkdirSync(destino, { recursive: true });
const resumen = [];
for (const [archivo, bloques] of porArchivo) {
  const cabecera =
    '/* Estilos del Sistema de Incidencias Municipales.\n' +
    '   Extraídos del monolito original (legacy/) sin cambios. */\n\n';
  const contenido = bloques
    .map(
      (bloque) =>
        `/* ============================================================\n   ${bloque.titulo}\n   ============================================================ */\n${bloque.contenido}`
    )
    .join('\n\n');
  fs.writeFileSync(path.join(destino, archivo), `${cabecera}${contenido}\n`, 'utf8');
  resumen.push(`${archivo.padEnd(18)} ${bloques.map((b) => b.titulo).join(' + ')}`);
}

console.log(`CSS repartido en frontend/css/ (${css.split('\n').length} líneas de origen, ${lista.length} secciones):`);
resumen.forEach((linea) => console.log(`  ${linea}`));
console.log('Verificación: las reglas extraídas son idénticas al CSS del monolito.');