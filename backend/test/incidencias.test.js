/** Pruebas del ciclo de vida de una incidencia. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, PUNTO_FUERA, PUNTO_MARAVATIO, incidenciaValida } from './helpers/api.js';

const entorno = prepararEntorno();
await prepararBaseDeDatos(entorno);
const { crearApp } = await import('../src/app.js');
const { obtenerRepositorio } = await import('../src/repositories/index.js');

let app;
let repo;

before(async () => {
  app = crearApp();
  repo = await obtenerRepositorio();
});
after(() => entorno.limpiar());

/** Incidencia antigua (40 días) insertada directamente para probar colores. */
async function insertarAntigua(userKey, extra = {}) {
  const fecha = new Date(Date.now() - 40 * 86400000).toISOString();
  const incidencia = {
    id: `antigua-${Math.random().toString(36).slice(2, 8)}`,
    tipoId: 'luminaria',
    iconoCustom: '',
    titulo: 'Poste sin luz desde hace más de un mes',
    descripcion: 'La luminaria no enciende y la cuadra queda a oscuras.',
    indicaciones: '',
    lat: PUNTO_MARAVATIO.lat,
    lng: PUNTO_MARAVATIO.lng,
    fecha,
    actualizado: fecha,
    estado: 'reportada',
    esAnonimo: true,
    autor: 'Anónimo',
    autorNombre: 'Anónimo',
    userKey,
    municipioId: 'maravatio',
    zonaId: 'col_centro',
    zonaNombre: 'Centro',
    evidencia: [],
    historial: [],
    comentarios: [],
    fechaResolucion: null,
    solucion: null,
    evidenciaSolucion: [],
    ...extra
  };
  await repo.insertarIncidencias([incidencia]);
  return incidencia;
}

describe('Incidencias: creación', () => {
  test('un ciudadano reporta dentro de una zona autorizada', async () => {
    const anon = await Api.anonimo(app, 'ciudadano1001');
    const r = await anon.post('/api/incidencias', incidenciaValida());

    assert.equal(r.status, 201);
    const inc = r.body.incidencia;
    assert.equal(inc.estado, 'reportada');
    assert.equal(inc.color, 'amarillo');
    assert.equal(inc.dias, 0);
    assert.equal(inc.zonaId, 'col_centro');
    assert.equal(inc.municipioId, 'maravatio');
    assert.equal(inc.esAnonimo, true);
    assert.equal(inc.autor, 'Anónimo');
    assert.equal(inc.userKey, 'anon_ciudadano1001');
    assert.equal(inc.historial.length, 1);
    assert.equal(inc.historial[0].accion, 'Incidencia reportada');
    // colorAuto ya no se persiste (una sola fuente de verdad).
    assert.equal(inc.colorAuto, undefined);
  });

  test('rechaza ubicaciones fuera de las zonas autorizadas', async () => {
    const anon = await Api.anonimo(app, 'ciudadano1002');
    const r = await anon.post('/api/incidencias', incidenciaValida(PUNTO_FUERA));

    assert.equal(r.status, 400);
    assert.match(r.body.error, /fuera de las zonas autorizadas/);
  });

  test('valida tipo, título, descripción y coordenadas', async () => {
    const anon = await Api.anonimo(app, 'ciudadano1003');

    const sinTipo = await anon.post('/api/incidencias', { ...incidenciaValida(), tipoId: 'no-existe' });
    assert.equal(sinTipo.status, 400);
    assert.match(sinTipo.body.error, /tipo de incidencia válido/);

    const sinTitulo = await anon.post('/api/incidencias', { ...incidenciaValida(), titulo: '' });
    assert.equal(sinTitulo.status, 400);
    assert.ok(sinTitulo.body.detalles.some((d) => d.campo === 'titulo'));

    const larga = await anon.post('/api/incidencias', {
      ...incidenciaValida(),
      descripcion: 'x'.repeat(601)
    });
    assert.equal(larga.status, 400);
    assert.ok(larga.body.detalles.some((d) => d.campo === 'descripcion'));

    const coordsRaras = await anon.post('/api/incidencias', {
      ...incidenciaValida(),
      lat: 120,
      lng: 500
    });
    assert.equal(coordsRaras.status, 400);
  });

  test('bloquea reportes duplicados del mismo usuario, tipo y ubicación', async () => {
    const anon = await Api.anonimo(app, 'ciudadano1004');

    const primero = await anon.post('/api/incidencias', incidenciaValida());
    assert.equal(primero.status, 201);

    const repetido = await anon.post('/api/incidencias', incidenciaValida());
    assert.equal(repetido.status, 409);
    assert.match(repetido.body.error, /misma incidencia/);

    // Otro tipo en el mismo punto sí se permite.
    const otroTipo = await anon.post(
      '/api/incidencias',
      incidenciaValida({ tipoId: 'fuga', titulo: 'Fuga de agua junto al bache' })
    );
    assert.equal(otroTipo.status, 201);
  });

  test('el ciudadano solo ve sus propios reportes', async () => {
    const ana = await Api.anonimo(app, 'ciudadanoA01');
    const luis = await Api.anonimo(app, 'ciudadanoB01');

    const creada = await ana.post('/api/incidencias', incidenciaValida({ titulo: 'Reporte privado de Ana' }));
    assert.equal(creada.status, 201);

    const listaAna = await ana.get('/api/incidencias');
    assert.equal(listaAna.body.incidencias.length, 1);

    const listaLuis = await luis.get('/api/incidencias');
    assert.equal(listaLuis.body.incidencias.length, 0);

    const detalleAjeno = await luis.get(`/api/incidencias/${creada.body.incidencia.id}`);
    assert.equal(detalleAjeno.status, 403);
  });
});

