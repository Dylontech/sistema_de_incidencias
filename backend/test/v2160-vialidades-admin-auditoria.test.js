/**
 * V2.16.0 — Administración de vialidades, simulación porcentual y auditoría
 * con filtros e informe.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO, PUNTO_MARAVATIO } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

const geometriaPrueba = [
  [PUNTO_MARAVATIO.lng - 0.0004, PUNTO_MARAVATIO.lat - 0.0002],
  [PUNTO_MARAVATIO.lng + 0.0004, PUNTO_MARAVATIO.lat + 0.0002]
];

describe('V2.16.0: catálogo administrativo de vialidades', () => {
  test('crea, consulta, edita, verifica, importa y archiva respetando permisos', async () => {
    const admin = await Api.admin(app);
    const funcionario = await Api.funcionario(app);
    const ciudadano = await Api.ciudadano(app);

    const creada = await admin.post('/api/admin/vialidades').send({
      municipioId: MUNICIPIO_MARAVATIO,
      nombre: 'Calle de prueba administrativa',
      clave: 'CALLE-PRUEBA-ADMIN',
      tipo: 'calle',
      fuente: 'local',
      googleMapsUrl: 'https://maps.google.com/?q=19.8916,-100.4416',
      notas: 'Tramo capturado para validar el catálogo.',
      geometria: geometriaPrueba
    });
    assert.equal(creada.status, 201, JSON.stringify(creada.body));
    assert.equal(creada.body.vialidad.clave, 'CALLE-PRUEBA-ADMIN');
    assert.equal(creada.body.vialidad.verificadaPor, 'admin');

    const listado = await admin.get(
      `/api/admin/vialidades?municipio=${MUNICIPIO_MARAVATIO}&texto=PRUEBA`
    );
    assert.equal(listado.status, 200, JSON.stringify(listado.body));
    assert.equal(listado.body.vialidades.length, 1);
    assert.ok(listado.body.tipos.length >= 5);
    assert.ok(listado.body.fuentes.length >= 4);

    const actualizada = await admin
      .patch(`/api/admin/vialidades/${creada.body.vialidad.id}`)
      .send({ nombre: 'Calle de prueba actualizada', tipo: 'avenida' });
    assert.equal(actualizada.status, 200, JSON.stringify(actualizada.body));
    assert.equal(actualizada.body.vialidad.nombre, 'Calle de prueba actualizada');
    assert.equal(actualizada.body.vialidad.tipo, 'avenida');

    const verificada = await admin.post(
      `/api/admin/vialidades/${creada.body.vialidad.id}/verificar`,
      {}
    );
    assert.equal(verificada.status, 200, JSON.stringify(verificada.body));
    assert.ok(verificada.body.vialidad.verificadaEn);

    const importada = await admin.post('/api/admin/vialidades/importar').send({
      municipioId: MUNICIPIO_MARAVATIO,
      fuente: 'google_maps',
      reemplazar: true,
      contenido: JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Avenida importada', highway: 'primary' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.442, 19.891],
                [-100.441, 19.892]
              ]
            }
          }
        ]
      })
    });
    assert.equal(importada.status, 201, JSON.stringify(importada.body));
    assert.equal(importada.body.total, 1);

    const trasImportar = await admin.get(
      `/api/admin/vialidades?municipio=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(trasImportar.status, 200, JSON.stringify(trasImportar.body));
    assert.equal(trasImportar.body.vialidades.length, 1);
    assert.equal(trasImportar.body.vialidades[0].fuente, 'google_maps');

    const sinPermiso = await funcionario.post('/api/admin/vialidades').send({
      municipioId: MUNICIPIO_MARAVATIO,
      nombre: 'No permitida',
      geometria: geometriaPrueba
    });
    assert.equal(sinPermiso.status, 403, JSON.stringify(sinPermiso.body));

    const ciudadanoLista = await ciudadano.get(
      `/api/admin/vialidades?municipio=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(ciudadanoLista.status, 403, JSON.stringify(ciudadanoLista.body));

    const archivada = await admin.delete(
      `/api/admin/vialidades/${trasImportar.body.vialidades[0].id}`
    );
    assert.equal(archivada.status, 200, JSON.stringify(archivada.body));
    const vacia = await admin.get(`/api/admin/vialidades?municipio=${MUNICIPIO_MARAVATIO}`);
    assert.equal(vacia.status, 200, JSON.stringify(vacia.body));
    assert.equal(vacia.body.vialidades.length, 0);
  });

  test('simula porcentajes de vialidades sin modificar la condición real', async () => {
    const admin = await Api.admin(app);
    await admin.post('/api/admin/vialidades/importar').send({
      municipioId: MUNICIPIO_MARAVATIO,
      fuente: 'local',
      contenido: JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Calle simulable', highway: 'residential' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.442, 19.891],
                [-100.4415, 19.8915],
                [-100.441, 19.892]
              ]
            }
          }
        ]
      })
    });
    const simulada = await admin.post('/api/admin/simulador/vialidades').send({
      municipioId: MUNICIPIO_MARAVATIO,
      porcentajes: { bueno: 20, leve: 20, regular: 20, malo: 20, critico: 20 }
    });
    assert.equal(simulada.status, 200, JSON.stringify(simulada.body));
    assert.equal(simulada.body.simulado, true);
    assert.equal(simulada.body.total, 1);
    assert.equal(simulada.body.vias[0].simulado, true);
    assert.equal(simulada.body.distribucion.reduce((suma, nivel) => suma + nivel.total, 0), 1);

    const invalida = await admin.post('/api/admin/simulador/vialidades').send({
      municipioId: MUNICIPIO_MARAVATIO,
      porcentajes: { bueno: 80, leve: 80, regular: 0, malo: 0, critico: 0 }
    });
    assert.equal(invalida.status, 400, JSON.stringify(invalida.body));
  });
});

describe('V2.16.0: filtros e informes de auditoría', () => {
  test('filtra por método y autor y genera CSV/PDF con esos filtros', async () => {
    const admin = await Api.admin(app);
    await admin.post('/api/admin/vialidades').send({
      municipioId: MUNICIPIO_MARAVATIO,
      nombre: 'Vialidad para auditoría',
      tipo: 'calle',
      fuente: 'manual',
      geometria: geometriaPrueba
    });
    await new Promise((resolver) => setTimeout(resolver, 250));

    const filtrada = await admin.get(
      `/api/admin/auditoria?metodo=POST&username=admin&limite=100`
    );
    assert.equal(filtrada.status, 200, JSON.stringify(filtrada.body));
    assert.ok(filtrada.body.registros.length >= 1);
    assert.ok(filtrada.body.registros.every((registro) => registro.metodo === 'POST'));
    assert.ok(
      filtrada.body.registros.every((registro) =>
        String(registro.username || '').toLowerCase().includes('admin')
      )
    );

    const fechaInvalida = await admin.get('/api/admin/auditoria?desde=no-es-fecha');
    assert.equal(fechaInvalida.status, 400, JSON.stringify(fechaInvalida.body));

    const rangoInvertido = await admin.get(
      '/api/admin/auditoria?desde=2026-12-31&hasta=2026-01-01'
    );
    assert.equal(rangoInvertido.status, 400, JSON.stringify(rangoInvertido.body));

    const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const porFecha = await admin.get(
      `/api/admin/auditoria?desde=${ayer}&hasta=${manana}&limite=100`
    );
    assert.equal(porFecha.status, 200, JSON.stringify(porFecha.body));
    assert.ok(porFecha.body.registros.length >= 1);

    const sinCoincidencias = await admin.get('/api/admin/auditoria?hasta=2020-01-01');
    assert.equal(sinCoincidencias.status, 200, JSON.stringify(sinCoincidencias.body));
    assert.equal(sinCoincidencias.body.registros.length, 0);

    const csv = await admin.get(`/api/admin/auditoria/informe?metodo=POST&formato=csv`);
    assert.equal(csv.status, 200, JSON.stringify(csv.body));
    assert.match(csv.headers['content-type'], /text\/csv/);
    assert.match(csv.text, /Informe de auditoría/);
    assert.match(csv.text, /Vialidad para auditoría|Auditoría|POST/);

    const pdf = await admin.get(`/api/admin/auditoria/informe?metodo=POST&formato=pdf`);
    assert.equal(pdf.status, 200, JSON.stringify(pdf.body));
    assert.match(pdf.headers['content-type'], /application\/pdf/);
    assert.ok(pdf.body.length > 200);
  });
});
