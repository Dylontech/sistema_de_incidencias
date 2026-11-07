/**
 * Informe imprimible: el documento que se escribe en la ventana nueva.
 *
 * Se comprueba sin navegador interceptando `window.open`, porque lo importante
 * aquí es el HTML que se genera: que la hoja de estilos sea un archivo externo
 * (la CSP no admite bloques de estilo), que el único script sea el externo que
 * dispara la impresión y que el informe lleve logo, estadísticas y gráficas.
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

globalThis.window = { open: () => ventanaFalsa };

const { abrirInformeImprimible } = await import(
  new URL('../../frontend/js/views/reportes.view.js', import.meta.url)
);

const DATOS = {
  generadoEn: '2026-10-30T12:00:00.000Z',
  plantilla: {
    logoUrl: '/uploads/logo-institucional.png',
    logoPosicion: 'derecha',
    pieTexto: 'Gobierno Municipal'
  },
  filtros: {
    municipios: ['16050'],
    estados: [],
    tipos: [],
    tiposTodos: true,
    compararPor: 'municipio',
    incluirDetalle: true
  },
  resumen: {
    total: 2,
    reportadas: 1,
    enProceso: 0,
    resueltas: 1,
    criticas: 0,
    tasaResolucion: 50
  },
  porTipo: [
    { tipoId: 'bache', nombre: 'Bache', total: 2, resueltas: 1, pendientes: 1, porcentaje: 100 }
  ],
  porMunicipio: [
    { municipioId: '16050', municipio: 'Maravatío', estado: 'Michoacán', total: 2, resueltas: 1 }
  ],
  comparativa: [
    {
      clave: '16050',
      etiqueta: 'Maravatío',
      total: 2,
      resueltas: 1,
      pendientes: 1,
      criticas: 0,
      tasaResolucion: 50
    }
  ],
  series: [{ periodo: '2026-10', total: 2, resueltas: 1 }],
  detalle: [
    {
      id: 'x1',
      tipo: 'Bache',
      titulo: 'Bache en Av. Juárez',
      municipio: 'Maravatío',
      estado: 'reportada',
      dias: 3
    },
    {
      id: 'x2',
      tipo: 'Bache',
      titulo: 'Bache resuelto',
      municipio: 'Maravatío',
      estado: 'resuelta',
      dias: 0
    }
  ]
};

function generar(datos = {}, opciones = {}) {
  escritos.length = 0;
  abrirInformeImprimible({ datos: { ...DATOS, ...datos }, opciones });
  return escritos.at(-1) || '';
}

test('el informe enlaza su hoja de estilos en lugar de incrustarla', () => {
  const html = generar();
  assert.match(html, /<link rel="stylesheet" href="\/css\/impresion-informe\.css">/);
  assert.doesNotMatch(html, /<style[\s>]/i, 'la CSP no admite bloques de estilo');
});

test('los scripts del informe son externos y compatibles con la CSP', () => {
  const html = generar();
  const etiquetas = html.match(/<script[^>]*>/gi) || [];
  assert.equal(etiquetas.length, 3);
  assert.ok(etiquetas.some((tag) => tag.includes('/js/informe-paged-config.js')));
  assert.ok(etiquetas.some((tag) => tag.includes('/vendor/pagedjs/paged.polyfill.js')));
  assert.ok(etiquetas.some((tag) => tag.includes('/js/informe-imprimir.js')));
  assert.equal((html.match(/<script[^>]+src=/gi) || []).length, 3);
});

test('aplica logo, pie y el CSS dinámico del diseño', () => {
  const html = generar();
  assert.match(html, /href="\/api\/informes\/estilo\.css"/);
  assert.match(html, /class="informe-logo informe-logo-derecha"/);
  assert.match(html, /src="\/uploads\/logo-institucional\.png"/);
  assert.match(html, /Gobierno Municipal/);
  assert.match(html, /informe-paged-config\.js/);
});

test('el informe lleva filtros, resumen, gráficas y detalle', () => {
  const html = generar();
  assert.match(html, /Municipios: 1/);
  assert.match(html, /Todos los tipos/);
  assert.match(html, /<div class="informe-stat"><strong>2<\/strong><span>Total<\/span><\/div>/);
  assert.match(
    html,
    /<div class="informe-stat"><strong>50%<\/strong><span>Resolución<\/span><\/div>/
  );
  assert.match(html, /<svg/);
  assert.match(html, /Comparación por municipio/);
  assert.match(html, /Bache en Av\. Juárez/);
});

test('las gráficas y el detalle se pueden omitir', () => {
  const html = generar({}, { barras: false, pastel: false, serie: false, detalle: false });
  assert.doesNotMatch(html, /<svg/);
  assert.doesNotMatch(html, /Detalle de incidencias/);
  assert.match(html, /Comparación por municipio/);
});

test('el texto de los reportes se escapa antes de escribirlo', () => {
  const html = generar({
    detalle: [
      {
        ...DATOS.detalle[0],
        titulo: '<img src=x onerror="alert(1)">',
        municipio: '"><b>malo</b>'
      }
    ]
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test('sin ventana disponible avisa en lugar de romperse', () => {
  const original = globalThis.window.open;
  globalThis.window.open = () => null;
  escritos.length = 0;
  assert.equal(abrirInformeImprimible({ datos: DATOS }), false);
  assert.equal(escritos.length, 0);
  globalThis.window.open = original;
});
