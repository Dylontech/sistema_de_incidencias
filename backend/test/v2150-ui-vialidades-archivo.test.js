/**
 * V2.15.0 — Contratos de interfaz de la capa de vialidades y el archivo.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const leer = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8');

describe('V2.15.0: condición de vialidades en el mapa', () => {
  test('la leyenda ofrece el control y los cinco niveles de color', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /id="infoPanel"/);
    assert.match(html, /id="btnVialidades"/);
    assert.match(html, /data-action="mapa:vialidades"/);
    assert.match(html, /id="legendVialidades"/);
    assert.match(html, /Semáforo de vialidades/);
    assert.match(html, /Verde, amarillo, naranja, rojo y negro/i);
  });

  test('el controlador y la capa registran la acción', () => {
    const controlador = leer('frontend/js/controllers/incidencias.controller.js');
    assert.match(controlador, /'mapa:vialidades'/);
    assert.match(controlador, /incidenciasService\.vialidades/);
    const capa = leer('frontend/js/map/vialidades.js');
    assert.match(capa, /export function alternar/);
    assert.match(capa, /export function dibujar/);
    assert.match(capa, /L\.geoJSON/);
    assert.match(capa, /datos\.escala/);
    assert.doesNotMatch(capa, /dashArray/);
    assert.match(leer('frontend/js/map/mapa.js'), /capaVialidades\.inicializar/);
  });

  test('el service worker precarga la capa', () => {
    assert.match(leer('frontend/sw.js'), /\/js\/map\/vialidades\.js/);
  });
});

describe('V2.15.0: archivo general por fecha y expediente', () => {
  test('el panel declara filtros, carpetas y acciones de descarga', () => {
    const html = leer('frontend/index.html');
    for (const id of ['archivoDesde', 'archivoHasta', 'archivoTexto', 'archivoResumen', 'archivoCarpetas']) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /data-action="archivo:filtrar"/);
    assert.match(html, /data-action="archivo:limpiar"/);
  });

  test('la vista pinta meses/días y el controlador registra expediente y PDF', () => {
    const vista = leer('frontend/js/views/admin.view.js');
    assert.match(vista, /archivo-mes/);
    assert.match(vista, /archivo-dia/);
    assert.match(vista, /archivo:expediente/);
    assert.match(vista, /archivo:pdf/);
    const controlador = leer('frontend/js/controllers/admin.controller.js');
    assert.match(controlador, /incidenciasService\.archivo\(/);
    assert.match(controlador, /incidenciasService\.expediente/);
    assert.match(controlador, /'archivo:filtrar'/);
    assert.match(controlador, /'archivo:expediente'/);
    assert.match(controlador, /'archivo:pdf'/);
  });
});
