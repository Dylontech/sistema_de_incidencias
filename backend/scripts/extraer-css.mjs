/**
 * Extrae el CSS del monolito (legacy/) y lo reparte en los archivos del
 * frontend modular. Se ejecuta una sola vez:
 *
 *   node scripts/extraer-css.mjs
 *
 * Reparto:
 *   base.css        BASE + LOGIN (reset, variables, botones, formularios, login)
 *   layout.css      APP SHELL (topbar, sidebar, filtros, listado, mapa, leyenda)
 *   componentes.css MODALES + detalle + notificaciones + toast/loading/mapa-marker
 *   admin.css       Panel de administración y tablas de datos
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const legacyHtml = path.resolve(backendRoot, '../legacy/sistema_de_incidencias.html');
const destino = path.resolve(backendRoot, '../frontend/css');

const html = fs.readFileSync(legacyHtml, 'utf8');
const css = html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>'));
const lineas = css.replace(/^\n/, '').split('\n');

const indiceDe = (marcador) => {
  const i = lineas.findIndex((l) => l.includes(marcador));
  if (i === -1) throw new Error(`No se encontró el marcador: ${marcador}`);
  return i;
};

// Fronteras dentro del bloque de secciones (base 0 = primer comentario BASE).
const inicioLogin = indiceDe('LOGIN');
const inicioAppShell = indiceDe('APP SHELL');
const inicioModales = indiceDe('MODALES');
const inicioAdmin = indiceDe('/* Admin panel */');
const inicioToast = indiceDe('/* Toast */');
const fin = lineas.length;

const partes = {
  'base.css': [
    ['BASE y LOGIN', 0, inicioAppShell]
  ],
  'layout.css': [
    ['APP SHELL: topbar, sidebar, filtros, listado y mapa', inicioAppShell, inicioModales]
  ],
  'componentes.css': [
    ['MODALES, detalle, evidencia y notificaciones', inicioModales, inicioAdmin],
    ['TOAST, loading, marcadores y utilidades', inicioToast, fin]
  ],
  'admin.css': [
    ['PANEL DE ADMINISTRACIÓN: pestañas, tarjetas y tablas', inicioAdmin, inicioToast]
  ]
};

fs.mkdirSync(destino, { recursive: true });
const resumen = [];
for (const [archivo, rangos] of Object.entries(partes)) {
  const bloques = rangos.map(([titulo, desde, hasta]) => {
    const cuerpo = lineas.slice(desde, hasta).join('\n').trimEnd();
    return `/* ============================================================\n   ${titulo}\n   ============================================================ */\n${cuerpo}`;
  });
  const contenido = `/* Estilos del Sistema de Incidencias Municipales.\n   Extraídos del monolito original (legacy/) sin cambios. */\n\n${bloques.join('\n\n')}\n`;
  fs.writeFileSync(path.join(destino, archivo), contenido, 'utf8');
  resumen.push(`${archivo.padEnd(18)} ${contenido.split('\n').length} líneas`);
}

console.log(`CSS repartido en frontend/css/ (${lineas.length} líneas de origen):\n  ` + resumen.join('\n  '));
console.log(`  (LOGIN empieza en la línea ${inicioLogin + 1} del CSS original)`);
