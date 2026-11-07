/**
 * V2.11.6: contratos de interfaz de comentarios con imagen, PDF, costo de
 * resolución, archivo, reclamaciones, sesión recordada y capas del mapa.
 *
 * Sin navegador: asegura que el HTML y los módulos exponen las piezas que la
 * validación manual necesita (identificadores, acciones y permisos).
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const leer = (relativo) => fs.readFileSync(path.join(RAIZ, relativo), 'utf8');

describe('V2.11.6: sesión y registro', () => {
  test('el acceso ofrece recordar el usuario', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /id="ciud-recordar"/);
    const vista = leer('frontend/js/views/login.view.js');
    assert.match(vista, /inc_usuario_recordado/);
    assert.match(vista, /export function recordarUsuario/);
    const controlador = leer('frontend/js/controllers/auth.controller.js');
    assert.match(controlador, /recordarUsuario\(\s*datos\.identificador/);
  });

  test('los términos se aceptan antes de crear la cuenta', () => {
    const html = leer('frontend/index.html');
    const bloque = html.indexOf('id="reg-acepta"');
    const boton = html.indexOf('id="regBtnCrear"');
    assert.ok(bloque > 0 && boton > 0 && bloque < boton);
    assert.match(html, /id="reg-acepta"\s+required/);
    assert.match(html, /data-action="avisoLegal:abrir"\s+data-valor="terminos"/);
    const controlador = leer('frontend/js/controllers/auth.controller.js');
    assert.match(controlador, /aceptaTerminos !== true/);
    const vista = leer('frontend/js/views/login.view.js');
    assert.match(vista, /aceptaTerminos/);
  });
});

describe('V2.11.6: comentarios y PDF de la incidencia', () => {
  test('el detalle permite descargar el PDF solo al personal', () => {
    const vista = leer('frontend/js/views/detalle.view.js');
    assert.match(vista, /esPersonal\(usuario\)/);
    assert.match(vista, /data-action="detalle:pdf"/);
    assert.match(vista, /data-action="reclamacion:abrir"/);
    const controlador = leer('frontend/js/controllers/incidencias.controller.js');
    assert.match(controlador, /'detalle:pdf'/);
    assert.match(controlador, /descargar/);
  });

  test('el formulario de resolución pide costo y documentos', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /id="resolverCosto"/);
    const vista = leer('frontend/js/views/incidenciaForm.view.js');
    assert.match(vista, /resolverCosto/);
    assert.match(vista, /costo:/);
    const servicio = leer('frontend/js/services/incidencias.service.js');
    assert.match(servicio, /costoReparacion/);
    assert.match(servicio, /archivo/);
  });

  test('la moderación abre la conversación reportada y restringe mensajes', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /id="modalConversacionReporte"/);
    const vista = leer('frontend/js/views/admin.view.js');
    assert.match(vista, /data-action="reporteConv:ver"/);
    assert.match(vista, /data-action="reporteConv:resolver"/);
    const controlador = leer('frontend/js/controllers/moderacion.controller.js');
    assert.match(controlador, /'reporteConv:ver'/);
    assert.match(controlador, /urlPrivada/);
    const avisos = leer('frontend/js/controllers/notificaciones.controller.js');
    assert.match(avisos, /searchParams\.get\('reporte'\)/);
    assert.match(avisos, /searchParams\.get\('reclamacion'\)/);
  });
});

describe('V2.11.6: reclamaciones y archivo', () => {
  test('la bandeja administrativa tiene pestañas de reclamaciones y archivo', () => {
    const html = leer('frontend/index.html');
    assert.match(html, /data-valor="reclamaciones"\s+data-permiso="gestionar_reclamaciones"/);
    assert.match(html, /data-valor="archivo"\s+data-permiso="ver_incidencias_panel"/);
    assert.match(html, /id="panel-reclamaciones"/);
    assert.match(html, /id="reclamacionesLista"/);
    assert.match(html, /id="panel-archivo"/);
    assert.match(html, /id="archivoLista"/);
    const controlador = leer('frontend/js/controllers/admin.controller.js');
    assert.match(controlador, /reclamaciones: 'gestionar_reclamaciones'/);
    assert.match(controlador, /archivo: 'ver_incidencias_panel'/);
    assert.match(controlador, /incidenciasService\.archivo\(/);
    assert.match(controlador, /'archivo:expediente'/);
    assert.match(controlador, /'archivo:pdf'/);
  });

  test('los modales de reclamación permiten reclamar, decidir y delegar', () => {
    const html = leer('frontend/index.html');
    for (const id of [
      'modalReclamacion',
      'reclamacionMotivo',
      'reclamacionDetalle',
      'modalReclamacionResolver',
      'reclamacionDecision',
      'reclamacionRespuesta',
      'reclamacionDelegado'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    const controlador = leer('frontend/js/controllers/reclamaciones.controller.js');
    for (const accion of [
      'reclamacion:abrir',
      'reclamacion:enviar',
      'reclamacion:ver',
      'reclamacion:confirmar',
      'reclamacion:delegar',
      'reclamacion:informe',
      'reclamaciones:recargar'
    ]) {
      assert.match(controlador, new RegExp(accion));
    }
    assert.match(controlador, /reclamacionesService\.crear/);
    assert.match(controlador, /reclamacionesService\.resolver/);
    assert.match(controlador, /reclamacionesService\.delegar/);
  });

  test('el service worker precarga los módulos de reclamaciones', () => {
    const sw = leer('frontend/sw.js');
    assert.match(sw, /incidencias-shell-v2\.\d+\.\d+/);
    assert.match(sw, /reclamaciones\.service\.js/);
    assert.match(sw, /reclamaciones\.controller\.js/);
  });
});

describe('V2.11.6: descarga del mapa en cuatro capas', () => {
  test('la descarga usa todas las capas base del catálogo', () => {
    const mapa = leer('frontend/js/map/mapa.js');
    assert.match(mapa, /export function capasParaDescarga/);
    assert.match(mapa, /Object\.keys\(CATALOGO_CAPAS\)/);
    const offline = leer('frontend/js/map/mapa-offline.js');
    assert.match(offline, /capasParaDescarga\(\)/);
    assert.match(offline, /capas\.length/);
  });
});
