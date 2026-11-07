/**
 * V2.15.0 — Fase 2: cuadrillas, reparaciones y desglose de costos.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

async function crearCuadrilla(admin, sufijo) {
  const username = `cuadrilla-${sufijo}`;
  const alta = await admin.post('/api/usuarios').send({
    username,
    nombre: `Cuadrilla ${sufijo}`,
    correo: `${username}@ejemplo.mx`,
    rol: 'cuadrilla',
    municipios: [MUNICIPIO_MARAVATIO],
    password: 'segura1234',
    generarClave: true,
    claveExpiraEn: '2030-12-31'
  });
  assert.equal(alta.status, 201, JSON.stringify(alta.body));
  const entrada = await Api.entrarFuncionario(app, {
    username,
    password: 'segura1234',
    claveAcceso: alta.body.clave.codigo
  });
  assert.equal(entrada.status, 200, JSON.stringify(entrada.body));
  return {
    api: new Api(app, entrada.body.token),
    usuario: entrada.body.usuario,
    username
  };
}

describe('V2.15.0 Fase 2: reparaciones de campo', () => {
  test('la cuadrilla solo ve lo asignado y el coordinador valida el costo', async () => {
    const admin = await Api.admin(app);
    const coordinador = await Api.funcionario(app);
    const cuadrilla = await crearCuadrilla(admin, Date.now().toString(36));

    const creada = await admin.post('/api/incidencias').send(
      incidenciaValida({ titulo: 'Bache para reparación de cuadrilla' })
    );
    assert.equal(creada.status, 201, JSON.stringify(creada.body));
    const id = creada.body.incidencia.id;

    const disponibles = await coordinador.get('/api/incidencias/reparaciones/cuadrillas');
    assert.equal(disponibles.status, 200, JSON.stringify(disponibles.body));
    assert.ok(
      disponibles.body.cuadrillas.some((c) => c.username === cuadrilla.username),
      'El coordinador debe ver la cuadrilla de su municipio'
    );

    const antes = await cuadrilla.api.get('/api/incidencias/reparaciones');
    assert.equal(antes.status, 200, JSON.stringify(antes.body));
    assert.ok(
      !antes.body.reparaciones.some((incidencia) => incidencia.id === id),
      'La cuadrilla no debe ver una incidencia sin asignar'
    );

    const asignada = await coordinador.post(`/api/incidencias/${id}/asignar`).send({
      cuadrillaId: cuadrilla.usuario.id,
      notas: 'Revisar el carril derecho'
    });
    assert.equal(asignada.status, 200, JSON.stringify(asignada.body));
    assert.equal(asignada.body.incidencia.reparacionEstado, 'asignada');

    const asignadas = await cuadrilla.api.get('/api/incidencias/reparaciones');
    assert.equal(asignadas.status, 200, JSON.stringify(asignadas.body));
    assert.ok(asignadas.body.reparaciones.some((incidencia) => incidencia.id === id));

    const iniciada = await cuadrilla.api
      .patch(`/api/incidencias/${id}/reparacion`)
      .send({ estado: 'en_reparacion', notas: 'Cuadrilla en sitio' });
    assert.equal(iniciada.status, 200, JSON.stringify(iniciada.body));
    assert.equal(iniciada.body.incidencia.reparacionEstado, 'en_reparacion');

    const avisosInicio = await coordinador.get('/api/notificaciones');
    assert.equal(avisosInicio.status, 200, JSON.stringify(avisosInicio.body));
    assert.ok(
      avisosInicio.body.notificaciones.some(
        (aviso) => aviso.evento === 'reparacion_iniciada' && aviso.incidenciaId === id
      ),
      'El coordinador debe recibir el aviso de inicio de la reparación'
    );

    const terminada = await cuadrilla.api
      .patch(`/api/incidencias/${id}/reparacion`)
      .send({ estado: 'terminada', notas: 'Trabajo concluido' });
    assert.equal(terminada.status, 200, JSON.stringify(terminada.body));

    const validacionCuadrilla = await cuadrilla.api
      .patch(`/api/incidencias/${id}/reparacion`)
      .send({ estado: 'validada' });
    assert.equal(validacionCuadrilla.status, 403, JSON.stringify(validacionCuadrilla.body));

    const documentos = await cuadrilla.api
      .post(`/api/incidencias/${id}/reparacion/documentos`)
      .send({
        documentos: [
          {
            id: 'doc-factura-1',
            nombre: 'factura-materiales.pdf',
            tipo: 'application/pdf',
            tamano: 1024,
            url: '/uploads/factura-materiales.pdf'
          }
        ]
      });
    assert.equal(documentos.status, 200, JSON.stringify(documentos.body));
    assert.equal(documentos.body.incidencia.documentosReparacion.length, 1);

    const validada = await coordinador
      .patch(`/api/incidencias/${id}/reparacion`)
      .send({ estado: 'validada', notas: 'Revisado por coordinación' });
    assert.equal(validada.status, 200, JSON.stringify(validada.body));
    assert.equal(validada.body.incidencia.reparacionEstado, 'validada');

    const desgloseMalo = await coordinador.post(`/api/incidencias/${id}/resolucion`).send({
      solucion: 'Bache reparado con concreto y señalización.',
      costoReparacion: 1000,
      desgloseCostos: [
        { concepto: 'Materiales', monto: 700 },
        { concepto: 'Mano de obra', monto: 200 }
      ]
    });
    assert.equal(desgloseMalo.status, 400, JSON.stringify(desgloseMalo.body));

    const resuelta = await coordinador.post(`/api/incidencias/${id}/resolucion`).send({
      solucion: 'Bache reparado con concreto y señalización.',
      costoReparacion: 1000,
      desgloseCostos: [
        { concepto: 'Materiales', monto: 700 },
        { concepto: 'Mano de obra', monto: 300, nota: 'Incluye señalización' }
      ]
    });
    assert.equal(resuelta.status, 200, JSON.stringify(resuelta.body));
    assert.equal(resuelta.body.incidencia.costoReparacion, 1000);
    assert.equal(resuelta.body.incidencia.desgloseCostos.length, 2);
  });
});
