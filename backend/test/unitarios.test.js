/** Pruebas unitarias de las reglas de negocio puras. */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  puntoEnPoligono,
  zonaDePunto,
  dentroDelMunicipio,
  parsearCoordenadas
} from '../src/services/geocerca.service.js';
import { bboxDePoligono } from '../src/utils/geometria.js';
import { municipiosSemilla } from '../src/config/semilla.js';
import { colorPorAntiguedad, contarPorEstado, filtrarPorColor, ordenarPorPrioridad } from '../src/services/estado.service.js';
import { coincideUbicacion, esDuplicado, validarEntrada } from '../src/models/incidencia.model.js';
import { poligonoValido } from '../src/models/zona.model.js';
import { coincideClave, publico as municipioPublico } from '../src/models/municipio.model.js';
import { esPersonalizado } from '../src/models/tipo.model.js';

const CUADRADO = [
  [19.89, -100.44],
  [19.89, -100.38],
  [19.95, -100.38],
  [19.95, -100.44]
];

const ZONA = { id: 'z1', municipioId: 'maravatio', nombre: 'Centro', poligono: CUADRADO };

describe('Geocerca', () => {
  test('puntoEnPoligono distingue dentro, fuera y bordes', () => {
    assert.equal(puntoEnPoligono(19.92, -100.41, CUADRADO), true);
    assert.equal(puntoEnPoligono(19.8, -100.41, CUADRADO), false);
    assert.equal(puntoEnPoligono(19.92, -100.5, CUADRADO), false);
    // Polígono degenerado: nunca contiene puntos.
    assert.equal(puntoEnPoligono(19.92, -100.41, [[19.9, -100.4]]), false);
  });

  test('zonaDePunto devuelve la zona que contiene el punto', () => {
    assert.equal(zonaDePunto(19.92, -100.41, [ZONA]).id, 'z1');
    assert.equal(zonaDePunto(19.7, -100.41, [ZONA]), null);
  });

  test('dentroDelMunicipio usa el polígono real del municipio', () => {
    const municipio = municipiosSemilla[0];

    assert.equal(dentroDelMunicipio(19.92, -100.42, municipio), true);
    assert.equal(dentroDelMunicipio(19.7, -100.44, municipio), false);
    assert.equal(dentroDelMunicipio(19.92, -100.42, null), false);

    // La envolvente sirve de filtro rápido y encuadra el municipio completo.
    const [[latMin, lngMin], [latMax, lngMax]] = bboxDePoligono(municipio.poligono);
    assert.ok(latMin < 19.75 && latMax > 20.0);
    assert.ok(lngMin < -100.6 && lngMax > -100.3);

    // El modelo ya no usa el rectángulo `bbox`.
    assert.equal(municipio.bbox, undefined);
    assert.ok(municipio.poligono.length >= 3);
  });

  test('parsearCoordenadas acepta los formatos que usaba el monolito', () => {
    assert.deepEqual(parsearCoordenadas('19.8933, -100.4431'), { lat: 19.8933, lng: -100.4431 });
    assert.deepEqual(parsearCoordenadas('19.8933 -100.4431'), { lat: 19.8933, lng: -100.4431 });
    assert.equal(parsearCoordenadas('texto'), null);
    assert.equal(parsearCoordenadas('95, 200'), null);
    assert.equal(parsearCoordenadas(''), null);
  });

  test('poligonoValido rechaza polígonos incompletos', () => {
    assert.equal(poligonoValido(CUADRADO), true);
    assert.equal(poligonoValido([[19.9, -100.4], [19.95, -100.3]]), false);
    assert.equal(poligonoValido('nada'), false);
  });
});

