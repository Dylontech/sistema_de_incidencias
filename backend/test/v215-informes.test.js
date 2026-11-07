/**
 * V2.15: diseño de informes y PDF conmutable (clásico o rediseñado).
 *
 * Cubre las claves nuevas de configuración, los adaptadores que traducen los
 * modelos del sistema al contrato del generador y el despacho v1/v2 en los
 * endpoints de incidencia, informe general y reclamación.
 */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const configuracion = await import('../src/services/configuracion.service.js');
const adaptadores = await import('../src/services/pdf/adaptadores.js');
const { crearPdfInforme, crearPdfIncidencia, crearPdfReclamacion } = await import(
  '../src/services/pdf/pdf-informes.mjs'
);

let app;
before(() => {
  app = crearApp();
});
after(() => entorno.limpiar());

const texto = (buffer) => buffer.toString('latin1');
const esPdf = (buffer) => buffer.subarray(0, 4).toString() === '%PDF';

describe('V2.15: configuración del diseño', () => {
  test('las claves nuevas existen con valores recomendados', () => {
    assert.equal(configuracion.CONFIGURACION_POR_DEFECTO['informes.color_acento'], '#006657');
    assert.equal(configuracion.CONFIGURACION_POR_DEFECTO['informes.evidencia_columnas'], 2);
    assert.equal(configuracion.CONFIGURACION_POR_DEFECTO['informes.evidencia_posicion'], 'final');
    assert.equal(configuracion.CONFIGURACION_POR_DEFECTO['informes.motor_pdf'], 'v2');
  });

  test('el administrador guarda las claves y el servidor valida los valores', async () => {
    const admin = await Api.admin(app);
    const guardado = await admin.put('/api/admin/configuracion').send({
      'informes.color_acento': '#1D4F91',
      'informes.evidencia_columnas': 3,
      'informes.evidencia_posicion': 'despues_descripcion',
      'informes.motor_pdf': 'preguntar'
    });
    assert.equal(guardado.status, 200, JSON.stringify(guardado.body));
    const filas = guardado.body.configuracion;
    const valor = (clave) => filas.find((fila) => fila.clave === clave)?.valor;
    assert.equal(valor('informes.color_acento'), '#1d4f91');
    assert.equal(valor('informes.evidencia_columnas'), 3);
    assert.equal(valor('informes.evidencia_posicion'), 'despues_descripcion');
    assert.equal(valor('informes.motor_pdf'), 'preguntar');

    const colorMalo = await admin
      .put('/api/admin/configuracion')
      .send({ 'informes.color_acento': 'rojo' });
    assert.equal(colorMalo.status, 400, JSON.stringify(colorMalo.body));

    const motorMalo = await admin
      .put('/api/admin/configuracion')
      .send({ 'informes.motor_pdf': 'otro' });
    assert.equal(motorMalo.status, 400, JSON.stringify(motorMalo.body));
  });

  test('motorPdf respeta una versión fija y resuelve preguntar', async () => {
    const preguntar = {
      configuracion: async (clave) =>
        clave === 'informes.motor_pdf' ? { valor: 'preguntar' } : null
    };
    assert.equal(await configuracion.motorPdf(preguntar, 'v1'), 'v1');
    assert.equal(await configuracion.motorPdf(preguntar, 'v2'), 'v2');
    assert.equal(await configuracion.motorPdf(preguntar, 'otro'), 'v2');

    const fijo = {
      configuracion: async (clave) =>
        clave === 'informes.motor_pdf' ? { valor: 'v1' } : null
    };
    assert.equal(await configuracion.motorPdf(fijo, 'v2'), 'v1');
  });
});

