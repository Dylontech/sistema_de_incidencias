/**
 * Verificación funcional V2.3 contra la base configurada.
 *
 * Ejecuta flujos reales con supertest (sin levantar un puerto): login, reporte,
 * comentario, firma, folio, notificaciones, contacto, informe, legal,
 * publicidad, correos, simulación + reversión y respaldo.
 *
 * Uso: node scripts/verificar-funciones.mjs
 *      node scripts/verificar-funciones.mjs --limpiar  (borra la incidencia de prueba)
 */
import { crearApp } from '../src/app.js';
import { obtenerRepositorio, cerrarRepositorio } from '../src/repositories/index.js';
import { Api, MUNICIPIO_MARAVATIO, PUNTO_MARAVATIO } from '../test/helpers/api.js';

const LIMPIAR = process.argv.includes('--limpiar');
const marca = Date.now().toString(36);
const correoAutor = `verif-autor-${marca}@example.test`;
const correoFirmante = `verif-firma-${marca}@example.test`;
const resultados = [];

function check(nombre, ok, detalle = '') {
  const correcto = Boolean(ok);
  resultados.push({ nombre, ok: correcto, detalle });
  console.log(`  ${correcto ? 'PASS' : 'FAIL'}  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

async function main() {
  const app = crearApp();
  const repositorio = await obtenerRepositorio();
  let incidenciaId = null;

  try {
    console.log(`Verificación V2.3 · ${repositorio.driver}\n`);

    const publica = await new Api(app).get('/api/configuracion/publica');
    check('Configuración pública', publica.status === 200 && publica.body.configuracion?.firmas);

    const admin = await Api.admin(app);
    check('Login admin', Boolean(admin.token));
    const autor = await Api.ciudadano(app, { correo: correoAutor });
    check('Registro de ciudadano', Boolean(autor.token));

    const creada = await autor.post('/api/incidencias', {
      tipoId: 'bache',
      titulo: `[VERIFICACIÓN ${marca}] Bache de prueba`,
      descripcion: 'Reporte creado por verificar-funciones.mjs.',
      municipioId: MUNICIPIO_MARAVATIO,
      ...PUNTO_MARAVATIO,
      ambito: 'urbano'
    });
    incidenciaId = creada.body?.incidencia?.id || null;
    check('Crear incidencia', creada.status === 201 && Boolean(incidenciaId), creada.body?.error);
    const folio = creada.body?.incidencia?.folio;
    check('Folio generado', Boolean(folio), folio || '');

    const meta = await autor.patch(`/api/incidencias/${incidenciaId}/meta-firmas`, { meta: 1 });
    check('Fijar meta de firmas', meta.status === 200 && meta.body.firmas?.meta === 1);

    const comentario = await autor.post(`/api/incidencias/${incidenciaId}/comentarios`, {
      texto: 'Comentario de verificación.'
    });
    check('Comentar incidencia', comentario.status === 201 && Boolean(comentario.body.comentario));

    const firmante = await Api.ciudadano(app, { correo: correoFirmante });
    const firma = await firmante.post(`/api/incidencias/${incidenciaId}/firmas`, {});
    check('Firmar incidencia', firma.status === 201 && firma.body.firmas?.total >= 1);

    const historial = await autor.get('/api/notificaciones/historial?limite=20');
    check(
      'Historial de notificaciones',
      historial.status === 200 && Array.isArray(historial.body.notificaciones)
    );

    const folios = await autor.get(`/api/folios/mios?texto=${encodeURIComponent(folio || '')}`);
    check(
      'Buscar folio propio',
      folios.status === 200 && (folios.body.folios || []).some((f) => f.folio === folio)
    );

    const funcionarios = await autor.get(
      `/api/contacto/funcionarios?municipioId=${MUNICIPIO_MARAVATIO}`
    );
    const listaFuncionarios = funcionarios.body?.funcionarios || [];
    if (listaFuncionarios.length) {
      const contacto = await autor.post('/api/contacto/funcionarios', {
        municipioId: MUNICIPIO_MARAVATIO,
        funcionarioIds: [listaFuncionarios[0].id],
        asunto: `Contacto de verificación ${marca}`,
        mensaje: 'Mensaje enviado por verificar-funciones.mjs.'
      });
      check(
        'Contacto directo a funcionario',
        contacto.status === 201 && Boolean(contacto.body.contacto?.folio)
      );
    } else {
      check('Contacto directo a funcionario', true, 'sin funcionarios en el municipio; omitido');
    }

    const solicitud = await new Api(app).post('/api/publico/solicitudes-informe', {
      nombre: 'Verificación V2.3',
      correo: `verif-informe-${marca}@example.test`,
      aceptaTerminos: true,
      municipios: [MUNICIPIO_MARAVATIO],
      tiposTodos: true,
      formato: 'csv',
      mensaje: 'Solicitud de verificación.'
    });
    check('Solicitud de informe multi-territorio', solicitud.status === 201, solicitud.body?.error);

    const legal = await new Api(app).get('/api/legal/terminos');
    check('Legal publicado', legal.status === 200 && Boolean(legal.body.documento?.version));

    const plantillas = await admin.get('/api/admin/publicidad/plantillas');
    check(
      'Catálogo de publicidad con estructuras y colores',
      plantillas.status === 200 &&
        plantillas.body.redes?.length >= 3 &&
        plantillas.body.estructuras?.length >= 3
    );

    const centro = (await admin.get(`/api/municipios/${MUNICIPIO_MARAVATIO}`)).body?.municipio
      ?.center;
    const ubicacion =
      centro?.length === 2
        ? await admin.get(`/api/municipios/ubicacion?lat=${centro[0]}&lng=${centro[1]}`)
        : { status: 0 };
    check(
      'Detección de municipio por coordenadas',
      ubicacion.status === 200 && ubicacion.body.municipio?.id === MUNICIPIO_MARAVATIO
    );

    const stats = await admin.get(
      `/api/stats/panel?municipios=${MUNICIPIO_MARAVATIO}&estados=Michoac%C3%A1n`
    );
    check(
      'Estadísticas con filtros, comparación y tiempos',
      stats.status === 200 && Array.isArray(stats.body.comparativo) && Boolean(stats.body.tiempos)
    );

    const ficha = await admin.get(`/api/municipios/${MUNICIPIO_MARAVATIO}/ficha`);
    check('Ficha municipal consultable', ficha.status === 200 && Boolean(ficha.body.ficha));

    const roles = await admin.get('/api/roles-especiales');
    check('Catálogo de roles especiales', roles.status === 200 && Array.isArray(roles.body.roles));

    const permisos = await admin.get('/api/permisos/solicitudes');
    check(
      'Bandeja de solicitudes de permisos',
      permisos.status === 200 && Array.isArray(permisos.body.solicitudes)
    );

    const correos = await admin.get('/api/admin/correos-institucionales?limite=5');
    check('Directorio de correos', correos.status === 200 && Array.isArray(correos.body.correos));

    const sesiones = await admin.get('/api/admin/simulador/sesiones');
    const abierta = (sesiones.body.sesiones || []).find((s) => s.estado === 'abierta');
    if (abierta) await admin.post(`/api/admin/simulador/sesiones/${abierta.id}/revertir`, {});

    const sesion = await admin.post('/api/admin/simulador/sesiones', {
      rolSimulado: 'ciudadano',
      municipioId: MUNICIPIO_MARAVATIO,
      notas: `Verificación ${marca}`
    });
    check('Abrir simulación', sesion.status === 201 && Boolean(sesion.body.sesion?.id));
    const sesionId = sesion.body?.sesion?.id;
    if (sesionId) {
      const accion = await admin.post(
        `/api/admin/simulador/sesiones/${sesionId}/acciones/comentar`,
        { texto: 'Comentario simulado de verificación.' }
      );
      check('Ejecutar acción simulada', accion.status === 201);
      const reversion = await admin.post(`/api/admin/simulador/sesiones/${sesionId}/revertir`, {});
      check('Revertir simulación', reversion.status === 200 && reversion.body.sesion?.estado === 'revertida');
    }

    const respaldo = await admin.post('/api/admin/respaldos', {
      nombre: `Verificación V2.3 ${marca}`
    });
    check('Crear respaldo', respaldo.status === 201 && respaldo.body.respaldo?.estado === 'listo');
    const busqueda = await admin.get(
      `/api/admin/respaldos?texto=${encodeURIComponent(`Verificación V2.3 ${marca}`)}`
    );
    check(
      'Buscar respaldo con botón',
      busqueda.status === 200 && (busqueda.body.respaldos || []).length >= 1
    );

    if (LIMPIAR && incidenciaId) {
      await repositorio.eliminarIncidencia(incidenciaId);
      console.log('\n  Limpieza: incidencia de verificación eliminada');
    }
  } finally {
    await cerrarRepositorio();
  }

  const fallos = resultados.filter((r) => !r.ok);
  console.log(
    `\nResultado: ${resultados.length - fallos.length}/${resultados.length} PASS` +
      (fallos.length ? ` · ${fallos.length} FAIL` : '')
  );
  if (fallos.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('La verificación falló:', error.stack || error.message);
  process.exitCode = 1;
});
