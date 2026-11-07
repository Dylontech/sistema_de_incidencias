/**
 * V2.11.4: contratos de interfaz del mapa sin conexión, la bandeja y los
 * reportes de conversación.
 *
 * No levanta navegador: comprueba que el HTML, el CSS y el service worker
 * exponen lo que los controladores esperan, y prueba la aritmética de teselas.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  estimarBytes,
  teselaDe,
  teselasDelBbox,
  teselasDelMunicipio,
  urlTesela
} from '../../frontend/js/map/teselas.js';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const leer = (relativo) => fs.readFileSync(path.join(RAIZ, relativo), 'utf8');

describe('V2.11.4: descarga del mapa del municipio', () => {
  test('la tesela de un punto es la esperada y respeta los límites', () => {
    // Maravatío de Ocampo en el nivel 12.
    const tesela = teselaDe(19.8916736, -100.4416672, 12);
    assert.equal(tesela.x, 905);
    assert.equal(tesela.y, 1816);
    assert.deepEqual(teselaDe(90, 200, 2), { x: 3, y: 0 });
  });

  test('el bbox devuelve una rejilla completa y ordenada', () => {
    const bbox = [
      [19.6, -100.7],
      [20.1, -100.2]
    ];
    const nivel14 = teselasDelBbox(bbox, 14);
    assert.ok(nivel14.length > 0);
    assert.ok(nivel14.every((t) => t.z === 14));
    assert.equal(new Set(nivel14.map((t) => `${t.x}:${t.y}`)).size, nivel14.length);
  });

  test('nunca supera el máximo de teselas y recorta los zooms altos', () => {
    const bbox = [
      [19.6, -100.7],
      [20.1, -100.2]
    ];
    const lista = teselasDelMunicipio(bbox, 11, 16, 320);
    assert.ok(lista.length <= 320);
    assert.ok(lista.every((t) => t.z <= 16));
    assert.equal(estimarBytes(lista), lista.length * 16 * 1024);
  });

  test('las plantillas de tesela se rellenan con subdominio, z, x e y', () => {
    assert.equal(
      urlTesela('https://{s}.tile.test/{z}/{x}/{y}.png', { x: 3, y: 5, z: 7 }, 'abc'),
      'https://c.tile.test/7/3/5.png'
    );
    assert.equal(
      urlTesela('https://server.test/{z}/{y}/{x}', { x: 1, y: 2, z: 3 }),
      'https://server.test/3/2/1'
    );
  });

  test('el service worker guarda las teselas aparte del shell', () => {
    const sw = leer('frontend/sw.js');
    assert.match(sw, /inc-teselas-v1/);
    assert.match(sw, /server\.arcgisonline\.com/);
    assert.match(sw, /tile\.opentopomap\.org/);
    assert.match(sw, /ignoreVary/);
  });

  test('la CSP permite descargar teselas de los proveedores del mapa', () => {
    const seguridad = leer('backend/src/middlewares/seguridad.js');
    assert.match(seguridad, /arcgisonline\.com/);
    assert.match(seguridad, /opentopomap\.org/);
  });

  test('el mapa ofrece el botón y el estado de la descarga', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /id="fabMapaOffline"/);
    assert.match(html, /id="mapaOfflineBox"/);
    assert.match(html, /id="mapaOfflineProgreso"/);
    assert.match(html, /data-action="mapa:offlineBorrar"/);
    assert.match(html, /data-action="mapa:offlineCancelar"/);
  });
});

describe('V2.11.4: bandeja de mensajes', () => {
  test('el pie del modal existe y los botones viven ahí', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /id="bandejaPie"/);
    assert.match(html, /class="bandeja-texto-controles"/);
    assert.match(html, /data-action="accesibilidad:textoMas"/);
    assert.match(html, /data-action="accesibilidad:textoMenos"/);
  });

  test('el visor de adjuntos tiene contenedor, nombre y descarga', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /id="modalVisorAdjunto"/);
    assert.match(html, /id="visorAdjuntoNombre"/);
    assert.match(html, /id="visorAdjuntoCuerpo"/);
    assert.match(html, /id="visorAdjuntoDescargar"/);
  });

  test('la bandeja distingue el contacto directo y ofrece reportar', () => {
    const controlador = leer('frontend/js/controllers/comunicacion.controller.js');
    assert.match(controlador, /Contacto directo/);
    assert.match(controlador, /bandeja:reportar/);
    assert.match(controlador, /bandeja:verAdjunto/);
    assert.match(controlador, /reportes-conversacion\/contexto/);
  });

  test('los PDF se sirven para verlos dentro del navegador', () => {
    const controlador = leer('backend/src/controllers/adjuntos.controller.js');
    assert.match(controlador, /application\/pdf/);
  });
});

describe('V2.11.4: vista de reportes de conversación', () => {
  test('el panel y los modales están en el HTML con sus permisos', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /data-valor="reportes-conversacion"\s+data-permiso="ver_moderacion"/);
    assert.match(html, /id="panel-reportes-conversacion"/);
    assert.match(html, /id="modalReporteConversacion"/);
    assert.match(html, /id="modalReporteResolver"/);
    assert.match(html, /data-action="bandeja:enviarReporte"/);
    assert.match(html, /data-action="reporteConv:confirmar"/);
  });

  test('la vista pinta mensajes adjuntos y las dos acciones de moderación', () => {
    const vista = leer('frontend/js/views/admin.view.js');
    assert.match(vista, /export function renderReportesConversacion/);
    assert.match(vista, /reporteConv:resolver/);
    assert.match(vista, /reporteConv:revertir/);
    assert.match(vista, /bandeja-reporte-mensaje/);
  });

  test('el controlador resuelve y revierte recargando el panel', () => {
    const controlador = leer('frontend/js/controllers/moderacion.controller.js');
    assert.match(controlador, /'reporteConv:resolver'/);
    assert.match(controlador, /'reporteConv:confirmar'/);
    assert.match(controlador, /'reporteConv:revertir'/);
    assert.match(controlador, /cargarReportesConversacion/);
  });
});
