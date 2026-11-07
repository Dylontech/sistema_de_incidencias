/**
 * V2.11.8: contratos de accesibilidad del formulario y del formato de informes.
 *
 * Chrome avisa cuando un campo de identidad no declara `autocomplete`; además,
 * el botón «Imprimir» del constructor debe abrir el informe imprimible y no
 * imprimir la aplicación. Estas comprobaciones evitan que ambas cosas vuelvan
 * a romperse sin que nadie lo note.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const leer = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8');

describe('V2.11.8: autocompletado y formato de informes', () => {
  const html = leer('frontend/index.html');

  test('los campos de acceso, alta y contacto declaran autocomplete', () => {
    assert.match(html, /id="ciud-nombre"[^>]*autocomplete="username"/);
    assert.match(html, /id="ciud-pass"[^>]*autocomplete="current-password"/);
    assert.match(html, /id="reg-nombre"[^>]*autocomplete="username"/);
    assert.match(html, /id="reg-correo"[^>]*autocomplete="email"/);
    assert.match(html, /id="reg-pass"[^>]*autocomplete="new-password"/);
    assert.match(html, /id="usuarioNombre"[^>]*autocomplete="name"/);
    assert.match(html, /id="usuarioCorreo"[^>]*autocomplete="email"/);
    assert.match(html, /id="usuarioPassword"[^>]*autocomplete="new-password"/);
    assert.match(html, /id="altaUsuarioCorreo"[^>]*autocomplete="email"/);
    assert.match(html, /id="altaUsuarioTelefono"[^>]*autocomplete="tel"/);
    assert.match(html, /id="fichaCorreo"[^>]*autocomplete="email"/);
    assert.match(html, /id="fichaTelefono"[^>]*autocomplete="tel"/);
  });

  test('los buscadores y campos libres no se autocompletan', () => {
    for (const id of [
      'filterText',
      'adminBuscar',
      'tutorialesBuscar',
      'incTitulo',
      'solInformeMensaje'
    ]) {
      assert.match(html, new RegExp(`id="${id}"[^>]*autocomplete="off"`), `${id} sin autocomplete off`);
    }
  });

  test('los campos de acceso y la bandeja modal también declaran autocomplete', () => {
    const acceso = leer('frontend/solicitud-acceso.html');
    assert.match(acceso, /id="accNombre"[^>]*autocomplete="name"/);
    assert.match(acceso, /id="accCorreo"[^>]*autocomplete="email"/);
    const html = leer('frontend/index.html');
    assert.match(html, /id="ticketsAtencionBuscar"[^>]*autocomplete="off"/);
  });

  test('las miniaturas de comentarios y bandeja no usan carga diferida', () => {
    const detalle = leer('frontend/js/views/detalle.view.js');
    const lineaComentario = detalle
      .split('\n')
      .find((linea) => linea.includes('class="c-adjunto"'));
    assert.ok(lineaComentario, 'No se encontró la miniatura de comentarios');
    assert.doesNotMatch(lineaComentario, /loading="lazy"/);
    assert.match(detalle, /id="nuevoComentario"[^>]*autocomplete="off"/);
    assert.match(detalle, /id="firmasMetaInput"[^>]*autocomplete="off"/);

    const comunicacion = leer('frontend/js/controllers/comunicacion.controller.js');
    const lineaBandeja = comunicacion
      .split('\n')
      .find((linea) => linea.includes('bandeja-adjunto-imagen'));
    assert.ok(lineaBandeja, 'No se encontró la miniatura de la bandeja');
    assert.doesNotMatch(lineaBandeja, /loading="lazy"/);
  });

  test('el botón Imprimir del constructor abre el informe imprimible', () => {
    const controlador = leer('frontend/js/controllers/reportes.controller.js');
    const definiciones = controlador.match(/'reportes:imprimir':/g) || [];
    assert.equal(definiciones.length, 1, 'reportes:imprimir debe definirse una sola vez');
    assert.match(controlador, /'reportes:imprimible':/);

    const accionesImprimir = html.match(/data-action="reportes:imprimir"/g) || [];
    assert.equal(accionesImprimir.length, 1, 'Solo la vista heredada imprime la aplicación');
    const accionesImprimible = html.match(/data-action="reportes:imprimible"/g) || [];
    assert.equal(accionesImprimible.length, 2, 'Constructor y exportación abren el informe');
  });
});
