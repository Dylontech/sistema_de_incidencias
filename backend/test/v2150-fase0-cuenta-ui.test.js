/**
 * V2.15.0 — Fase 0: regresiones de «Mi cuenta», «recordar cuenta» y botones.
 *
 * Son pruebas de contrato estático: verifican el orden de las llamadas y las
 * clases/estructuras que evitan los fallos reproducidos en el navegador sin
 * depender de un DOM completo.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const leer = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8');

function bloqueEntre(texto, inicio, fin) {
  const desde = texto.indexOf(inicio);
  const hasta = texto.indexOf(fin, desde + inicio.length);
  assert.ok(desde !== -1, `No se encontró ${inicio}`);
  assert.ok(hasta > desde, `No se encontró ${fin} después de ${inicio}`);
  return texto.slice(desde, hasta);
}

describe('V2.15.0: Mi cuenta no se bloquea por APIs exclusivas del personal', () => {
  const controlador = leer('frontend/js/controllers/perfil.controller.js');

  test('pintarSolicitudes sale antes de llamar a la API si no es personal', () => {
    const bloque = bloqueEntre(
      controlador,
      'async function pintarSolicitudes()',
      'async function pintarSolicitudesPassword()'
    );
    const guarda = bloque.indexOf('if (!sesion.esEmpleado())');
    const llamada = bloque.indexOf('permisosService.mias()');
    assert.ok(guarda !== -1, 'Falta la guarda de rol en pintarSolicitudes');
    assert.ok(llamada !== -1, 'No se encontró la llamada a permisosService.mias');
    assert.ok(guarda < llamada, 'La guarda debe ejecutarse antes de la petición');
  });

  test('perfil:abrir tolera fallos opcionales y siempre abre el modal', () => {
    const bloque = bloqueEntre(controlador, "'perfil:abrir'", "'perfil:irAlLogin'");
    assert.match(bloque, /Promise\.allSettled\(/);
    assert.match(bloque, /abrirModal\('modalPerfil'/);
    assert.ok(
      bloque.indexOf('Promise.allSettled') < bloque.indexOf("abrirModal('modalPerfil'"),
      'El modal debe abrirse después de intentar pintar los bloques'
    );
  });

  test('el HTML separa los bloques de personal y ofrece CTA al anónimo', () => {
    const html = leer('frontend/index.html');
    for (const id of [
      'perfilAnonimoBox',
      'perfilPermisosBox',
      'perfilSolicitudesBajaBox',
      'perfilSolicitudesAltaBox',
      'perfilSolicitudesBox'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`), `Falta ${id}`);
    }
    assert.match(html, /data-action="perfil:irAlLogin"\s+data-valor="registro"/);
    assert.match(html, /data-action="perfil:irAlLogin"\s+data-valor="login"/);
  });

  test('«Mi cuenta» sigue visible para el anónimo y el botón de avisos se alterna sin style inline', () => {
    const vista = leer('frontend/js/views/login.view.js');
    assert.doesNotMatch(
      vista,
      /for \(const id of \['linkMiCuenta', 'linkTickets', 'linkInformesPublicos'\]\)/
    );
    assert.match(vista, /miCuenta\.hidden = false/);
    assert.match(vista, /botonNotifConfig\.hidden = !esEmpleado/);
    assert.match(vista, /botonNotifConfig\.classList\.toggle\('u-oculto', !esEmpleado\)/);
    assert.doesNotMatch(
      vista,
      /\$\('btn-notif-config'\)\.style\.display/
    );
  });
});

describe('V2.15.0: recordar cuenta solo después de un acceso correcto', () => {
  test('el acceso ciudadano espera el resultado antes de guardar el identificador', () => {
    const controlador = leer('frontend/js/controllers/auth.controller.js');
    const bloque = bloqueEntre(controlador, "'auth:entrarCiudadano'", "'auth:registrar'");
    const espera = bloque.indexOf('const exito = await entrar');
    const guarda = bloque.indexOf('recordarUsuario(datos.identificador');
    assert.ok(espera !== -1, 'Falta capturar el resultado de entrar');
    assert.ok(guarda !== -1, 'Falta guardar el identificador');
    assert.ok(espera < guarda, 'No se debe guardar antes de conocer el resultado');
    assert.match(bloque, /if \(exito\)/);
  });

  test('el alta guarda el nombre asignado después de entrar', () => {
    const controlador = leer('frontend/js/controllers/auth.controller.js');
    const bloque = bloqueEntre(
      controlador,
      "'auth:registrar'",
      "'auth:reenviarVerificacion': () =>"
    );
    assert.match(bloque, /const exito = await entrar/);
    assert.match(bloque, /if \(exito\)/);
    assert.match(bloque, /recordarUsuario\(nombreCuenta, true\)/);
  });

  test('el acceso del personal recuerda el usuario en el callback de éxito', () => {
    const personal = leer('frontend/js/personal.js');
    const bloque = bloqueEntre(personal, "$('formFunc').addEventListener", "$('formAdmin').addEventListener");
    const recordar = bloque.indexOf('const recordar =');
    const entrar = bloque.indexOf('entrar(');
    const guardar = bloque.indexOf('() => recordarUsuario');
    assert.ok(recordar !== -1 && entrar !== -1 && guardar !== -1);
    assert.ok(recordar < entrar, 'La preferencia se lee antes de entrar');
    assert.ok(entrar < guardar, 'El guardado debe ir como callback de éxito');
    assert.doesNotMatch(bloque, /recordarUsuario\(datos\.username, \$('recordarUsuario')\.checked\);\s*\n\s*entrar/);
  });
});

describe('V2.15.0: botón de preferencias y botones resistentes', () => {
  const html = leer('frontend/index.html');

  test('el engranaje es un botón real y coherente con el resto del header', () => {
    const boton = html.match(
      /<button[^>]*id="btn-notif-config"[^>]*>[\s\S]*?<\/button>/
    )?.[0];
    assert.ok(boton, 'No se encontró el botón de preferencias');
    assert.match(boton, /type="button"/);
    assert.match(boton, /class="btn btn-sm btn-outline u-oculto"/);
    assert.match(boton, /aria-label="Preferencias de notificaciones"/);
    assert.match(html, /data-action="notificaciones:archivarTodas"[^>]*aria-label="Archivar todas"/);
  });

  test('los botones permiten partir texto y los filtros envuelven', () => {
    const base = leer('frontend/css/base.css');
    assert.match(base, /\.btn \{[\s\S]*white-space: normal/);
    assert.match(base, /\.btn \{[\s\S]*overflow-wrap: anywhere/);
    const layout = leer('frontend/css/layout.css');
    assert.match(layout, /\.filter-row \{[^}]*flex-wrap: wrap/);
    assert.match(layout, /\.filter-row > \* \{[^}]*min-width: 0/);
    const componentes = leer('frontend/css/componentes.css');
    assert.match(componentes, /\.notif-header \{[^}]*flex-wrap: wrap/);
    assert.match(componentes, /\.notif-panel \{[^}]*max-width: calc\(100vw - 32px\)/);
  });

  test('A+ no reduce el texto y los botones acompañan la escala', () => {
    const extensiones = leer('frontend/css/extensiones.css');
    assert.doesNotMatch(extensiones, /html\[data-texto='grande'\][^{]*\{[^}]*font-size: 13px/);
    assert.doesNotMatch(extensiones, /html\[data-texto='muy-grande'\][^{]*\{[^}]*font-size: 15px/);
    const legibilidad = leer('frontend/css/legibilidad.css');
    assert.match(legibilidad, /\.btn \{ font-size: var\(--fs-campo\); \}/);
    assert.match(legibilidad, /\.btn\.btn-sm \{ font-size: var\(--fs-min\); \}/);
  });
});
