/** Pruebas del ciclo de vida de una incidencia. */
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararBaseDeDatos, prepararEntorno } from './helpers/entorno.js';
import { Api, MUNICIPIO_MARAVATIO, PUNTO_FUERA, PUNTO_MARAVATIO, PUNTO_SIN_ZONA, ZONA_MARAVATIO, incidenciaValida } from './helpers/api.js';

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
    municipioId: MUNICIPIO_MARAVATIO,
    zonaId: ZONA_MARAVATIO,
    zonaNombre: 'Maravatío de Ocampo',
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
    assert.equal(inc.zonaId, ZONA_MARAVATIO);
    assert.equal(inc.municipioId, MUNICIPIO_MARAVATIO);
    assert.equal(inc.esAnonimo, true);
    // La autoría interna se conserva (permite editar el reporte y dirigirle
    // avisos), pero lo que se muestra es «Anónimo».
    assert.equal(inc.autor, 'anonimo_ciudadano1001');
    assert.equal(inc.autorNombre, 'Anónimo');
    assert.equal(inc.userKey, 'anon_ciudadano1001');
    assert.equal(inc.historial.length, 1);
    assert.equal(inc.historial[0].accion, 'Incidencia reportada');
    // colorAuto ya no se persiste (una sola fuente de verdad).
    assert.equal(inc.colorAuto, undefined);
  });

  test('la ubicación debe estar dentro del municipio; la comunidad es opcional', async () => {
    const anon = await Api.anonimo(app, 'ciudadano1002');

    // Dentro del municipio pero fuera de toda comunidad: se acepta sin zona,
    // porque las localidades del INEGI solo cubren las áreas pobladas.
    const sinZona = await anon.post('/api/incidencias', incidenciaValida(PUNTO_SIN_ZONA));
    assert.equal(sinZona.status, 201);
    assert.equal(sinZona.body.incidencia.zonaId, null);
    assert.equal(sinZona.body.incidencia.zonaNombre, null);
    assert.equal(sinZona.body.incidencia.municipioId, MUNICIPIO_MARAVATIO);

    // Fuera del polígono municipal (lo que la máscara del mapa oscurece).
    const fuera = await anon.post('/api/incidencias', incidenciaValida(PUNTO_FUERA));
    assert.equal(fuera.status, 400);
    assert.match(fuera.body.error, /fuera del municipio/);
  });

  test('con un municipio desconocido se mantiene la regla estricta por zona', async () => {
    // Si el cliente pide un municipio que no está en el catálogo no se puede
    // comprobar el límite municipal, así que vuelve a exigirse una zona.
    const anon = await Api.anonimo(app, 'ciudadano1009');
    const r = await anon.post(
      '/api/incidencias',
      incidenciaValida({ municipioId: 'no-existe', ...PUNTO_SIN_ZONA })
    );
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

  test('el listado es público dentro del municipio, pero solo el autor edita', async () => {
    const ana = await Api.anonimo(app, 'ciudadanoA01');
    const luis = await Api.anonimo(app, 'ciudadanoB01');

    const creada = await ana.post(
      '/api/incidencias',
      incidenciaValida({ titulo: 'Reporte de Ana frente a la primaria' })
    );
    assert.equal(creada.status, 201);
    const id = creada.body.incidencia.id;

    // Los dos ven el mismo reporte: los problemas son públicos.
    const listaAna = await ana.get('/api/incidencias');
    assert.ok(listaAna.body.incidencias.some((i) => i.id === id));

    const listaLuis = await luis.get('/api/incidencias');
    // Ve la de Ana (y las que hayan dejado otras pruebas en el municipio).
    assert.ok(listaLuis.body.incidencias.some((i) => i.id === id));

    const detalleAjeno = await luis.get(`/api/incidencias/${id}`);
    assert.equal(detalleAjeno.status, 200);
    assert.equal(detalleAjeno.body.incidencia.id, id);
    // Luis puede leerlo, pero no editarlo ni borrarlo.
    assert.equal(detalleAjeno.body.incidencia.permisos.puedeEditar, false);
    assert.equal(detalleAjeno.body.incidencia.permisos.puedeEliminar, false);

    const edicionAjena = await luis.put(`/api/incidencias/${id}`, { titulo: 'Secuestro' });
    assert.equal(edicionAjena.status, 403);
    assert.equal((await luis.delete(`/api/incidencias/${id}`)).status, 403);
  });

  test('un ciudadano no ve reportes de otro municipio', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoA02');
    await anon.post('/api/incidencias', incidenciaValida({ titulo: 'Reporte en Maravatío' }));

    // Al pedir otro municipio, el listado se recorta a él (queda vacío).
    const otro = await anon.get('/api/incidencias?municipio=11038');
    assert.equal(otro.status, 200);
    assert.equal(otro.body.incidencias.length, 0);
    assert.ok(
      otro.body.incidencias.every((i) => i.municipioId === '11038'),
      'solo puede devolver incidencias del municipio pedido'
    );
  });
});