describe('Incidencias: filtros', () => {
  test('filtra por texto, estado, tipo, zona y ordena por prioridad', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoFiltros');

    await anon.post('/api/incidencias', incidenciaValida({ titulo: 'Bache en la esquina' }));
    await anon.post(
      '/api/incidencias',
      incidenciaValida({ tipoId: 'basura', titulo: 'Basura acumulada', descripcion: 'Muchos desechos.' })
    );
    await insertarAntigua('anon_ciudadanoFiltros');

    const todos = await anon.get('/api/incidencias');
    assert.equal(todos.body.incidencias.length, 3);

    const porTexto = await anon.get('/api/incidencias?texto=basura');
    assert.equal(porTexto.body.incidencias.length, 1);
    assert.equal(porTexto.body.incidencias[0].titulo, 'Basura acumulada');

    const porTipo = await anon.get('/api/incidencias?tipo=luminaria');
    assert.equal(porTipo.body.incidencias.length, 1);
    assert.equal(porTipo.body.incidencias[0].color, 'rojo');

    const porEstado = await anon.get('/api/incidencias?estado=resuelta');
    assert.equal(porEstado.body.incidencias.length, 0);

    const porColor = await anon.get('/api/incidencias?color=rojo');
    assert.equal(porColor.body.incidencias.length, 1);

    const porPrioridad = await anon.get('/api/incidencias?orden=prioridad');
    assert.equal(porPrioridad.body.incidencias[0].color, 'rojo');

    const porZona = await anon.get('/api/incidencias?zona=col_centro');
    assert.equal(porZona.body.incidencias.length, 3);

    const zonaInexistente = await anon.get('/api/incidencias?zona=ten_apeo');
    assert.equal(zonaInexistente.body.incidencias.length, 0);
  });
});

