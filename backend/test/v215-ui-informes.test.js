/**
 * V2.15: contratos de interfaz del rediseño de informes.
 *
 * Comprueba que el panel de diseño, el motor PDF conmutable, las gráficas
 * compartidas, el service worker y la hoja imprimible siguen el contrato.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..', '..');
const leer = (ruta) => fs.readFileSync(path.join(RAIZ, ruta), 'utf8');

test('el panel de diseño ofrece color, evidencia y valores recomendados', () => {
  const html = leer('frontend/index.html');
  for (const id of [
    'reporteColorAcento',
    'reporteEvidenciaColumnas',
    'reporteEvidenciaPosicion',
    'reporteDisenoPanel'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `falta ${id}`);
  }
  assert.match(html, /data-action="reportes:restablecerDiseno"/);
  assert.match(html, /id="reporteMargenSuperior" min="12"/);
  assert.match(html, /id="reporteMargenDerecho" min="10"/);
  assert.match(html, /id="reporteMargenInferior" min="14"/);
  assert.match(html, /id="reporteMargenIzquierdo" min="10"/);
});

test('el controlador centraliza los campos y acota los valores', () => {
  const controlador = leer('frontend/js/controllers/reportes.controller.js');
  assert.match(controlador, /const CAMPOS_DISENO = \[/);
  assert.match(controlador, /informes\.color_acento/);
  assert.match(controlador, /informes\.evidencia_columnas/);
  assert.match(controlador, /informes\.evidencia_posicion/);
  assert.match(controlador, /function normalizarCampo/);
  assert.match(controlador, /function guardarDiseno/);
  assert.match(controlador, /function invalidarCacheInformes/);
  assert.match(controlador, /function fechaLocal/);
  assert.match(controlador, /function escaparHtml/);
  assert.match(controlador, /reportes:restablecerDiseno/);
});

test('la vista imprimible usa el módulo de gráficas y las clases nuevas', () => {
  const vista = leer('frontend/js/views/reportes.view.js');
  assert.match(vista, /from '\.\/graficos-svg\.js'/);
  assert.match(vista, /graficoBarrasSvg/);
  assert.match(vista, /graficoDonaSvg/);
  assert.match(vista, /graficoSerieSvg/);
  assert.match(vista, /function svgBarras/);
  assert.match(vista, /function svgPastel/);
  assert.match(vista, /function svgSerie/);
  assert.match(vista, /class="informe-ficha"/);
  assert.match(vista, /class="informe-rejilla-2"/);
  assert.match(vista, /class="num"/);
  assert.doesNotMatch(vista, /\sstyle="/);

  const graficos = leer('frontend/js/views/graficos-svg.js');
  assert.match(graficos, /export function graficoBarrasSvg/);
  assert.match(graficos, /export function graficoDonaSvg/);
  assert.match(graficos, /export function graficoSerieSvg/);
  assert.doesNotMatch(graficos, /\sstyle="/);
});

test('el motor PDF se configura y se pregunta desde el modal', () => {
  const configuracion = leer('frontend/js/views/configuracion.view.js');
  assert.match(configuracion, /informes\.motor_pdf/);
  assert.match(configuracion, /Preguntar en cada descarga/);
  assert.match(configuracion, /const OPCIONES = \{/);

  const html = leer('frontend/index.html');
  assert.match(html, /id="modalElegirPdf"/);
  assert.match(html, /data-action="pdfVersion:elegir"/);
  assert.match(html, /data-action="pdfVersion:cerrar"/);

  const version = leer('frontend/js/controllers/versionPdf.controller.js');
  assert.match(version, /export async function elegirVersionPdf/);
  assert.match(version, /statsService\.motorPdf/);

  const detalle = leer('frontend/js/controllers/incidencias.controller.js');
  assert.match(detalle, /elegirVersionPdf/);
  assert.match(detalle, /pdf=\$\{encodeURIComponent\(motor\)\}/);

  const reclamaciones = leer('frontend/js/controllers/reclamaciones.controller.js');
  assert.match(reclamaciones, /elegirVersionPdf/);

  const stats = leer('frontend/js/services/stats.service.js');
  assert.match(stats, /motorPdf\(\)/);
  assert.match(stats, /pdfInforme\(filtros = \{\}, opciones = \{\}, motor = null\)/);
});

test('el service worker precarga las gráficas, la versión y las fuentes', () => {
  const sw = leer('frontend/sw.js');
  assert.match(sw, /incidencias-shell-v2\.17\.0/);
  assert.match(sw, /\/js\/views\/graficos-svg\.js/);
  assert.match(sw, /\/js\/controllers\/versionPdf\.controller\.js/);
  assert.match(sw, /\/fonts\/SourceSans3-Regular\.woff2/);
  assert.match(sw, /\/css\/impresion-informe\.css/);
});

test('la legibilidad no se aplica al imprimir y la hoja A4 usa la fuente nueva', () => {
  const legibilidad = leer('frontend/css/legibilidad.css');
  assert.match(legibilidad, /@media screen \{/);
  const impresion = leer('frontend/css/impresion-informe.css');
  assert.match(impresion, /Source Sans 3/);
  assert.match(impresion, /--inf-acento/);
  assert.match(impresion, /print-color-adjust: exact/);
});
