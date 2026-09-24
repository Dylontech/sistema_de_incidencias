/** Pruebas unitarias de las reglas de negocio puras. */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  puntoEnPoligono,
  zonaDePunto,
  dentroDelMunicipio,
  parsearCoordenadas
} from '../src/services/geocerca.service.js';
import { bboxDePoligono, anillosDe, centroDePoligono, areaDeAnillo, simplificarAnillo } from '../src/utils/geometria.js';
import { municipiosSemilla, zonasSemilla } from '../src/config/semilla.js';
import { MUNICIPIO_MARAVATIO, PUNTO_FUERA, PUNTO_MARAVATIO } from './helpers/api.js';
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

const ZONA = { id: 'z1', municipioId: MUNICIPIO_MARAVATIO, nombre: 'Centro', poligono: CUADRADO };

/** Segundo anillo lejano, para probar los multipolígonos del INEGI. */
const ANILLO_LEJANO = [
  [20.0, -101.0],
  [20.0, -100.95],
  [20.05, -100.95],
  [20.05, -101.0]
];

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
    const municipio = municipiosSemilla.find((m) => m.id === MUNICIPIO_MARAVATIO);
    assert.ok(municipio, 'Maravatío debe estar en el catálogo del INEGI');

    assert.equal(dentroDelMunicipio(PUNTO_MARAVATIO.lat, PUNTO_MARAVATIO.lng, municipio), true);
    assert.equal(dentroDelMunicipio(PUNTO_FUERA.lat, PUNTO_FUERA.lng, municipio), false);
    assert.equal(dentroDelMunicipio(19.92, -100.42, null), false);

    // La envolvente sirve de filtro rápido y encuadra el municipio completo.
    const [[latMin, lngMin], [latMax, lngMax]] = bboxDePoligono(municipio.poligono);
    assert.ok(latMax - latMin > 0.1, 'el municipio abarca una extensión real');
    assert.ok(lngMax - lngMin > 0.1);
    assert.ok(dentroDelMunicipio((latMin + latMax) / 2, (lngMin + lngMax) / 2, municipio) !== null);

    // El modelo ya no usa el rectángulo `bbox`.
    assert.equal(municipio.bbox, undefined);
    assert.ok(municipio.poligono.length >= 3);
  });

  test('los multipolígonos del INEGI se leen con todos sus anillos', () => {
    const multipoligono = [CUADRADO, ANILLO_LEJANO];

    // anillosDe distingue un anillo suelto de una lista de anillos.
    assert.equal(anillosDe(CUADRADO).length, 1);
    assert.equal(anillosDe(multipoligono).length, 2);
    assert.deepEqual(anillosDe([]), []);

    assert.equal(poligonoValido(multipoligono), true);
    // Un anillo roto invalida el conjunto.
    assert.equal(poligonoValido([CUADRADO, [[19.9, -100.4], [19.95, -100.3]]]), false);

    // El punto vale si cae en cualquiera de los anillos.
    assert.equal(puntoEnPoligono(19.92, -100.41, multipoligono), true);
    assert.equal(puntoEnPoligono(20.02, -100.97, multipoligono), true);
    assert.equal(puntoEnPoligono(19.99, -100.5, multipoligono), false);

    // El centro es el del anillo más extenso, no el promedio de todos.
    const centro = centroDePoligono(multipoligono);
    assert.ok(Math.abs(centro[0] - 19.92) < 0.02 && Math.abs(centro[1] - (-100.41)) < 0.02);

    // La envolvente cubre los dos anillos.
    const [[latMin, lngMin], [latMax, lngMax]] = bboxDePoligono(multipoligono);
    assert.ok(latMin === 19.89 && latMax === 20.05 && lngMin === -101 && lngMax === -100.38);

    // El municipio puede tener varios anillos (islas y exclaves).
    assert.equal(dentroDelMunicipio(20.02, -100.97, { poligono: multipoligono }), true);
  });

  test('simplificarAnillo conserva la forma y nunca deja menos de un triángulo', () => {
    const circulo = [];
    for (let i = 0; i < 720; i++) {
      const angulo = (i / 720) * Math.PI * 2;
      circulo.push([19 + 0.01 * Math.sin(angulo), -100 + 0.01 * Math.cos(angulo)]);
    }

    const simplificado = simplificarAnillo(circulo, 0.0002);
    assert.ok(simplificado.length < circulo.length / 10, 'reduce mucho el número de vértices');
    assert.ok(simplificado.length >= 3);
    // El área no se desvía más de un 10 %.
    const desvio = Math.abs(areaDeAnillo(simplificado) - areaDeAnillo(circulo)) / areaDeAnillo(circulo);
    assert.ok(desvio < 0.1, `desvío de área ${(desvio * 100).toFixed(1)}%`);

    // Un anillo ya mínimo se devuelve tal cual.
    assert.equal(simplificarAnillo(CUADRADO, 0.0002).length, 4);
    // Un triángulo nunca se reduce a una recta.
    const triangulo = [[19.89, -100.44], [19.89, -100.38], [19.95, -100.41]];
    assert.ok(simplificarAnillo(triangulo, 1).length >= 3);
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
    assert.equal(poligonoValido([]), false);
  });

  test('el catálogo del INEGI cubre los tres estados y sus comunidades', () => {
    // Michoacán (113), Guanajuato (46) y Ciudad de México (16 demarcaciones).
    assert.equal(municipiosSemilla.length, 175);
    assert.ok(municipiosSemilla.every((m) => poligonoValido(m.poligono)));
    assert.ok(municipiosSemilla.every((m) => m.clave && m.nombre && m.estado));
    assert.deepEqual(
      [...new Set(municipiosSemilla.map((m) => m.estado))].sort((a, b) => a.localeCompare(b, 'es')),
      ['Ciudad de México', 'Guanajuato', 'Michoacán']
    );

    const porMunicipio = new Map();
    for (const zona of zonasSemilla) {
      porMunicipio.set(zona.municipioId, (porMunicipio.get(zona.municipioId) || 0) + 1);
    }
    assert.equal(porMunicipio.size, municipiosSemilla.length);
    assert.ok([...porMunicipio.values()].every((n) => n > 0));

    // En la Ciudad de México la alcaldía entera es la comunidad.
    const cuauhtemoc = zonasSemilla.filter((z) => z.municipioId === '09015');
    assert.ok(cuauhtemoc.length >= 1);
    assert.ok(cuauhtemoc.every((z) => z.tipo === 'localidad'));

    // Las comunidades son las localidades del INEGI y traen su clave.
    const maravatio = zonasSemilla.filter((z) => z.municipioId === MUNICIPIO_MARAVATIO);
    assert.equal(maravatio.length, 62);
    assert.ok(maravatio.every((z) => z.tipo === 'localidad'));
    assert.ok(maravatio.every((z) => String(z.clave).startsWith(MUNICIPIO_MARAVATIO)));
    assert.equal(maravatio[0].nombre, 'Maravatío de Ocampo'); // la cabecera, primero

    // Ningún identificador de zona se repite.
    const ids = new Set(zonasSemilla.map((z) => z.id));
    assert.equal(ids.size, zonasSemilla.length);
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
    const municipio = { id: MUNICIPIO_MARAVATIO, clave: 'MICH-16050' };
    assert.equal(coincideClave(municipio, 'mich-16050'), true);
    assert.equal(coincideClave(municipio, ' otra '), false);
  });

  test('la vista pública del municipio oculta la clave salvo para admin', () => {
    const municipio = {
      id: MUNICIPIO_MARAVATIO,
      nombre: 'Maravatío',
      clave: '16050',
      poblacion: 89311,
      poligono: CUADRADO
    };
    assert.equal(municipioPublico(municipio).clave, undefined);
    assert.equal(municipioPublico(municipio, { incluirClave: true }).clave, '16050');
    assert.equal(municipioPublico(municipio).poblacion, 89311);
    // El listado ligero omite el polígono; el detalle lo incluye.
    assert.ok(Array.isArray(municipioPublico(municipio).poligono));
    assert.equal(municipioPublico(municipio, { incluirPoligono: false }).poligono, undefined);
  });

  test('solo los tipos personalizados se pueden eliminar', () => {
    assert.equal(esPersonalizado({ custom: true }), true);
    assert.equal(esPersonalizado({ id: 'bache' }), false);
  });
});
