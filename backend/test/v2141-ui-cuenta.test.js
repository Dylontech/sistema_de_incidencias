/** V2.14.1: contrato de la vista de autoservicio para cuentas ciudadanas. */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const leer = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8');

describe('V2.14.1: autoservicio ciudadano en Mi cuenta', () => {
  const html = leer('frontend/index.html');

  test('los formularios de correo y contraseña existen y envían con data-submit', () => {
    assert.match(html, /id="perfilCiudadanoBox"/);
    assert.match(html, /id="formCambiarCorreo"[^>]*data-submit="perfil:cambiarCorreo"[^>]*method="post"/);
    assert.match(html, /id="perfilCiudadanoPasswordBox"/);
    assert.match(html, /id="formCambiarPassword"[^>]*data-submit="perfil:cambiarPassword"[^>]*method="post"/);
    assert.match(html, /id="perfilNuevoCorreo"[^>]*autocomplete="email"/);
    assert.match(html, /id="perfilPasswordNueva"[^>]*autocomplete="new-password"/);
    assert.match(html, /id="perfilPasswordNueva2"[^>]*autocomplete="new-password"/);
  });

  test('cada formulario declara usuario antes de la contraseña actual', () => {
    for (const [form, usuario, password] of [
      ['formCambiarCorreo', 'perfilCorreoUsuario', 'perfilCorreoPassword'],
      ['formCambiarPassword', 'perfilPasswordUsuario', 'perfilPasswordActual']
    ]) {
      const inicio = html.indexOf(`id="${form}"`);
      const fin = html.indexOf('</form>', inicio);
      const bloque = html.slice(inicio, fin);
      assert.ok(inicio !== -1 && fin > inicio, `No se encontró ${form}`);
      assert.match(bloque, new RegExp(`id="${usuario}"[^>]*autocomplete="username"`));
      assert.ok(
        bloque.indexOf(`id="${usuario}"`) < bloque.indexOf(`id="${password}"`),
        `${usuario} debe ir antes de ${password}`
      );
    }
  });

  test('la barra lateral ofrece «Mi cuenta y mis datos» a cuentas registradas', () => {
    assert.match(html, /data-action="perfil:abrir"[^>]*id="linkMiCuenta"/);
    const boton = html.match(/<button[^>]*id="linkMiCuenta"[^>]*>[\s\S]*?<\/button>/)?.[0];
    assert.ok(boton?.includes('Mi cuenta y mis datos'), 'Falta el texto del acceso lateral');
    assert.match(leer('frontend/js/views/login.view.js'), /'linkMiCuenta'/);
  });

  test('el controlador muestra el autoservicio solo a ciudadanos y registra las acciones', () => {
    const controlador = leer('frontend/js/controllers/perfil.controller.js');
    assert.match(controlador, /const esCiudadano = sesion\.usuario\?\.rol === 'ciudadano'/);
    assert.match(controlador, /perfilCiudadanoBox/);
    assert.match(controlador, /perfilCiudadanoPasswordBox/);
    assert.match(controlador, /'perfil:cambiarCorreo'/);
    assert.match(controlador, /'perfil:cambiarPassword'/);
    assert.match(controlador, /cuentaService\.cambiarCorreo/);
    assert.match(controlador, /cuentaService\.cambiarPassword/);
    assert.match(controlador, /correo_pendiente/);
    assert.match(controlador, /cuenta=recuperada/);
  });

  test('el servicio llama a los endpoints de cuenta', () => {
    const servicio = leer('frontend/js/services/cuenta.service.js');
    assert.match(servicio, /\/cuenta\/correo/);
    assert.match(servicio, /\/cuenta\/password/);
    assert.match(servicio, /passwordActual/);
    assert.match(servicio, /passwordNueva/);
  });

  test('la página de acceso explica el cambio de correo pendiente', () => {
    assert.match(leer('frontend/js/main.js'), /correo_pendiente/);
  });
});
