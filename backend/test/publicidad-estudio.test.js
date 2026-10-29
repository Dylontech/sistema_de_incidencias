/**
 * Contrato estático del estudio de publicidad y del editor de campañas.
 *
 * El estudio es solo interfaz: reutiliza los endpoints de publicidad y no
 * necesita tablas nuevas. Estas pruebas vigilan que los recursos, los puntos
 * de acción y la biblioteca sigan presentes sin depender de un navegador.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BIBLIOTECA, CATEGORIAS, CORREOS, FORMATOS, PALETAS } from '../../frontend/js/data/plantillas-publicidad.js';

const FRONTEND = fileURLToPath(new URL('../../frontend', import.meta.url));
const leer = (ruta) => fs.readFileSync(`${FRONTEND}/${ruta}`, 'utf8');

test('el estudio carga sus estilos, controladores y puntos de acción', () => {
  const html = leer('index.html');
  for (const archivo of [
    'css/publicidad-estudio.css',
    'js/data/plantillas-publicidad.js',
    'js/views/diseno-publicidad.js',
    'js/controllers/publicidad.controller.js',
    'js/views/publicidad.view.js'
  ]) {
    assert.ok(
      fs.existsSync(`${FRONTEND}/${archivo}`),
      `Falta el recurso del estudio: ${archivo}`
    );
  }
  assert.match(html, /href="css\/publicidad-estudio\.css"/);
  assert.match(html, /src="js\/main\.js"/);

  for (const id of [
    'publicidadBiblioteca',
    'publicidadLienzo',
    'publicidadPreview',
    'publicidadCanvaInfo',
    'publicidadLista',
    'campanasResumen',
    'campPreview',
    'campHtml',
    'campPlantilla'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `Falta el contenedor ${id}`);
  }

  for (const accion of [
    'publicidad:png',
    'publicidad:svgDiseno',
    'publicidad:csvCanva',
    'publicidad:guardarEdicion',
    'campanas:copiarHtml'
  ]) {
    assert.match(html, new RegExp(`data-action="${accion}"`), `Falta la acción ${accion}`);
  }
  assert.match(html, /data-change="campanas:plantilla"/);
  assert.match(
    leer('js/controllers/publicidad.controller.js'),
    /publicidad:usarPlantilla/,
    'La galería debe registrar la acción para aplicar una plantilla'
  );
});

test('la biblioteca mantiene plantillas, formatos y paletas utilizables', () => {
  assert.ok(BIBLIOTECA.length >= 12);
  assert.ok(CATEGORIAS.some((c) => c.clave === 'todas'));
  assert.ok(Object.keys(FORMATOS).length >= 5);
  assert.ok(PALETAS.length >= 6);
  assert.ok(CORREOS.length >= 5);

  for (const plantilla of BIBLIOTECA) {
    assert.ok(plantilla.clave, 'Toda plantilla necesita clave');
    assert.ok(FORMATOS[plantilla.formato], `Formato desconocido: ${plantilla.formato}`);
    assert.ok(PALETAS.some((p) => p.clave === plantilla.paleta), `Paleta desconocida: ${plantilla.paleta}`);
  }
});

test('el editor de campañas conserva el enlace público de suscripción', () => {
  const controlador = leer('js/controllers/campanas.controller.js');
  assert.match(controlador, /\/suscripcion/);
  assert.doesNotMatch(controlador, /writeText\(`\$\{window\.location\.origin\}\/informes`\)/);
});

test('el service worker precarga los recursos del estudio', () => {
  const sw = leer('sw.js');
  for (const recurso of [
    '/css/publicidad-estudio.css',
    '/js/data/plantillas-publicidad.js',
    '/js/views/diseno-publicidad.js',
    '/js/controllers/publicidad.controller.js',
    '/js/views/campanas.view.js'
  ]) {
    assert.match(sw, new RegExp(recurso.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(fs.existsSync(`${FRONTEND}${recurso}`), `No existe ${recurso}`);
  }
});