describe('Incidencias: filtros', () => {
  test('filtra por texto, estado, tipo, zona y ordena por prioridad', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoFiltros');
    // El listado es público, así que convive con los reportes de otras pruebas:
    // se usan títulos con marcador único y se comprueba el filtro, no el total.
    const marca = 'filtroszz';

    await anon.post('/api/incidencias', incidenciaValida({ titulo: `Bache en la esquina ${marca}` }));
    await anon.post(
      '/api/incidencias',
      incidenciaValida({
        tipoId: 'basura',
        titulo: `Basura acumulada ${marca}`,
        descripcion: 'Muchos desechos.'
      })
    );
    const antigua = await insertarAntigua('anon_ciudadanoFiltros', {
      titulo: `Luminaria vieja ${marca}`
    });

    const todos = await anon.get(`/api/incidencias?texto=${marca}`);
    assert.equal(todos.body.incidencias.length, 3);

    const porTexto = await anon.get(`/api/incidencias?texto=Basura acumulada ${marca}`);
    assert.equal(porTexto.body.incidencias.length, 1);
    assert.equal(porTexto.body.incidencias[0].titulo, `Basura acumulada ${marca}`);

    const porTipo = await anon.get(`/api/incidencias?tipo=luminaria&texto=${marca}`);
    assert.equal(porTipo.body.incidencias.length, 1);
    assert.equal(porTipo.body.incidencias[0].id, antigua.id);
    assert.equal(porTipo.body.incidencias[0].color, 'rojo');

    const porEstado = await anon.get(`/api/incidencias?estado=resuelta&texto=${marca}`);
    assert.equal(porEstado.body.incidencias.length, 0);

    const porColor = await anon.get(`/api/incidencias?color=rojo&texto=${marca}`);
    assert.equal(porColor.body.incidencias.length, 1);
    assert.equal(porColor.body.incidencias[0].id, antigua.id);

    // El orden por prioridad pone primero lo más urgente de todo el municipio.
    const porPrioridad = await anon.get('/api/incidencias?orden=prioridad');
    assert.equal(porPrioridad.body.incidencias[0].color, 'rojo');

    const porZona = await anon.get(`/api/incidencias?zona=${ZONA_MARAVATIO}&texto=${marca}`);
    assert.equal(porZona.body.incidencias.length, 3);
    assert.ok(porZona.body.incidencias.every((i) => i.zonaId === ZONA_MARAVATIO));

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
    const ciudadano = await Api.ciudadano(app, { correo: 'estados2004@ejemplo.mx' });
    const funcionario = await Api.funcionario(app);

    const creada = await ciudadano.post('/api/incidencias', incidenciaValida());
    const id = creada.body.incidencia.id;

    const anonIntenta = await ciudadano.patch(`/api/incidencias/${id}/estado`, { estado: 'en_proceso' });
    assert.equal(anonIntenta.status, 403);

    const enProceso = await funcionario.patch(`/api/incidencias/${id}/estado`, { estado: 'en_proceso' });
    assert.equal(enProceso.status, 200);
    assert.equal(enProceso.body.incidencia.estado, 'en_proceso');
    assert.equal(enProceso.body.incidencia.historial.at(-1).accion, 'Estado cambiado a en_proceso');

    const directa = await funcionario.patch(`/api/incidencias/${id}/estado`, { estado: 'resuelta' });
    assert.equal(directa.status, 400); // debe pasar por la resolución

    const notificaciones = await ciudadano.get('/api/notificaciones');
    const tipos = notificaciones.body.notificaciones.map((n) => n.tipo);
    assert.ok(tipos.includes('reporte'));
    assert.ok(tipos.includes('estado'));
  });

  test('la sesión anónima no recibe ninguna notificación', async () => {
    const anon = await Api.anonimo(app, 'ciudadano2008');
    const funcionario = await Api.funcionario(app);

    const creada = await anon.post('/api/incidencias', incidenciaValida({ titulo: 'Bache sin buzón' }));
    const id = creada.body.incidencia.id;
    await funcionario.patch(`/api/incidencias/${id}/estado`, { estado: 'en_proceso' });
    await funcionario.post(`/api/incidencias/${id}/resolucion`, { solucion: 'Se bacheó la calle.' });

    const notificaciones = await anon.get('/api/notificaciones');
    const suyas = notificaciones.body.notificaciones.filter((n) => n.incidenciaId === id);
    assert.equal(suyas.length, 0);
  });

  test('resolver exige descripción, guarda evidencia y notifica al ciudadano', async () => {
    const ciudadano = await Api.ciudadano(app, { correo: 'resolver2005@ejemplo.mx' });
    const funcionario = await Api.funcionario(app);

    const creada = await ciudadano.post('/api/incidencias', incidenciaValida());
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

    const notificaciones = await ciudadano.get('/api/notificaciones');
    assert.ok(notificaciones.body.notificaciones.some((n) => n.tipo === 'resuelta'));
  });

  test('los comentarios se guardan y avisan al autor del reporte', async () => {
    const ciudadano = await Api.ciudadano(app, { correo: 'comentarios2006@ejemplo.mx' });
    const funcionario = await Api.funcionario(app);

    const creada = await ciudadano.post('/api/incidencias', incidenciaValida());
    const id = creada.body.incidencia.id;

    const vacio = await ciudadano.post(`/api/incidencias/${id}/comentarios`, { texto: '   ' });
    assert.equal(vacio.status, 400);

    const comentario = await funcionario.post(`/api/incidencias/${id}/comentarios`, {
      texto: 'Ya se envió la cuadrilla a revisar.'
    });
    assert.equal(comentario.status, 201);
    assert.equal(comentario.body.incidencia.comentarios.length, 1);
    assert.equal(comentario.body.incidencia.comentarios[0].autor, 'Juan López');

    const notificaciones = await ciudadano.get('/api/notificaciones');
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

describe('Incidencias: marca de peligro', () => {
  test('solo el personal marca y desmarca, con historial y aviso al autor', async () => {
    const ciudadano = await Api.ciudadano(app, { correo: 'peligro@ejemplo.mx' });
    const funcionario = await Api.funcionario(app);

    const creada = await ciudadano.post(
      '/api/incidencias',
      incidenciaValida({ titulo: 'Cable de alta tensión caído' })
    );
    assert.equal(creada.status, 201);
    const id = creada.body.incidencia.id;
    // Nace sin la marca.
    assert.equal(creada.body.incidencia.peligrosa, false);

    // El ciudadano no puede marcarla ni tan siquiera su propio reporte.
    const intento = await ciudadano.patch(`/api/incidencias/${id}/peligro`, { peligrosa: true });
    assert.equal(intento.status, 403);

    const marcada = await funcionario.patch(`/api/incidencias/${id}/peligro`, {
      peligrosa: true,
      motivo: 'Riesgo de electrocución para transeúntes'
    });
    assert.equal(marcada.status, 200);
    const inc = marcada.body.incidencia;
    assert.equal(inc.peligrosa, true);
    assert.equal(inc.peligrosaPor, 'Juan López');
    assert.ok(inc.peligrosaFecha);
    assert.equal(inc.peligrosaMotivo, 'Riesgo de electrocución para transeúntes');
    assert.match(inc.historial.at(-1).accion, /Marcada como peligrosa/);

    // El autor recibe el aviso.
    const notificaciones = await ciudadano.get('/api/notificaciones');
    assert.ok(
      notificaciones.body.notificaciones.some(
        (n) => n.tipo === 'alerta' && /peligroso/i.test(n.titulo)
      )
    );

    // Aparece marcada en el listado y en el detalle.
    const lista = await funcionario.get('/api/incidencias');
    const enLista = lista.body.incidencias.find((i) => i.id === id);
    assert.equal(enLista.peligrosa, true);

    const detalle = await funcionario.get(`/api/incidencias/${id}`);
    assert.equal(detalle.body.incidencia.peligrosa, true);
    assert.equal(detalle.body.incidencia.permisos.puedeMarcarPeligro, true);

    const detalleAnon = await ciudadano.get(`/api/incidencias/${id}`);
    assert.equal(detalleAnon.body.incidencia.permisos.puedeMarcarPeligro, false);

    // Repetir la marca no tiene sentido.
    const repetida = await funcionario.patch(`/api/incidencias/${id}/peligro`, { peligrosa: true });
    assert.equal(repetida.status, 409);

    // Y se puede retirar.
    const limpia = await funcionario.patch(`/api/incidencias/${id}/peligro`, { peligrosa: false });
    assert.equal(limpia.status, 200);
    assert.equal(limpia.body.incidencia.peligrosa, false);
    assert.equal(limpia.body.incidencia.peligrosaPor, null);
    assert.equal(limpia.body.incidencia.peligrosaMotivo, '');
  });

  test('una edición del autor no borra la marca de peligro', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoPeligro2');
    const funcionario = await Api.funcionario(app);

    const creada = await anon.post('/api/incidencias', incidenciaValida({ titulo: 'Poste a punto de caer' }));
    const id = creada.body.incidencia.id;
    await funcionario.patch(`/api/incidencias/${id}/peligro`, { peligrosa: true });

    const editada = await anon.put(`/api/incidencias/${id}`, { titulo: 'Poste inclinado sobre la banqueta' });
    assert.equal(editada.status, 200);
    assert.equal(editada.body.incidencia.peligrosa, true);
    assert.equal(editada.body.incidencia.peligrosaPor, 'Juan López');
  });

  test('el panel cuenta las peligrosas sin resolver', async () => {
    const anon = await Api.anonimo(app, 'ciudadanoPeligro3');
    const funcionario = await Api.funcionario(app);

    const creada = await anon.post('/api/incidencias', incidenciaValida({ titulo: 'Fuga de gas en la colonia' }));
    const id = creada.body.incidencia.id;
    const antes = await funcionario.get('/api/stats/panel');

    await funcionario.patch(`/api/incidencias/${id}/peligro`, { peligrosa: true });
    const conMarca = await funcionario.get('/api/stats/panel');
    assert.equal(conMarca.body.peligrosas, (antes.body.peligrosas || 0) + 1);

    // Al resolverla deja de contar como peligrosa activa.
    await funcionario.post(`/api/incidencias/${id}/resolucion`, {
      solucion: 'Acudió protección civil y cerró la fuga.'
    });
    const resuelta = await funcionario.get('/api/stats/panel');
    assert.equal(resuelta.body.peligrosas, antes.body.peligrosas || 0);

    // El motivo no puede exceder el límite.
    const otra = await anon.post(
      '/api/incidencias',
      incidenciaValida({ tipoId: 'basura', titulo: 'Otro reporte para el límite' })
    );
    const larga = await funcionario.patch(`/api/incidencias/${otra.body.incidencia.id}/peligro`, {
      peligrosa: true,
      motivo: 'x'.repeat(200)
    });
    assert.equal(larga.status, 400);
  });
});
