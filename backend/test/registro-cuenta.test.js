/**
 * Alta y acceso de cuentas ciudadanas: contrato de la interfaz y API real.
 *
 * El acceso es por nombre (o pseudónimo) y contraseña; el correo es solo un
 * dato de contacto y no identifica la cuenta. Estas pruebas fijan el orden de
 * las capas del aviso, los formularios de alta y acceso, el mensaje con la
 * credencial y las respuestas de la API (pseudónimos únicos, nombre repetido,
 * correos compartidos y entrada por nombre).
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api } from './helpers/api.js';

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

/** z-index declarado en el primer bloque del selector. */
function zIndexDe(css, selector) {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bloque = css.match(new RegExp(`${escapado}\\s*\\{([^}]*)\\}`));
  assert.ok(bloque, `No se encontró el bloque de ${selector}`);
  const valor = bloque[1].match(/z-index:\s*(-?\d+)/);
  assert.ok(valor, `${selector} no declara z-index`);
  return Number(valor[1]);
}

const correoUnico = (prefijo) =>
  `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@ejemplo.mx`;

/** El nombre es la credencial de acceso: cada prueba usa uno libre. */
const nombreUnico = (base) =>
  `${base} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

describe('Alta de cuenta: el aviso siempre es visible', () => {
  test('el aviso y el velo de carga quedan por encima del acceso y del paso previo', () => {
    const componentes = leer('css/componentes.css');
    const acceso = zIndexDe(leer('css/base.css'), '.login-screen');
    const pasoPrevio = zIndexDe(leer('css/extensiones.css'), '.onboarding');
    const carga = zIndexDe(componentes, '.loading-overlay');
    const aviso = zIndexDe(componentes, '.toast');

    assert.ok(carga > acceso, `la carga (${carga}) debe superar el acceso (${acceso})`);
    assert.ok(carga > pasoPrevio, `la carga (${carga}) debe superar el paso previo (${pasoPrevio})`);
    assert.ok(aviso > carga, `el aviso (${aviso}) debe superar la carga (${carga})`);
  });

  test('los formularios de alta y acceso declaran su acción, validan y tienen aviso propio', () => {
    const html = leer('index.html');
    assert.match(html, /<form data-submit="auth:registrar">/);
    assert.match(html, /id="loginMensaje"[^>]*role="status"/);
    assert.match(html, /id="reg-correo"[^>]*required/);
    assert.match(html, /id="reg-pass"[^>]*minlength="8"/);
    assert.match(html, /id="reg-pass"[^>]*required/);
    assert.match(html, /id="reg-nombre"[^>]*required/);
    assert.match(html, /id="regNombreCampo"/);
    assert.match(html, /id="regBtnCrear"/);

    // Acceso de quien ya tiene cuenta: nombre o pseudónimo + contraseña.
    assert.match(html, /<form data-submit="auth:entrarCiudadano">/);
    assert.match(html, /id="ciud-nombre"[^>]*required/);
    assert.match(html, /id="ciudBtnEntrar"/);
    assert.match(
      html,
      /id="btn-login"[^>]*data-action="auth:mostrarLogin"[^>]*data-valor="login"/
    );
  });

  test('la vista pinta el error en la tarjeta y no usa estilos inline', () => {
    const vista = leer('js/views/login.view.js');
    assert.match(vista, /export function mensaje\(/);
    assert.match(vista, /export function limpiarMensaje\(/);
    assert.match(vista, /export function prepararLogin\(/);
    assert.match(vista, /export function valoresCiudadano\(\)/);
    assert.match(vista, /campo\.required = !marcado/);
    // El nombre del alta se oculta con `hidden`/`u-oculto`, no con estilos inline.
    assert.doesNotMatch(vista, /campo\.style\./);
  });

  test('el controlador ofrece entrar con el nombre ocupado y bloquea el doble envío', () => {
    const controlador = leer('js/controllers/auth.controller.js');
    assert.match(controlador, /'auth:usarNombre'/);
    assert.match(controlador, /error\?\.estado === 409/);
    assert.match(controlador, /Ese nombre ya tiene una cuenta/);
    assert.match(controlador, /function ocupado\(/);
    assert.match(controlador, /textoCarga: 'Creando tu cuenta…'/);
    assert.match(controlador, /Tu cuenta quedó como/);
  });
});

describe('Alta y acceso: API', () => {
  test('crea la cuenta con nombre real y permite entrar con ese nombre', async () => {
    const correo = correoUnico('alta');
    const nombre = nombreUnico('Vecina Alta');
    const r = await Api.registrar(app, { correo, password: 'segura1234', nombre });

    assert.equal(r.status, 201);
    assert.ok(r.body.token);
    assert.equal(r.body.usuario.rol, 'ciudadano');
    assert.equal(r.body.usuario.nombre, nombre);
    assert.equal(r.body.usuario.correo, correo);

    const entrada = await Api.entrarCiudadano(app, { nombre, password: 'segura1234' });
    assert.equal(entrada.status, 200);
    assert.equal(entrada.body.usuario.nombre, nombre);
  });

  test('sortea pseudónimos y no repite ninguno de los existentes', async () => {
    const nombres = new Set();
    for (let i = 0; i < 4; i += 1) {
      const r = await Api.registrar(app, {
        correo: correoUnico(`pseudo${i}`),
        password: 'segura1234',
        pseudonimo: true
      });
      assert.equal(r.status, 201);
      const generado = String(r.body.usuario.nombre || '').trim();
      assert.ok(generado.length > 0);
      nombres.add(generado.toLowerCase());
    }
    assert.equal(nombres.size, 4, 'cada pseudónimo debe ser distinto');
  });

  test('no admite dos cuentas con el mismo correo, aunque cambie de mayúsculas', async () => {
    const correo = correoUnico('repetido');
    const primera = await Api.registrar(app, {
      correo,
      password: 'segura1234',
      nombre: nombreUnico('Persona Uno')
    });
    assert.equal(primera.status, 201);

    const segunda = await Api.registrar(app, {
      correo: correo.toUpperCase(),
      password: 'segura1234',
      nombre: nombreUnico('Persona Dos')
    });
    assert.equal(segunda.status, 409);
    assert.match(segunda.body.error, /correo ya está registrado/i);
  });

  test('rechaza un nombre de acceso repetido', async () => {
    const nombre = nombreUnico('Nombre Repetido');
    const primera = await Api.registrar(app, {
      correo: correoUnico('nombre1'),
      password: 'segura1234',
      nombre
    });
    assert.equal(primera.status, 201);

    const segunda = await Api.registrar(app, {
      correo: correoUnico('nombre2'),
      password: 'segura1234',
      nombre
    });
    assert.equal(segunda.status, 409);
    assert.match(segunda.body.error, /ya está en uso/i);
  });

  test('entra sin distinguir mayúsculas ni acentos y rechaza la contraseña mala', async () => {
    const nombre = nombreUnico('María Acceso');
    const correo = correoUnico('acceso');
    const alta = await Api.registrar(app, { correo, password: 'segura1234', nombre });
    assert.equal(alta.status, 201);

    const sinAcentos = await Api.entrarCiudadano(app, {
      nombre: nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
      password: 'segura1234'
    });
    assert.equal(sinAcentos.status, 200);

    const mala = await Api.entrarCiudadano(app, { nombre, password: 'incorrecta' });
    assert.equal(mala.status, 401);

    const desconocida = await Api.entrarCiudadano(app, {
      nombre: nombreUnico('Nadie'),
      password: 'segura1234'
    });
    assert.equal(desconocida.status, 401);

    // Respaldo por correo para las cuentas creadas antes del cambio.
    const porCorreo = await Api.entrarCiudadano(app, { correo, password: 'segura1234' });
    assert.equal(porCorreo.status, 200);
  });

  test('rechaza la contraseña corta con el detalle del campo', async () => {
    const r = await Api.registrar(app, {
      correo: correoUnico('corta'),
      password: 'corta',
      nombre: nombreUnico('Vecina Corta')
    });

    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'Datos inválidos');
    assert.ok(
      Array.isArray(r.body.detalles) && r.body.detalles.some((d) => d.campo === 'password'),
      'la respuesta debe indicar el campo password'
    );
  });
});
