/**
 * Informe imprimible: el documento que se escribe en la ventana nueva.
 *
 * Se comprueba sin navegador interceptando `window.open`, porque lo importante
 * aquí es el HTML que se genera: que la hoja de estilos sea un archivo externo
 * (la CSP no admite bloques de estilo) y que el único script sea el externo que
 * dispara la impresión (tampoco admite código incrustado).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const escritos = [];
const ventanaFalsa = {
  document: {
    write: (html) => escritos.push(html),
    close: () => {}
  },
  print: () => {},
  focus: () => {}
};

// La vista solo usa `window.open`; el resto de sus dependencias son funciones
// puras de formato.
globalThis.window = { open: () => ventanaFalsa };

const { abrirInformeImprimible } = await import(
  new URL('../../frontend/js/views/reportes.view.js', import.meta.url)
);

const INCIDENCIAS = [
  {
    id: 'x1',
    tipoId: 'bache',
    titulo: 'Bache en Av. Juárez',
    estado: 'reportada',
    color: 'amarillo',
    dias: 3,
    lat: 19.9,
    lng: -100.4,
    esAnonimo: true,
    autorNombre: 'Anónimo'
  },
  {
    id: 'x2',
    tipoId: 'bache',
    titulo: 'Bache resuelto',
    estado: 'resuelta',
    color: 'verde',
    dias: 0,
    lat: 19.9,
    lng: -100.4,
    esAnonimo: false,
    autorNombre: 'Juan López',
    peligrosa: true
  }
];

const TIPOS = [{ id: 'bache', nombre: 'Bache', icono: '🕳️' }];
const MUNICIPIO = { nombre: 'Maravatío', estado: 'Michoacán' };

function generar(extra = {}) {
  escritos.length = 0;
  abrirInformeImprimible({ incidencias: INCIDENCIAS, tipos: TIPOS, municipio: MUNICIPIO, ...extra });
  return escritos.at(-1) || '';
}

test('el informe enlaza su hoja de estilos en lugar de incrustarla', () => {
  const html = generar();
  assert.match(html, /<link rel="stylesheet" href="\/css\/impresion-informe\.css">/);
  assert.doesNotMatch(html, /<style[\s>]/i, 'la CSP no admite bloques de estilo');
});

test('el único script del informe es el externo que dispara la impresión', () => {
  const html = generar();
  const etiquetas = html.match(/<script[^>]*>/gi) || [];
  assert.equal(etiquetas.length, 1);
  assert.match(etiquetas[0], /src="\/js\/informe-imprimir\.js"/);
});

test('el informe lleva los datos del municipio y el resumen de estados', () => {
  const html = generar();
  assert.match(html, /Maravatío, Michoacán/);
  assert.match(html, /Bache en Av\. Juárez/);
  assert.match(html, /Juan López/);
  // Una resuelta y una reportada.
  assert.match(html, /<div class="stat-num">2<\/div>/);
  assert.match(html, /badge badge-amarillo/);
  assert.match(html, /badge badge-verde/);
});

test('el texto de los reportes se escapa antes de escribirlo', () => {
  const html = generar({
    incidencias: [
      {
        ...INCIDENCIAS[0],
        titulo: '<img src=x onerror="alert(1)">',
        autorNombre: '"><b>malo</b>'
      }
    ]
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test('sin ventana disponible no se rompe (ventanas emergentes bloqueadas)', () => {
  const original = globalThis.window.open;
  globalThis.window.open = () => null;
  escritos.length = 0;
  assert.doesNotThrow(() => abrirInformeImprimible({ incidencias: INCIDENCIAS, tipos: TIPOS }));
  assert.equal(escritos.length, 0);
  globalThis.window.open = original;
});