describe('Color por antigüedad', () => {
  const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

  test('aplica los límites de 15 y 30 días', () => {
    assert.equal(colorPorAntiguedad({ estado: 'reportada', fecha: hace(0) }), 'amarillo');
    assert.equal(colorPorAntiguedad({ estado: 'reportada', fecha: hace(14) }), 'amarillo');
    assert.equal(colorPorAntiguedad({ estado: 'reportada', fecha: hace(15) }), 'naranja');
    assert.equal(colorPorAntiguedad({ estado: 'reportada', fecha: hace(29) }), 'naranja');
    assert.equal(colorPorAntiguedad({ estado: 'reportada', fecha: hace(30) }), 'rojo');
    assert.equal(colorPorAntiguedad({ estado: 'reportada', fecha: hace(400) }), 'rojo');
  });

  test('una incidencia resuelta siempre es verde', () => {
    assert.equal(colorPorAntiguedad({ estado: 'resuelta', fecha: hace(400) }), 'verde');
  });

  test('filtrarPorColor y ordenarPorPrioridad trabajan sobre el color derivado', () => {
    const lista = [
      { id: 'a', color: 'amarillo' },
      { id: 'b', color: 'rojo' },
      { id: 'c', color: 'verde' },
      { id: 'd', color: 'naranja' }
    ];
    assert.deepEqual(filtrarPorColor(lista, 'rojo').map((i) => i.id), ['b']);
    assert.deepEqual(filtrarPorColor(lista, 'todos').length, 4);
    assert.deepEqual(ordenarPorPrioridad(lista).map((i) => i.id), ['b', 'd', 'a', 'c']);
  });

  test('contarPorEstado resume el conjunto', () => {
    const resumen = contarPorEstado([
      { estado: 'reportada', color: 'rojo' },
      { estado: 'reportada', color: 'amarillo' },
      { estado: 'en_proceso', color: 'naranja' },
      { estado: 'resuelta', color: 'verde' }
    ]);
    assert.deepEqual(resumen, {
      total: 4,
      reportadas: 2,
      enProceso: 1,
      resueltas: 1,
      pendientes: 3,
      criticas: 1,
      naranjas: 1,
      amarillas: 1,
      tasaResolucion: 25
    });
  });
});

describe('Modelo de incidencia', () => {
  test('detecta duplicados solo para el mismo usuario, tipo y ubicación', () => {
    const base = { userKey: 'anon_1', tipoId: 'bache', lat: 19.92, lng: -100.42, estado: 'reportada' };
    assert.equal(coincideUbicacion(base, { lat: 19.9201, lng: -100.4201 }), true);
    assert.equal(coincideUbicacion(base, { lat: 19.93, lng: -100.42 }), false);
    assert.equal(esDuplicado(base, { ...base }), true);
    assert.equal(esDuplicado(base, { ...base, tipoId: 'fuga' }), false);
    assert.equal(esDuplicado(base, { ...base, userKey: 'anon_2' }), false);
    assert.equal(esDuplicado({ ...base, estado: 'resuelta' }, { ...base }), false);
  });

  test('validarEntrada recorta textos y rechaza excesos', () => {
    const entrada = validarEntrada({
      tipoId: 'bache',
      titulo: '  Título con espacios  ',
      descripcion: 'Descripción',
      lat: 19.92,
      lng: -100.42
    });
    assert.equal(entrada.titulo, 'Título con espacios');
    assert.equal(entrada.indicaciones, '');

    assert.throws(
      () => validarEntrada({ tipoId: 'bache', titulo: 'x'.repeat(81), descripcion: 'd', lat: 1, lng: 1 }),
      /Datos inválidos/
    );
  });
});

describe('Otros modelos', () => {
  test('la clave del municipio se compara sin distinguir mayúsculas', () => {
    const municipio = { id: 'maravatio', clave: 'MARAVATIO-2024' };
    assert.equal(coincideClave(municipio, 'maravatio-2024'), true);
    assert.equal(coincideClave(municipio, ' otra '), false);
  });

  test('la vista pública del municipio oculta la clave salvo para admin', () => {
    const municipio = { id: 'maravatio', nombre: 'Maravatío', clave: 'MARAVATIO-2024' };
    assert.equal(municipioPublico(municipio).clave, undefined);
    assert.equal(municipioPublico(municipio, { incluirClave: true }).clave, 'MARAVATIO-2024');
  });

  test('solo los tipos personalizados se pueden eliminar', () => {
    assert.equal(esPersonalizado({ custom: true }), true);
    assert.equal(esPersonalizado({ id: 'bache' }), false);
  });
});
