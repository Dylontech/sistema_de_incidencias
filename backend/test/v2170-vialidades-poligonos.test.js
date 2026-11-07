/**
 * V2.17.0 — Red vial poligonal, importación KML/GeoJSON y degradado.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import {
  Api,
  MUNICIPIO_MARAVATIO,
  PUNTO_MARAVATIO,
  incidenciaValida
} from './helpers/api.js';
import { bufferizarEje, normalizarGeometria } from '../src/services/geometria.service.js';
import { viasDesdeContenido } from '../src/services/vialidades-import.service.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

const linea = {
  type: 'LineString',
  coordinates: [
    [PUNTO_MARAVATIO.lng - 0.0004, PUNTO_MARAVATIO.lat - 0.0002],
    [PUNTO_MARAVATIO.lng + 0.0004, PUNTO_MARAVATIO.lat + 0.0002]
  ]
};

const poligono = {
  type: 'Polygon',
  coordinates: [
    [
      [PUNTO_MARAVATIO.lng - 0.003, PUNTO_MARAVATIO.lat - 0.0002],
      [PUNTO_MARAVATIO.lng + 0.003, PUNTO_MARAVATIO.lat - 0.0002],
      [PUNTO_MARAVATIO.lng + 0.003, PUNTO_MARAVATIO.lat + 0.0002],
      [PUNTO_MARAVATIO.lng - 0.003, PUNTO_MARAVATIO.lat + 0.0002],
      [PUNTO_MARAVATIO.lng - 0.003, PUNTO_MARAVATIO.lat - 0.0002]
    ]
  ]
};

describe('V2.17.0: geometría vial', () => {
  test('convierte un eje en corredor poligonal y conserva polígonos', () => {
    const eje = normalizarGeometria(linea);
    const buffer = bufferizarEje(eje, 10);
    assert.equal(buffer.geometria.type, 'Polygon');
    assert.ok(buffer.segmentos.length >= 1);
    assert.ok(buffer.segmentos.every((segmento) => segmento.geometria.type === 'Polygon'));
    assert.equal(normalizarGeometria(poligono).type, 'Polygon');
    assert.equal(normalizarGeometria({ type: 'MultiPolygon', coordinates: [[poligono.coordinates[0]]] }).type, 'MultiPolygon');
  });

  test('lee KML con línea y polígono sin convertirlos en uniones de incidencias', () => {
    const kml = `<kml><Document>
      <Placemark><name>Calle KML</name><LineString>
        <coordinates>-100.442,19.891,0 -100.441,19.892,0</coordinates>
      </LineString></Placemark>
      <Placemark><name>Plaza KML</name><Polygon><outerBoundaryIs><LinearRing>
        <coordinates>-100.442,19.891,0 -100.441,19.891,0 -100.441,19.892,0 -100.442,19.892,0 -100.442,19.891,0</coordinates>
      </LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Document></kml>`;
    const vias = viasDesdeContenido(kml, { municipioId: MUNICIPIO_MARAVATIO });
    assert.equal(vias.length, 2);
    assert.ok(vias.every((via) => via.geometria.type === 'Polygon'));
    assert.ok(vias.every((via) => via.anchoM > 0));
    assert.ok(vias.some((via) => via.eje?.type === 'LineString'));
  });

  test('importa polígonos GeoJSON y conserva notas/enlaces al fusionar', async () => {
    const admin = await Api.admin(app);
    const repositorio = await obtenerRepositorio();
    try {
      const manual = await admin.post('/api/admin/vialidades').send({
        municipioId: MUNICIPIO_MARAVATIO,
        nombre: 'Avenida Fusión',
        clave: 'AVENIDA-FUSION',
        tipo: 'avenida',
        fuente: 'local',
        googleMapsUrl: 'https://maps.google.com/?q=19.8916,-100.4416',
        notas: 'Nota local que no debe perderse',
        anchoM: 12,
        geometria: linea
      });
      assert.equal(manual.status, 201, JSON.stringify(manual.body));
      assert.equal(manual.body.vialidad.geometria.type, 'Polygon');
      assert.equal(manual.body.vialidad.eje.type, 'LineString');

      const importada = await admin.post('/api/admin/vialidades/importar').send({
        municipioId: MUNICIPIO_MARAVATIO,
        fuente: 'geojson',
        reemplazar: false,
        contenido: JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { name: 'Avenida Fusión', highway: 'primary' },
              geometry: linea
            }
          ]
        })
      });
      assert.equal(importada.status, 201, JSON.stringify(importada.body));
      assert.equal(importada.body.total, 1);
      assert.equal(importada.body.actualizadas, 1);
      assert.equal(importada.body.creadas, 0);

      const listado = await admin.get(
        `/api/admin/vialidades?municipio=${MUNICIPIO_MARAVATIO}`
      );
      assert.equal(listado.status, 200, JSON.stringify(listado.body));
      const via = listado.body.vialidades.find((item) => item.clave === 'AVENIDA-FUSION');
      assert.ok(via);
      assert.equal(via.geometria.type, 'Polygon');
      assert.equal(via.eje.type, 'LineString');
      assert.equal(via.notas, 'Nota local que no debe perderse');
      assert.match(via.googleMapsUrl, /maps\.google\.com/);

      const conPoligono = await admin.post('/api/admin/vialidades/importar').send({
        municipioId: MUNICIPIO_MARAVATIO,
        fuente: 'geojson',
        reemplazar: false,
        contenido: JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { name: 'Avenida Fusión', highway: 'primary' },
              geometry: poligono
            }
          ]
        })
      });
      assert.equal(conPoligono.status, 201, JSON.stringify(conPoligono.body));
      const conPoligonoLista = await admin.get(
        `/api/admin/vialidades?municipio=${MUNICIPIO_MARAVATIO}`
      );
      const viaPoligono = conPoligonoLista.body.vialidades.find(
        (item) => item.clave === 'AVENIDA-FUSION'
      );
      assert.equal(viaPoligono.geometria.type, 'Polygon');
      assert.equal(viaPoligono.geometriaTipo, 'poligono');
    } finally {
      await repositorio.reemplazarVialidades(MUNICIPIO_MARAVATIO, []);
    }
  });

  test('genera subtramos con colores distintos y sin reportes en los extremos', async () => {
    const admin = await Api.admin(app);
    const repositorio = await obtenerRepositorio();
    const larga = {
      type: 'LineString',
      coordinates: [
        [PUNTO_MARAVATIO.lng - 0.006, PUNTO_MARAVATIO.lat],
        [PUNTO_MARAVATIO.lng, PUNTO_MARAVATIO.lat],
        [PUNTO_MARAVATIO.lng + 0.006, PUNTO_MARAVATIO.lat]
      ]
    };
    try {
      const creada = await admin.post('/api/admin/vialidades').send({
        municipioId: MUNICIPIO_MARAVATIO,
        nombre: 'Avenida Degradado',
        clave: 'AVENIDA-DEGRADADO',
        tipo: 'avenida',
        fuente: 'manual',
        anchoM: 14,
        geometria: larga
      });
      assert.equal(creada.status, 201, JSON.stringify(creada.body));

      const reporte = await admin.post('/api/incidencias').send(
        incidenciaValida({
          titulo: 'Bache al inicio de la avenida',
          viaNombre: 'Avenida Degradado',
          viaClave: 'AVENIDA-DEGRADADO',
          lat: PUNTO_MARAVATIO.lat,
          lng: PUNTO_MARAVATIO.lng - 0.0058
        })
      );
      assert.equal(reporte.status, 201, JSON.stringify(reporte.body));

      const respuesta = await admin.get(
        `/api/incidencias/vialidades?municipio=${MUNICIPIO_MARAVATIO}`
      );
      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
      const via = respuesta.body.vias.find((item) => item.clave === 'AVENIDA-DEGRADADO');
      assert.ok(via);
      assert.equal(via.geometria.type, 'Polygon');
      assert.ok(via.segmentos.length >= 5);
      assert.ok(via.segmentos.every((segmento) => segmento.geometria.type === 'Polygon'));
      assert.ok(via.segmentos.some((segmento) => segmento.sinReportes === true));
      assert.ok(via.segmentos.some((segmento) => segmento.sinReportes === false));
      assert.ok(new Set(via.segmentos.map((segmento) => segmento.color)).size >= 2);
      assert.equal(respuesta.body.resumen.sinRedReal, false);
    } finally {
      await repositorio.reemplazarVialidades(MUNICIPIO_MARAVATIO, []);
    }
  });

  test('interpreta Overpass y descarta banquetas y andadores', () => {
    const vias = viasDesdeContenido(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { highway: 'primary', name: 'Carretera' },
            geometry: [
              { lon: -100.442, lat: 19.891 },
              { lon: -100.441, lat: 19.892 }
            ]
          },
          {
            type: 'way',
            id: 2,
            tags: { highway: 'footway' },
            geometry: [
              { lon: -100.442, lat: 19.891 },
              { lon: -100.441, lat: 19.892 }
            ]
          }
        ]
      },
      { municipioId: MUNICIPIO_MARAVATIO }
    );
    assert.equal(vias.length, 1);
    assert.equal(vias[0].tipo, 'carretera_federal');
    assert.equal(vias[0].osmId, 'osm-1');
    assert.equal(vias[0].fuente, 'openstreetmap');
  });
});