describe('V2.15: adaptadores de datos', () => {
  test('la incidencia resuelve nombres, evidencias, peligro y moderación', () => {
    const datos = adaptadores.datosIncidenciaPdf(
      {
        id: 'x1',
        folio: 'INC-20261023-083F36',
        titulo: 'Baches múltiples',
        tipoId: 'bache',
        municipioId: '16050',
        estado: 'resuelta',
        fecha: '2026-10-20T10:00:00.000Z',
        lat: 19.89,
        lng: -100.44,
        esAnonimo: false,
        autorNombre: 'Ana',
        peligrosa: true,
        peligrosaMotivo: 'Riesgo para peatones',
        oculta: true,
        ocultaMotivo: 'Datos personales',
        ocultaFecha: '2026-10-21T10:00:00.000Z',
        viaNombre: 'Carretera 1',
        viaClave: 'MEX-1',
        kilometro: 12,
        sentido: 'Norte',
        tramo: 'Tramo A',
        dependencia: 'SCT',
        evidencia: [
          { nombre: 'foto.png', tipo: 'image/png', tamano: 100, url: '/uploads/foto.png' }
        ],
        fechaResolucion: '2026-10-28T10:00:00.000Z',
        costoReparacion: 1234.5,
        solucion: 'Se reparó el tramo completo.',
        historial: [
          { fecha: '2026-10-20T10:00:00.000Z', estado: 'reportada', accion: 'Reportada', por: 'Ana' },
          {
            fecha: '2026-10-28T10:00:00.000Z',
            estado: 'resuelta',
            accion: 'Resuelta',
            por: 'Cuadrilla'
          }
        ]
      },
      { tipo: { nombre: 'Bache' }, municipio: { id: '16050', nombre: 'Maravatío', estado: 'Michoacán' } }
    );

    assert.equal(datos.tipo, 'Bache');
    assert.equal(datos.municipio.nombre, 'Maravatío');
    assert.equal(datos.municipio.clave, '16050');
    assert.equal(datos.municipio.estado, 'Michoacán');
    assert.equal(datos.evidencias[0].mime, 'image/png');
    assert.match(datos.evidencias[0].ruta, /foto\.png$/);
    assert.equal(datos.peligrosa, true);
    assert.equal(datos.moderacion.oculta, true);
    assert.equal(datos.solucion.responsable, 'Cuadrilla');
    assert.equal(datos.historial[1].actor, 'Cuadrilla');
    assert.equal(datos.via.kilometro, 12);
  });

  test('el informe general usa estados, serie y folio del detalle', () => {
    const datos = adaptadores.datosInformePdf({
      filtros: { municipios: ['16050'], tiposTodos: true, compararPor: 'tipo' },
      resumen: { total: 3, resueltas: 2, enProceso: 1, reportadas: 0, promedioDias: 2.5 },
      porTipo: [{ nombre: 'Bache', total: 3 }],
      series: [{ periodo: '2026-10', total: 3 }],
      comparativa: [
        { etiqueta: 'Bache', total: 3, resueltas: 2, pendientes: 1, promedioDias: 2.5 }
      ],
      detalle: [
        {
          id: 'x1',
          folio: 'INC-1',
          fecha: '2026-10-01',
          tipo: 'Bache',
          municipio: 'Maravatío',
          estado: 'resuelta',
          dias: 2
        }
      ]
    });

    assert.equal(datos.resumen.promedioDias, 2.5);
    assert.deepEqual(datos.porEstado.map((estado) => estado.clave), [
      'resuelta',
      'en_proceso',
      'reportada'
    ]);
    assert.deepEqual(datos.serie, [{ mes: '2026-10', total: 3 }]);
    assert.equal(datos.incidencias[0].folio, 'INC-1');
    assert.equal(datos.filtros.alcance, '1 municipio');
    assert.equal(datos.filtros.tipos, 'Todos los tipos');
  });
});

