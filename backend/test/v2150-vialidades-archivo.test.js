/**
 * V2.15.0 — Fase 3/4: condición de vialidades y archivo general.
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

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

const haceDias = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

async function archivarEnRepositorio(id, { municipioId = MUNICIPIO_MARAVATIO, dias = 3 } = {}) {
  const repositorio = await obtenerRepositorio();
  const incidencia = await repositorio.incidenciaPorId(id);
  assert.ok(incidencia, `No se encontró la incidencia ${id}`);
  const fecha = haceDias(dias);
  return repositorio.actualizarIncidencia(id, {
    ...incidencia,
    municipioId,
    estado: 'resuelta',
    fechaResolucion: fecha,
    actualizado: fecha,
    solucion: 'Trabajo concluido y verificado en campo.'
  });
}

describe('V2.15.0 Fase 3: condición de vialidades', () => {
  test('agrupa tramos por vía, calcula el índice y devuelve la escala', async () => {
    const admin = await Api.admin(app);
    const creadaA = await admin.post('/api/incidencias').send(
      incidenciaValida({
        titulo: 'Bache repetido en Avenida Juárez',
        viaNombre: 'Avenida Juárez',
        viaClave: 'AV-JUAREZ'
      })
    );
    const creadaB = await admin.post('/api/incidencias').send(
      incidenciaValida({
        titulo: 'Otro bache en Avenida Juárez',
        viaNombre: 'Avenida Juárez',
        viaClave: 'AV-JUAREZ',
        lat: PUNTO_MARAVATIO.lat + 0.0004,
        lng: PUNTO_MARAVATIO.lng + 0.0004
      })
    );
    assert.equal(creadaA.status, 201, JSON.stringify(creadaA.body));
    assert.equal(creadaB.status, 201, JSON.stringify(creadaB.body));

    const peligrosa = await admin
      .patch(`/api/incidencias/${creadaB.body.incidencia.id}/peligro`)
      .send({ peligrosa: true, motivo: 'Riesgo para motociclistas' });
    assert.equal(peligrosa.status, 200, JSON.stringify(peligrosa.body));

    const mapa = await admin.get(
      `/api/incidencias/mapa?municipio=${MUNICIPIO_MARAVATIO}&limite=100`
    );
    assert.equal(mapa.status, 200, JSON.stringify(mapa.body));
    const punto = mapa.body.puntos.find((p) => p.id === creadaA.body.incidencia.id);
    assert.equal(punto.viaClave, 'AV-JUAREZ');
    assert.ok(punto.zonaId, 'El punto debe conservar la zona de la incidencia');

    const respuesta = await admin.get(
      `/api/incidencias/vialidades?municipio=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
    assert.equal(respuesta.body.escala.length, 5);
    assert.equal(respuesta.body.vias.length, 0, 'Sin red real no se inventan líneas');
    assert.equal(respuesta.body.sinRedReal, true);
    assert.ok(respuesta.body.aviso);

    const repositorio = await obtenerRepositorio();
    await repositorio.reemplazarVialidades(MUNICIPIO_MARAVATIO, [
      {
        id: 'via-av-juarez',
        nombre: 'Avenida Juárez',
        clave: 'AV-JUAREZ',
        tipo: 'calle',
        anchoM: 10,
        geometria: {
          type: 'LineString',
          coordinates: [
            [PUNTO_MARAVATIO.lng - 0.0002, PUNTO_MARAVATIO.lat],
            [PUNTO_MARAVATIO.lng + 0.0005, PUNTO_MARAVATIO.lat + 0.0004]
          ]
        },
        fuente: 'prueba',
        activo: true
      }
    ]);

    const conRed = await admin.get(
      `/api/incidencias/vialidades?municipio=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(conRed.status, 200, JSON.stringify(conRed.body));
    assert.equal(conRed.body.sinRedReal, false);
    assert.ok(conRed.body.vias.length >= 1);
    const via = conRed.body.vias.find((v) => v.clave === 'AV-JUAREZ');
    assert.ok(via, 'Debe existir el polígono de Avenida Juárez');
    assert.equal(via.geometria.type, 'Polygon');
    assert.ok(Array.isArray(via.segmentos) && via.segmentos.length >= 1);
    assert.ok(via.segmentos.every((segmento) => segmento.geometria.type === 'Polygon'));
    assert.ok(via.indice > 0 && via.indice <= 100);
    assert.ok(via.camino.length >= 2, 'El eje conserva los puntos importados');
    assert.ok(via.peligrosas >= 1);
    assert.ok(conRed.body.zonas.length >= 1);
    assert.equal(conRed.body.resumen.totalIncidencias >= 2, true);
    await repositorio.reemplazarVialidades(MUNICIPIO_MARAVATIO, []);

    const anonimo = new Api(app);
    const sinSesion = await anonimo.get(`/api/incidencias/vialidades?municipio=${MUNICIPIO_MARAVATIO}`);
    assert.equal(sinSesion.status, 401, JSON.stringify(sinSesion.body));
  });

  test('usa los trazos importados de la tabla vialidades cuando existen', async () => {
    const admin = await Api.admin(app);
    const repositorio = await obtenerRepositorio();
    const geometria = {
      type: 'LineString',
      coordinates: [
        [-100.4418, 19.8915],
        [-100.4415, 19.8917],
        [-100.4411, 19.8919]
      ]
    };
    try {
      const guardadas = await repositorio.reemplazarVialidades(MUNICIPIO_MARAVATIO, [
        {
          id: 'via-prueba-importada',
          nombre: 'Avenida Juárez',
          clave: 'AV-JUAREZ',
          tipo: 'calle',
          geometria,
          fuente: 'prueba'
        }
      ]);
      assert.equal(guardadas, 1);
      const listado = await repositorio.listarVialidades({
        municipioId: MUNICIPIO_MARAVATIO
      });
      assert.equal(listado.length, 1);
      assert.equal(listado[0].clave, 'AV-JUAREZ');

      const respuesta = await admin.get(
        `/api/incidencias/vialidades?municipio=${MUNICIPIO_MARAVATIO}`
      );
      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
      const importada = respuesta.body.vias.find(
        (via) => via.clave === 'AV-JUAREZ' && via.medicion === 'importada'
      );
      assert.ok(importada, 'La capa debe usar el trazo real importado');
      assert.equal(importada.geometria.type, 'Polygon');
      assert.ok(importada.segmentos.length >= 1);
      assert.equal(importada.camino.length, 3);
      assert.ok(importada.incidenciaIds.length >= 1);
    } finally {
      await repositorio.reemplazarVialidades(MUNICIPIO_MARAVATIO, []);
    }
  });
});

describe('V2.15.0 Fase 4: archivo general y expediente', () => {
  test('agrupa por fecha, respeta el alcance municipal y protege el expediente', async () => {
    const admin = await Api.admin(app);
    const funcionario = await Api.funcionario(app);
    const ciudadano = await Api.ciudadano(app);

    const propia = await admin.post('/api/incidencias').send(
      incidenciaValida({
        titulo: 'Archivo municipal Maravatío',
        lat: PUNTO_MARAVATIO.lat + 0.01,
        lng: PUNTO_MARAVATIO.lng + 0.01
      })
    );
    const ajena = await admin.post('/api/incidencias').send(
      incidenciaValida({
        titulo: 'Archivo de otro municipio',
        lat: PUNTO_MARAVATIO.lat - 0.01,
        lng: PUNTO_MARAVATIO.lng - 0.01
      })
    );
    assert.equal(propia.status, 201, JSON.stringify(propia.body));
    assert.equal(ajena.status, 201, JSON.stringify(ajena.body));

    await archivarEnRepositorio(propia.body.incidencia.id);
    await archivarEnRepositorio(ajena.body.incidencia.id, { municipioId: '01001' });

    const archivoAdmin = await admin.get('/api/incidencias/archivo');
    assert.equal(archivoAdmin.status, 200, JSON.stringify(archivoAdmin.body));
    assert.equal(archivoAdmin.body.resumen.total, 2);
    const foliosAdmin = archivoAdmin.body.carpetas.flatMap((mes) =>
      mes.dias.flatMap((dia) => dia.incidencias.map((incidencia) => incidencia.id))
    );
    assert.ok(foliosAdmin.includes(propia.body.incidencia.id));
    assert.ok(foliosAdmin.includes(ajena.body.incidencia.id));

    const archivoFuncionario = await funcionario.get(
      `/api/incidencias/archivo?desde=${haceDias(7).slice(0, 10)}`
    );
    assert.equal(archivoFuncionario.status, 200, JSON.stringify(archivoFuncionario.body));
    assert.equal(archivoFuncionario.body.resumen.total, 1);
    const carpeta = archivoFuncionario.body.carpetas[0];
    assert.ok(carpeta.dias[0].etiqueta.length > 0);
    assert.equal(carpeta.dias[0].incidencias[0].id, propia.body.incidencia.id);

    const archivoCiudadano = await ciudadano.get('/api/incidencias/archivo');
    assert.equal(archivoCiudadano.status, 403, JSON.stringify(archivoCiudadano.body));

    const expediente = await funcionario.get(
      `/api/incidencias/${propia.body.incidencia.id}/expediente`
    );
    assert.equal(expediente.status, 200, JSON.stringify(expediente.body));
    assert.equal(expediente.body.incidencia.id, propia.body.incidencia.id);
    assert.ok(expediente.body.resumen.folio);
    assert.ok(Array.isArray(expediente.body.historial));
    assert.ok(expediente.body.resumen.diasResolucion >= 0);

    const expedienteAjeno = await funcionario.get(
      `/api/incidencias/${ajena.body.incidencia.id}/expediente`
    );
    assert.equal(expedienteAjeno.status, 403, JSON.stringify(expedienteAjeno.body));

    const pdf = await funcionario.get(
      `/api/incidencias/${propia.body.incidencia.id}/expediente/pdf`
    );
    assert.equal(pdf.status, 200, JSON.stringify(pdf.body));
    assert.match(pdf.headers['content-type'], /application\/pdf/);

    const archivoDirecto = await ciudadano.get('/api/incidencias?archivo=1');
    assert.equal(archivoDirecto.status, 403, JSON.stringify(archivoDirecto.body));
  });
});
