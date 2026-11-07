/**
 * V2.11.5: contratos de interfaz de bloqueos, panel de mapas e informes.
 *
 * Sin navegador: comprueba que el HTML y los controladores exponen las piezas
 * que las pruebas manuales necesitan (identificadores, acciones y permisos).
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const leer = (relativo) => fs.readFileSync(path.join(RAIZ, relativo), 'utf8');

describe('V2.11.5: bloqueo de cuentas en la bandeja', () => {
  test('la bandeja tiene pestaña de bloqueados y acciones de bloqueo', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /data-valor="bloqueados"/);
    assert.match(html, /id="bandejaBloqueadosLista"/);
    const controlador = leer('frontend/js/controllers/comunicacion.controller.js');
    assert.match(controlador, /bandeja:bloquear/);
    assert.match(controlador, /bandeja:desbloquear/);
    assert.match(controlador, /bloqueosService\.listar/);
    assert.match(controlador, /botonBloqueo/);
  });

  test('el reporte permite adjuntar o no los mensajes', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /id="reporteConvIncluirMensajes"/);
    assert.match(html, /reporteConv:incluirMensajes/);
    assert.match(html, /id="reporteConvAvisoMensajes"/);
    const controlador = leer('frontend/js/controllers/comunicacion.controller.js');
    assert.match(controlador, /incluirMensajes/);
    assert.match(controlador, /aplicarIncluirMensajes/);
  });

  test('los adjuntos y el botón de reportar leen sus datos del elemento', () => {
    const controlador = leer('frontend/js/controllers/comunicacion.controller.js');
    assert.match(controlador, /'bandeja:verAdjunto': \(\{ elemento \}\)/);
    assert.match(controlador, /dataset\.url/);
    assert.match(controlador, /'bandeja:reportar': \(\{ elemento, id \}\)/);
    assert.match(controlador, /dataset\.canal/);
  });
});

describe('V2.11.5: panel de mapas descargados', () => {
  test('el progreso de descarga usa el total estable de teselas', () => {
    const offline = leer('frontend/js/map/mapa-offline.js');
    assert.doesNotMatch(offline, /teselas\.length/);
    assert.match(offline, /total: porUrl\.size/);
    assert.match(offline, /descargadas === porUrl\.size/);
  });
  test('la pestaña y el panel existen con su permiso', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /data-valor="mapas"\s+data-permiso="ver_municipios_panel"/);
    assert.match(html, /id="panel-mapas"/);
    assert.match(html, /id="mapasLista"/);
    assert.match(html, /id="mapasResumen"/);
    assert.match(html, /id="mapaNuevoMunicipio"/);
  });

  test('el controlador permite descargar, actualizar, borrar y abrir', () => {
    const controlador = leer('frontend/js/controllers/mapas.controller.js');
    for (const accion of [
      'mapas:descargar',
      'mapas:actualizar',
      'mapas:borrar',
      'mapas:borrarTodo',
      'mapas:abrir',
      'mapas:recargar',
      'mapas:cancelar'
    ]) {
      assert.match(controlador, new RegExp(accion));
    }
    assert.match(controlador, /mapaOffline\.descargarMunicipio/);
    assert.match(controlador, /mapaOffline\.borrarMunicipio/);
  });
});

describe('V2.11.5: constructor de informes', () => {
  test('el modal ofrece alcance, tipos, comparación y gráficas', () => {
    const html = leer('frontend/index.html');
    for (const id of [
      'informeAlcance',
      'informeEstados',
      'informeMunicipios',
      'informeTiposModo',
      'informeTipoUnico',
      'informeTipos',
      'informeComparar',
      'informeGraficoBarras',
      'informeGraficoPastel',
      'informeGraficoSerie',
      'informeGraficoComparacion',
      'informeIncluirDetalle',
      'informeVistaPrevia'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`), `falta ${id}`);
    }
    assert.match(html, /data-action="reportes:previsualizar"/);
    assert.match(html, /data-action="reportes:pdf"/);
  });

  test('la vista previa usa SVG sin estilos en línea', () => {
    const vista = leer('frontend/js/views/reportes.view.js');
    assert.match(vista, /export function renderVistaPrevia/);
    assert.match(vista, /function svgBarras/);
    assert.match(vista, /function svgPastel/);
    assert.match(vista, /function svgSerie/);
    assert.doesNotMatch(vista, /\sstyle="/);
  });

  test('las descargas autenticadas usan blob y texto', () => {
    const api = leer('frontend/js/core/api.js');
    assert.match(api, /async blob\(ruta\)/);
    assert.match(api, /async texto\(ruta\)/);
    const controlador = leer('frontend/js/controllers/reportes.controller.js');
    assert.match(controlador, /statsService\.pdfInforme/);
    assert.match(controlador, /statsService\.csvInforme/);
    assert.match(controlador, /statsService\.datosInforme/);
  });
});
