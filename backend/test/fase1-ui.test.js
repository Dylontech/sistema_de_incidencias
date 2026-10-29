/**
 * Regresiones de la Fase 1: arranque sin parpadeo, mensajes propios, reporte
 * rápido y cámara.
 *
 * Son pruebas de contrato sobre el HTML/CSS/JS (no levantan navegador) más una
 * comprobación real de que el alta de incidencia sigue funcionando sin `ambito`.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, incidenciaValida } from './helpers/api.js';

const FRONTEND = fileURLToPath(new URL('../../frontend', import.meta.url));
const leer = (relativo) => fs.readFileSync(path.join(FRONTEND, relativo), 'utf8');

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

describe('Fase 1: arranque sin parpadeo', () => {
  test('el login y el paso previo nacen ocultos y existe el splash', () => {
    const html = leer('index.html');
    assert.match(html, /<div class="boot-screen" id="bootScreen"/);
    assert.match(html, /<div class="login-screen" id="loginScreen" hidden>/);
    assert.match(html, /<div class="onboarding" id="onboarding" hidden>/);
  });

  test('la regla [hidden] gana a los display de clase', () => {
    assert.match(leer('css/base.css'), /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  });

  test('el splash se retira al resolver la sesión y antes del paso previo', () => {
    const main = leer('js/main.js');
    assert.match(main, /retirarArranque/);
    assert.match(main, /finally\s*\{[\s\S]*retirarArranque\(\);[\s\S]*loading\(false\);/);
    assert.match(main, /function pasoPrevio[\s\S]*retirarArranque\(\);/);
    const ui = leer('js/core/ui.js');
    assert.match(ui, /export function retirarArranque/);
    assert.match(ui, /cargaPendiente/);
  });

  test('el acceso de personal solo vuelve a la app con una sesión del personal validada', () => {
    const personal = leer('js/personal.js');
    // La app crea una sesión anónima automática: con cualquier token la puerta
    // del personal quedaría inaccesible, así que se filtra por rol y se valida.
    assert.match(personal, /ROLES_PERSONAL/);
    assert.match(personal, /await authService\.yo\(\)[\s\S]*location\.replace\(DESTINO\)/);
    assert.doesNotMatch(personal, /if\s*\(token\.leer\(\)\)/);
  });

  test('la vista principal ofrece crear cuenta a quien entra como anónimo', () => {
    const html = leer('index.html');
    assert.match(
      html,
      /id="btn-registro"[\s\S]*?data-action="auth:mostrarLogin"[\s\S]*?data-valor="registro"/
    );
    const vista = leer('js/views/login.view.js');
    assert.match(vista, /usuario\.rol === 'anonimo' \? 'inline-flex' : 'none'/);
    assert.match(leer('js/controllers/auth.controller.js'), /modo: valor === 'registro'/);
  });
});

describe('Fase 1: mensajes y confirmaciones propias', () => {
  test('el frontend ya no usa window.confirm', () => {
    assert.doesNotMatch(leer('js/core/ui.js'), /window\.confirm/);
  });

  test('existe el diálogo propio y está enlazado desde ui.js', () => {
    assert.ok(fs.existsSync(path.join(FRONTEND, 'js/core/dialogos.js')));
    assert.match(leer('js/core/ui.js'), /from '\.\/dialogos\.js'/);
    assert.match(leer('index.html'), /id="modalConfirmar"/);
  });

  test('las confirmaciones se esperan con await en los controladores', () => {
    for (const archivo of [
      'js/controllers/auth.controller.js',
      'js/controllers/admin.controller.js',
      'js/controllers/campanas.controller.js',
      'js/controllers/incidencias.controller.js',
      'js/controllers/reportes.controller.js'
    ]) {
      const contenido = leer(archivo);
      assert.doesNotMatch(contenido, /!preguntar\(/, `${archivo} debe esperar preguntar()`);
    }
  });
});

describe('Fase 1: reporte rápido', () => {
  test('el municipio llega preseleccionado y «otro municipio» es opcional', () => {
    const html = leer('index.html');
    assert.match(html, /id="incMunicipioResumen"/);
    assert.match(html, /id="incOtroMunicipio"/);
    assert.match(html, /id="incMunicipioBox"/);
  });

  test('el tipo de vía es un bloque plegable opcional', () => {
    const html = leer('index.html');
    assert.match(html, /<details class="bloque-opcional">/);
    assert.match(html, /Tipo de vía \(opcional\)/);
  });

  test('la vista permite filtrar municipios por alcance y pintar el resumen', () => {
    const vista = leer('js/views/incidenciaForm.view.js');
    assert.match(vista, /export function municipiosPermitidos/);
    assert.match(vista, /actualizarResumenMunicipio/);
    assert.match(vista, /municipioActivo/);
  });

  test('el controlador registra la acción de otro municipio', () => {
    assert.match(leer('js/controllers/incidencias.controller.js'), /'incidencias:otroMunicipio'/);
  });

  test('el alta sin ambito se guarda como urbana', async () => {
    const anon = await Api.anonimo(app, 'fase1Ambito');
    const carga = incidenciaValida();
    delete carga.ambito;

    const r = await anon.post('/api/incidencias').send(carga);
    assert.equal(r.status, 201);
    assert.equal(r.body.incidencia.ambito, 'urbano');
  });
});

describe('Fase 1: cámara', () => {
  test('hay botón, modal y módulo de captura', () => {
    const html = leer('index.html');
    assert.match(html, /data-action="incidencias:abrirCamara"/);
    assert.match(html, /id="modalCamara"/);
    assert.ok(fs.existsSync(path.join(FRONTEND, 'js/core/camara.js')));
  });

  test('el controlador conecta abrir, cerrar y capturar', () => {
    const controlador = leer('js/controllers/incidencias.controller.js');
    assert.match(controlador, /'incidencias:abrirCamara'/);
    assert.match(controlador, /'incidencias:cerrarCamara'/);
    assert.match(controlador, /'incidencias:capturarFoto'/);
    assert.match(controlador, /agregarEvidencia\(\[foto\]/);
  });

  test('la cámara se libera al cerrar el modal y al salir de la página', () => {
    const camara = leer('js/core/camara.js');
    assert.match(camara, /pagehide/);
    assert.match(camara, /getTracks\(\)\.forEach/);
  });
});

describe('Fase 1: cabeceras para cámara y service worker', () => {
  test('Permissions-Policy permite la cámara al propio origen', async () => {
    const r = await request(app).get('/');
    assert.match(r.headers['permissions-policy'], /camera=\(self\)/);
  });

  test('la CSP admite blob: para la vista previa y el service worker propio', async () => {
    const csp = (await request(app).get('/')).headers['content-security-policy'];
    assert.match(csp, /img-src[^;]*blob:/);
    assert.match(csp, /worker-src 'self'/);
  });
});
