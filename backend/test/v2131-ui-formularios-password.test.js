/**
 * V2.13.1: los campos de contraseña servidos deben vivir dentro de un formulario.
 *
 * Chrome avisa `[DOM] Password field is not contained in a form` cuando un
 * input de contraseña queda fuera de un <form>. Además de la accesibilidad,
 * el formulario permite que el gestor de contraseñas reconozca el campo y que
 * Enter envíe la acción sin exponer nada en la URL: la delegación de
 * `core/eventos.js` intercepta el submit y las acciones se declaran con
 * `data-submit`.
 *
 * V2.13.2: Chrome pide además un campo de usuario dentro del formulario. Los
 * dos modales muestran la cuenta en un campo `readonly` con
 * `autocomplete="username"` antes de la contraseña; la prueba genérica exige
 * ese campo en todo formulario con `current-password`.
 *
 * Estas pruebas recorren todo el HTML servido y fijan el contrato de los dos
 * modales de la cuenta (congelar y eliminar).
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const frontend = path.join(raiz, 'frontend');
const leer = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8');

const RE_PASSWORD = /<input\b[^>]*type\s*=\s*(["'])password\1[^>]*>/gi;

/** Rangos [inicio, fin) de cada <form>…</form> del documento. */
function rangosDeFormularios(html) {
  const rangos = [];
  const apertura = /<form\b[^>]*>/gi;
  let coincidencia;
  while ((coincidencia = apertura.exec(html))) {
    const inicio = coincidencia.index;
    const cierre = html.indexOf('</form>', apertura.lastIndex);
    if (cierre === -1) {
      throw new Error(`Formulario sin cerrar en la posición ${inicio}`);
    }
    const fin = cierre + '</form>'.length;
    rangos.push([inicio, fin]);
    apertura.lastIndex = fin;
  }
  return rangos;
}

function dentroDeAlgunFormulario(rangos, indice) {
  return rangos.some(([inicio, fin]) => indice >= inicio && indice < fin);
}

function bloqueDelModal(html, id) {
  const marca = `<div class="modal-overlay" id="${id}">`;
  const inicio = html.indexOf(marca);
  assert.notEqual(inicio, -1, `No se encontró el modal ${id}`);
  const siguiente = html.indexOf('<div class="modal-overlay"', inicio + marca.length);
  return html.slice(inicio, siguiente === -1 ? undefined : siguiente);
}

function camposPassword(html) {
  return [...html.matchAll(RE_PASSWORD)];
}