describe('Incidencias: edición y estados', () => {
  test('editar conserva estado, fecha e historial (defecto corregido)', async () => {
    const anon = await Api.anonimo(app, 'ciudadano2001');
    const funcionario = await Api.funcionario(app);

    const creada = await anon.post('/api/incidencias', incidenciaValida({ titulo: 'Título original' }));
    const id = creada.body.incidencia.id;
    const fechaOriginal = creada.body.incidencia.fecha;

    await funcionario.patch(`/api/incidencias/${id}/estado`, { estado: 'en_proceso' });

    const editada = await anon.put(`/api/incidencias/${id}`, { titulo: 'Título corregido' });
    assert.equal(editada.status, 200);
    assert.equal(editada.body.incidencia.titulo, 'Título corregido');
    assert.equal(editada.body.incidencia.estado, 'en_proceso'); // no vuelve a "reportada"
    assert.equal(editada.body.incidencia.fecha, fechaOriginal);
    assert.equal(editada.body.incidencia.historial.length, 2);
    assert.notEqual(editada.body.incidencia.actualizado, fechaOriginal);
  });

  test('editar la ubicación fuera de zona se rechaza y otro ciudadano no puede editar', async () => {
    const dueno = await Api.anonimo(app, 'ciudadano2002');
    const otro = await Api.anonimo(app, 'ciudadano2003');

    const creada = await dueno.post('/api/incidencias', incidenciaValida());
    const id = creada.body.incidencia.id;

    const fuera = await dueno.put(`/api/incidencias/${id}`, PUNTO_FUERA);
    assert.equal(fuera.status, 400);

    const soloLat = await dueno.put(`/api/incidencias/${id}`, { lat: 19.92 });
    assert.equal(soloLat.status, 400);

    const ajeno = await otro.put(`/api/incidencias/${id}`, { titulo: 'Secuestro del reporte' });
    assert.equal(ajeno.status, 403);
  });

  test('solo funcionarios y administradores cambian estado; el flujo notifica al autor', async () => {
    const anon = await Api.anonimo(app, 'ciudadano2004');
    const funcionario = await Api.funcionario(app);

    const creada = await anon.post('/api/incidencias', incidenciaValida());
    const id = creada.body.incidencia.id;

    const anonIntenta = await anon.patch(`/api/incidencias/${id}/estado`, { estado: 'en_proceso' });
    assert.equal(anonIntenta.status, 403);

    const enProceso = await funcionario.patch(`/api/incidencias/${id}/estado`, { estado: 'en_proceso' });
    assert.equal(enProceso.status, 200);
    assert.equal(enProceso.body.incidencia.estado, 'en_proceso');
    assert.equal(enProceso.body.incidencia.historial.at(-1).accion, 'Estado cambiado a en_proceso');

    const directa = await funcionario.patch(`/api/incidencias/${id}/estado`, { estado: 'resuelta' });
    assert.equal(directa.status, 400); // debe pasar por la resolución

    const notificaciones = await anon.get('/api/notificaciones');
    const tipos = notificaciones.body.notificaciones.map((n) => n.tipo);
    assert.ok(tipos.includes('reporte'));
    assert.ok(tipos.includes('estado'));
  });

  test('resolver exige descripción, guarda evidencia y notifica al ciudadano', async () => {
    const anon = await Api.anonimo(app, 'ciudadano2005');
    const funcionario = await Api.funcionario(app);

    const creada = await anon.post('/api/incidencias', incidenciaValida());
    const id = creada.body.incidencia.id;

    const sinTexto = await funcionario.post(`/api/incidencias/${id}/resolucion`, { solucion: '' });
    assert.equal(sinTexto.status, 400);

    const resuelta = await funcionario.post(`/api/incidencias/${id}/resolucion`, {
      solucion: 'Se rellenó el bache con concreto hidráulico.',
      evidenciaSolucion: [
        { nombre: 'oficio.pdf', tipo: 'application/pdf', tamano: 1024, url: '/uploads/oficio.pdf' }
      ]
    });
    assert.equal(resuelta.status, 200);
    const inc = resuelta.body.incidencia;
    assert.equal(inc.estado, 'resuelta');
    assert.equal(inc.color, 'verde');
    assert.equal(inc.dias, null);
    assert.ok(inc.fechaResolucion);
    assert.equal(inc.evidenciaSolucion.length, 1);
    assert.match(inc.historial.at(-1).accion, /^Incidencia resuelta:/);

    // Resolver dos veces es un conflicto.
    const repetida = await funcionario.post(`/api/incidencias/${id}/resolucion`, {
      solucion: 'Otra vez'
    });
    assert.equal(repetida.status, 409);

    const notificaciones = await anon.get('/api/notificaciones');
    assert.ok(notificaciones.body.notificaciones.some((n) => n.tipo === 'resuelta'));
  });

  test('los comentarios se guardan y avisan al autor del reporte', async () => {
    const anon = await Api.anonimo(app, 'ciudadano2006');
    const funcionario = await Api.funcionario(app);

    const creada = await anon.post('/api/incidencias', incidenciaValida());
    const id = creada.body.incidencia.id;

    const vacio = await anon.post(`/api/incidencias/${id}/comentarios`, { texto: '   ' });
    assert.equal(vacio.status, 400);

    const comentario = await funcionario.post(`/api/incidencias/${id}/comentarios`, {
      texto: 'Ya se envió la cuadrilla a revisar.'
    });
    assert.equal(comentario.status, 201);
    assert.equal(comentario.body.incidencia.comentarios.length, 1);
    assert.equal(comentario.body.incidencia.comentarios[0].autor, 'Juan López');

    const notificaciones = await anon.get('/api/notificaciones');
    assert.ok(notificaciones.body.notificaciones.some((n) => n.tipo === 'comentario'));
  });

  test('eliminar una incidencia es exclusivo del administrador', async () => {
    const anon = await Api.anonimo(app, 'ciudadano2007');
    const funcionario = await Api.funcionario(app);
    const admin = await Api.admin(app);

    const creada = await anon.post('/api/incidencias', incidenciaValida());
    const id = creada.body.incidencia.id;

    assert.equal((await funcionario.delete(`/api/incidencias/${id}`)).status, 403);
    assert.equal((await anon.delete(`/api/incidencias/${id}`)).status, 403);
    assert.equal((await admin.delete(`/api/incidencias/${id}`)).status, 200);
    assert.equal((await admin.get(`/api/incidencias/${id}`)).status, 404);
  });
});