describe('V2.15: documentos PDF', () => {
  test('los tres generadores producen PDF válidos con datos mínimos', async () => {
    const incidencia = await crearPdfIncidencia({
      folio: 'INC-PRUEBA',
      tipo: 'bache',
      estado: 'reportada',
      fechaReporte: new Date(),
      municipio: { nombre: 'Maravatío', clave: '16050' },
      descripcion: 'Prueba'
    });
    const informe = await crearPdfInforme({
      resumen: { total: 0 },
      porTipo: [],
      porEstado: [],
      serie: [],
      comparativa: [],
      incidencias: []
    });
    const reclamacion = await crearPdfReclamacion({
      folio: 'INC-PRUEBA',
      titulo: 'Incidencia',
      estado: 'resuelta',
      municipio: { nombre: 'Maravatío', clave: '16050' },
      motivo: 'otro',
      fechaReclamacion: new Date()
    });
    for (const buffer of [incidencia, informe, reclamacion]) {
      assert.ok(esPdf(buffer));
      assert.ok(buffer.length > 500);
    }
  });

  test('la descarga de incidencia, informe y reclamación respeta v1 y v2', async () => {
    const admin = await Api.admin(app);
    await admin
      .put('/api/admin/configuracion')
      .send({ 'informes.motor_pdf': 'preguntar' });

    const funcionario = await Api.funcionario(app);
    const motor = await funcionario.get('/api/informes/motor-pdf');
    assert.equal(motor.status, 200);
    assert.equal(motor.body.motor, 'preguntar');

    const ciudadano = await Api.ciudadano(app);
    const creada = await ciudadano.post('/api/incidencias').send(incidenciaValida());
    assert.equal(creada.status, 201, JSON.stringify(creada.body));
    const id = creada.body.incidencia.id;

    const pdfV2 = await funcionario.get(`/api/incidencias/${id}/pdf?pdf=v2`);
    assert.equal(pdfV2.status, 200, JSON.stringify(pdfV2.body));
    assert.match(pdfV2.headers['content-type'], /application\/pdf/);
    assert.ok(texto(pdfV2.body).includes('SourceSans3'));
    assert.equal(texto(pdfV2.body).includes('Helvetica'), false);

    const pdfV1 = await funcionario.get(`/api/incidencias/${id}/pdf?pdf=v1`);
    assert.equal(pdfV1.status, 200, JSON.stringify(pdfV1.body));
    assert.ok(texto(pdfV1.body).includes('Helvetica'));
    assert.equal(texto(pdfV1.body).includes('SourceSans3'), false);

    const informeV2 = await funcionario.get(
      `/api/informes/exportar?formato=pdf&pdf=v2&municipio=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(informeV2.status, 200, JSON.stringify(informeV2.body));
    assert.ok(texto(informeV2.body).includes('SourceSans3'));

    const informeV1 = await funcionario.get(
      `/api/informes/exportar?formato=pdf&pdf=v1&municipio=${MUNICIPIO_MARAVATIO}`
    );
    assert.equal(informeV1.status, 200, JSON.stringify(informeV1.body));
    assert.ok(texto(informeV1.body).includes('Helvetica'));

    const vecina = await Api.ciudadanoConCuenta(app);
    const suya = await vecina.api.post('/api/incidencias').send(incidenciaValida());
    const idSuya = suya.body.incidencia.id;
    const resuelta = await funcionario
      .post(`/api/incidencias/${idSuya}/resolucion`)
      .send({ solucion: 'Se reparó el tramo completo.', costoReparacion: 500 });
    assert.equal(resuelta.status, 200, JSON.stringify(resuelta.body));
    const reclamacion = await vecina.api
      .post(`/api/incidencias/${idSuya}/reclamaciones`)
      .send({ motivo: 'danos_no_reparados', detalle: 'El tramo sigue dañado.' });
    assert.equal(reclamacion.status, 201, JSON.stringify(reclamacion.body));
    const idReclamacion = reclamacion.body.reclamacion.id;

    const reclamoV2 = await vecina.api.get(
      `/api/reclamaciones/${idReclamacion}/informe?pdf=v2`
    );
    assert.equal(reclamoV2.status, 200, JSON.stringify(reclamoV2.body));
    assert.ok(texto(reclamoV2.body).includes('SourceSans3'));

    const reclamoV1 = await vecina.api.get(
      `/api/reclamaciones/${idReclamacion}/informe?pdf=v1`
    );
    assert.equal(reclamoV1.status, 200, JSON.stringify(reclamoV1.body));
    assert.ok(texto(reclamoV1.body).includes('Helvetica'));
  });
});