describe('V2.13.1/V2.13.2: formularios de contraseña', () => {
  test('todo input de contraseña del frontend está dentro de un formulario', () => {
    const paginas = fs.readdirSync(frontend).filter((nombre) => nombre.endsWith('.html'));
    let revisados = 0;

    for (const pagina of paginas) {
      const html = fs.readFileSync(path.join(frontend, pagina), 'utf8');
      const campos = camposPassword(html);
      if (!campos.length) continue;
      const rangos = rangosDeFormularios(html);

      for (const campo of campos) {
        revisados += 1;
        assert.ok(
          dentroDeAlgunFormulario(rangos, campo.index),
          `${pagina}: ${campo[0].slice(0, 90)}… debe estar dentro de un <form>`
        );
        assert.match(
          campo[0],
          /autocomplete="(?:current|new)-password"/,
          `${pagina}: el campo de contraseña debe declarar autocomplete`
        );
      }
    }

    assert.ok(
      revisados >= 9,
      `Se esperaban al menos 9 campos de contraseña servidos; se revisaron ${revisados}`
    );
  });

  test('todo formulario con contraseña actual declara un usuario antes de la contraseña', () => {
    const paginas = fs.readdirSync(frontend).filter((nombre) => nombre.endsWith('.html'));
    let formularios = 0;

    for (const pagina of paginas) {
      const html = fs.readFileSync(path.join(frontend, pagina), 'utf8');
      for (const [inicio, fin] of rangosDeFormularios(html)) {
        const formulario = html.slice(inicio, fin);
        if (!formulario.includes('autocomplete="current-password"')) continue;
        formularios += 1;
        const usuario = formulario.indexOf('autocomplete="username"');
        const password = formulario.indexOf('autocomplete="current-password"');
        assert.notEqual(usuario, -1, `${pagina}: falta el campo de usuario en el formulario`);
        assert.ok(usuario < password, `${pagina}: el usuario debe ir antes de la contraseña`);
      }
    }

    assert.ok(
      formularios >= 5,
      `Se esperaban al menos 5 formularios con contraseña actual; se revisaron ${formularios}`
    );
  });

  test('el modal de congelación envía con formulario y sin doble acción', () => {
    const html = leer('frontend/index.html');
    const bloque = bloqueDelModal(html, 'modalCongelarCuenta');
    const inicioForm = bloque.indexOf('<form id="formCongelarCuenta"');
    const finForm = bloque.indexOf('</form>');
    const campo = bloque.indexOf('id="congelarPassword"');
    const usuario = bloque.indexOf('id="congelarUsuario"');

    assert.ok(inicioForm !== -1, 'Falta el formulario de congelación');
    assert.ok(finForm > inicioForm, 'El formulario de congelación no está cerrado');
    const formulario = bloque.slice(inicioForm, finForm);
    assert.ok(campo > inicioForm && campo < finForm, 'La contraseña debe estar dentro del formulario');
    assert.ok(usuario > inicioForm && usuario < campo, 'El usuario debe ir antes de la contraseña');
    assert.match(bloque, /id="congelarUsuario"[^>]*autocomplete="username"/);
    assert.match(bloque, /id="congelarUsuario"[^>]*readonly/);
    assert.match(formulario, /data-submit="cuenta:congelar"/);
    assert.match(formulario, /method="post"/);
    assert.doesNotMatch(formulario, /\baction\s*=/i, 'El formulario no debe declarar action');
    assert.match(bloque, /id="congelarPassword"[^>]*autocomplete="current-password"/);
    assert.match(bloque, /<button type="submit" form="formCongelarCuenta"/);
    assert.doesNotMatch(bloque, /data-action="cuenta:congelar"/, 'El botón no debe repetir la acción');
    assert.doesNotMatch(bloque, /onsubmit=/i, 'La CSP prohíbe manejadores inline');
    assert.equal((bloque.match(/id="congelarPassword"/g) || []).length, 1);
    assert.equal(
      (html.match(/data-submit="cuenta:congelar"/g) || []).length,
      1,
      'La acción de congelar debe declararse una sola vez'
    );
    assert.doesNotMatch(
      bloque,
      /<button(?![^>]*type="button")[^>]*data-valor="modalCongelarCuenta"/i,
      'Cerrar y Cancelar deben ser type="button"'
    );
  });

  test('el modal de eliminación envía con formulario y sin doble acción', () => {
    const html = leer('frontend/index.html');
    const bloque = bloqueDelModal(html, 'modalEliminarCuenta');
    const inicioForm = bloque.indexOf('<form id="formEliminarCuenta"');
    const finForm = bloque.indexOf('</form>');

    assert.ok(inicioForm !== -1, 'Falta el formulario de eliminación');
    assert.ok(finForm > inicioForm, 'El formulario de eliminación no está cerrado');
    const formulario = bloque.slice(inicioForm, finForm);

    for (const id of ['eliminarUsuario', 'eliminarPassword', 'eliminarConfirmacion']) {
      const campo = bloque.indexOf(`id="${id}"`);
      assert.ok(campo > inicioForm && campo < finForm, `${id} debe estar dentro del formulario`);
    }

    assert.ok(
      bloque.indexOf('id="eliminarUsuario"') < bloque.indexOf('id="eliminarPassword"'),
      'El usuario debe ir antes de la contraseña'
    );
    assert.match(bloque, /id="eliminarUsuario"[^>]*autocomplete="username"/);
    assert.match(bloque, /id="eliminarUsuario"[^>]*readonly/);
    assert.match(formulario, /data-submit="cuenta:eliminar"/);
    assert.match(formulario, /method="post"/);
    assert.doesNotMatch(formulario, /\baction\s*=/i, 'El formulario no debe declarar action');
    assert.match(bloque, /id="eliminarPassword"[^>]*autocomplete="current-password"/);
    assert.match(bloque, /<button type="submit" form="formEliminarCuenta"/);
    assert.doesNotMatch(bloque, /data-action="cuenta:eliminar"/, 'El botón no debe repetir la acción');
    assert.doesNotMatch(bloque, /onsubmit=/i, 'La CSP prohíbe manejadores inline');
    assert.equal((bloque.match(/id="eliminarPassword"/g) || []).length, 1);
    assert.equal(
      (html.match(/data-submit="cuenta:eliminar"/g) || []).length,
      1,
      'La acción de eliminar debe declararse una sola vez'
    );
    assert.doesNotMatch(
      bloque,
      /<button(?![^>]*type="button")[^>]*data-valor="modalEliminarCuenta"/i,
      'Cerrar y Cancelar deben ser type="button"'
    );
  });

  test('#reg-nombre declara un solo autocomplete', () => {
    const html = leer('frontend/index.html');
    const etiqueta = html.match(/<input[^>]*id="reg-nombre"[^>]*>/)?.[0];
    assert.ok(etiqueta, 'No se encontró #reg-nombre');
    assert.equal(
      (etiqueta.match(/\bautocomplete=/g) || []).length,
      1,
      'Un atributo autocomplete duplicado hace que el navegador ignore el segundo'
    );
    assert.match(etiqueta, /autocomplete="username"/);
  });

  test('los modales rellenan la cuenta desde la sesión', () => {
    const controlador = leer('frontend/js/controllers/perfil.controller.js');
    assert.match(controlador, /function identificadorCuenta\(\)/);
    assert.match(controlador, /usuario\?\.nombre \|\| usuario\?\.correo \|\| usuario\?\.username/);
    for (const id of ['congelarUsuario', 'eliminarUsuario']) {
      assert.match(controlador, new RegExp(`getElementById\\('${id}'\\)`));
    }
  });

  test('las acciones de cuenta se registran una sola vez', () => {
    const controlador = leer('frontend/js/controllers/perfil.controller.js');
    for (const accion of ['cuenta:congelar', 'cuenta:eliminar']) {
      const definiciones = controlador.match(new RegExp(`'${accion}':`, 'g')) || [];
      assert.equal(definiciones.length, 1, `${accion} debe definirse una sola vez`);
    }
  });
});
