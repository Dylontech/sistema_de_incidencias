/**
 * SERVICIO: simulador de acciones del administrador.
 *
 * Una sesión crea usuarios y un reporte real etiquetados con `simulado=1` y
 * `simulacion_id`. Las acciones se ejecutan con los servicios de dominio
 * normales, así que permisos, alcance, validaciones, eventos y notificaciones
 * son los reales. Los efectos externos (SSE y correo) se bloquean en el
 * contexto de simulación y la reversión borra todo lo creado por la sesión.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { construirUsuario, hashearPassword } from '../models/usuario.model.js';
import { permisosDe } from './permisos.service.js';
import { accionesPara, accionPorId, ACCIONES_SIMULACION, ROLES_SIMULACION } from '../config/simulacion.catalogo.js';
import { ejecutarEnSimulacion } from './simulacion.contexto.js';
import {
  eliminarDatosSimulacion,
  marcarComentarioSimulado,
  marcarFirmasSimuladas,
  marcarSimulado,
  borrarUploadsSimulacion
} from './simulacion.utiles.js';
import { config } from '../config/index.js';
import * as incidencias from './incidencias.service.js';
import * as comentarios from './comentarios.service.js';
import * as firmas from './firmas.service.js';
import * as tickets from './tickets.service.js';
import * as contactosFuncionarios from './contactos-funcionarios.service.js';
import * as sugerencias from './sugerencias.service.js';
import * as solicitudes from './solicitudes.service.js';
import * as publicidad from './publicidad.service.js';
import * as correosInstitucionales from './correos-institucionales.service.js';

const ROLES = new Set(ROLES_SIMULACION.map((r) => r.clave));
const ROLES_LECTURA = new Set(['auditor', 'enlace_estatal', 'enlace_federal']);

function sufijo() {
  return nuevoId().slice(0, 8);
}

function rolValido(rol) {
  if (!ROLES.has(rol)) throw AppError.solicitudInvalida('Rol de simulación no válido');
  return rol;
}

function usuarioAnonimo(sesion, municipioId) {
  const username = sesion.usuarioSimulado || `anon_sim_${sesion.id.slice(0, 8)}`;
  return {
    id: null,
    username,
    userKey: username,
    nombre: 'Anónimo simulado',
    correo: null,
    rol: 'anonimo',
    municipioId,
    activo: true,
    esAnonimo: true,
    pseudonimo: false,
    puedeEscribir: false,
    permisos: [],
    municipios: [],
    estados: [],
    simulado: true,
    simulacionId: sesion.id
  };
}

function usuarioPublico(cuenta, sesion, alcance = { municipios: [], estados: [] }) {
  return {
    id: cuenta.id,
    username: cuenta.username,
    userKey: cuenta.username,
    nombre: cuenta.nombre,
    correo: cuenta.correo || null,
    rol: cuenta.rol,
    municipioId: cuenta.municipioId || sesion.municipioId || null,
    activo: true,
    esAnonimo: false,
    pseudonimo: cuenta.pseudonimo === true,
    puedeEscribir: cuenta.puedeEscribir === true,
    permisos: permisosDe(cuenta),
    municipios: alcance.municipios || [],
    estados: alcance.estados || [],
    simulado: true,
    simulacionId: sesion.id
  };
}

async function crearCuentaSimulada(repositorio, { rol, municipio, sesionId, nombre }) {
  const usernameBase = `sim_${rol}_${sufijo()}`.slice(0, 60);
  const cuenta = construirUsuario({
    username: usernameBase,
    nombre: nombre || `Cuenta simulada (${rol})`,
    correo: `${usernameBase}@example.test`,
    rol,
    municipioId: municipio?.id || null,
    passwordHash: await hashearPassword(nuevoId()),
    pseudonimo: rol === 'ciudadano',
    puedeEscribir: !ROLES_LECTURA.has(rol)
  });
  cuenta.simulado = true;
  cuenta.simulacionId = sesionId;
  const creada = await repositorio.crearUsuario(cuenta);
  await marcarSimulado(repositorio, 'usuarios', creada.id, sesionId);

  const alcance =
    rol === 'admin'
      ? { municipios: [], estados: [] }
      : rol === 'enlace_estatal' || rol === 'enlace_federal'
        ? { municipios: [], estados: municipio ? [municipio.estado] : [] }
        : municipio
          ? { municipios: [municipio.id], estados: [] }
          : { municipios: [], estados: [] };
  await repositorio.guardarAlcanceUsuario(creada.id, alcance);
  return { cuenta: creada, alcance };
}

async function usuarioDeSesion(repositorio, sesion, cual = 'principal') {
  const username =
    cual === 'incidencia' ? sesion.usuarioIncidencia : sesion.usuarioSimulado;
  if (sesion.rolSimulado === 'anonimo' && cual === 'principal') {
    return usuarioAnonimo(sesion, sesion.municipioId);
  }
  const cuenta = username ? await repositorio.usuarioPorUsername(username) : null;
  if (!cuenta) throw AppError.noEncontrado('La cuenta simulada de esta sesión ya no existe');
  const alcance = await repositorio.alcanceDeUsuario(cuenta.id);
  return usuarioPublico(cuenta, sesion, alcance);
}

async function municipioDeSesion(repositorio, sesion, datos = {}) {
  const id = datos.municipioId || sesion.municipioId;
  if (!id) throw AppError.solicitudInvalida('La sesión no tiene municipio');
  const municipio = await repositorio.municipioPorId(String(id));
  if (!municipio) throw AppError.solicitudInvalida('Municipio de la simulación no encontrado');
  return municipio;
}

function datosDeSesion(sesion) {
  return sesion.datos && typeof sesion.datos === 'object' ? sesion.datos : {};
}

async function incidenciaObjetivo(repositorio, sesion, datos = {}) {
  const id = datos.incidenciaId || sesion.incidenciaSimuladaId || datosDeSesion(sesion).incidenciaId;
  if (id) {
    const incidencia = await repositorio.incidenciaPorId(id);
    if (incidencia?.simulacionId === sesion.id) return incidencia;
  }
  const candidatas = await repositorio.buscarIncidencias({
    municipioId: sesion.municipioId,
    incluirSimulados: true,
    limite: 100
  });
  return candidatas.find((i) => i.simulacionId === sesion.id) || null;
}

async function registrarOperacion(repositorio, sesion, accion, { entidadId, despues, endpoint }) {
  const previas = await repositorio.operacionesSimulacion(sesion.id);
  return repositorio.crearOperacionSimulacion({
    id: nuevoId(),
    sesionId: sesion.id,
    orden: previas.length + 1,
    accionId: accion.id,
    entidadTipo: accion.entidad,
    entidadId: entidadId || null,
    operacion: 'crear',
    antes: null,
    despues: despues || null,
    endpoint: endpoint || accion.endpoint,
    resultado: { ok: true },
    creadoEn: new Date().toISOString()
  });
}

export function catalogo(rol = null) {
  return {
    roles: ROLES_SIMULACION,
    acciones: rol ? accionesPara(rol) : ACCIONES_SIMULACION
  };
}

export async function listar(repositorio, admin) {
  const sesiones = await repositorio.sesionesSimulacion({
    adminId: admin.username,
    limite: 30
  });
  return sesiones;
}

export async function detalle(repositorio, admin, id) {
  const sesion = await repositorio.sesionSimulacionPorId(id);
  if (!sesion || sesion.adminId !== admin.username) {
    throw AppError.noEncontrado('Sesión de simulación no encontrada');
  }
  return {
    ...sesion,
    operaciones: await repositorio.operacionesSimulacion(id)
  };
}

export async function abrir(repositorio, admin, datos = {}) {
  const rolSimulado = rolValido(datos.rolSimulado);
  const municipioId = datos.municipioId || admin.municipioId || null;
  if (!municipioId) throw AppError.solicitudInvalida('Elige un municipio para la simulación');
  const municipio = await repositorio.municipioPorId(String(municipioId));
  if (!municipio) throw AppError.solicitudInvalida('Municipio no encontrado');

  const abiertas = await repositorio.sesionesSimulacion({
    adminId: admin.username,
    estado: 'abierta',
    limite: 10
  });
  if (abiertas.length) {
    throw AppError.conflicto(
      `Ya tienes una simulación abierta (${abiertas[0].rolSimulado}). Ciérrala o revíertela antes de abrir otra.`
    );
  }

  const id = nuevoId();
  const sesion = {
    id,
    adminId: admin.username,
    rolSimulado,
    estado: 'abierta',
    creadaEn: new Date().toISOString(),
    cerradaEn: null,
    revertidaEn: null,
    notas: String(datos.notas || '').slice(0, 1000),
    municipioId: municipio.id,
    usuarioSimulado: null,
    usuarioIncidencia: null,
    incidenciaSimuladaId: null,
    datos: {}
  };
  await repositorio.crearSesionSimulacion(sesion);

  const principal =
    rolSimulado === 'anonimo'
      ? null
      : await crearCuentaSimulada(repositorio, {
          rol: rolSimulado,
          municipio,
          sesionId: id,
          nombre: datos.nombre || `Simulación ${rolSimulado}`
        });
  sesion.usuarioSimulado =
    rolSimulado === 'anonimo' ? `anon_sim_${id.slice(0, 8)}` : principal.cuenta.username;

  let cuentaIncidencia = principal;
  if (!cuentaIncidencia || rolSimulado === 'anonimo' || rolSimulado !== 'ciudadano') {
    cuentaIncidencia = await crearCuentaSimulada(repositorio, {
      rol: 'ciudadano',
      municipio,
      sesionId: id,
      nombre: 'Ciudadano simulado'
    });
  }
  sesion.usuarioIncidencia = cuentaIncidencia?.cuenta?.username || sesion.usuarioSimulado;

  const usuarioIncidencia =
    rolSimulado === 'anonimo' || rolSimulado === 'ciudadano'
      ? rolSimulado === 'anonimo'
        ? usuarioAnonimo(sesion, municipio.id)
        : usuarioPublico(cuentaIncidencia.cuenta, sesion, cuentaIncidencia.alcance)
      : usuarioPublico(cuentaIncidencia.cuenta, sesion, cuentaIncidencia.alcance);

  let advertencia = '';
  try {
    const incidencia = await ejecutarEnSimulacion(
      { simulacionId: id, sesionId: id, rolSimulado, adminId: admin.username },
      () =>
        incidencias.crear(repositorio, usuarioIncidencia, {
          tipoId: 'bache',
          titulo: datos.titulo || '[SIMULACIÓN] Bache de prueba',
          descripcion:
            datos.descripcion ||
            'Reporte inicial generado por el simulador para probar comentarios, firmas y cambios de estado.',
          indicaciones: 'Datos simulados; no representan un reporte real.',
          lat: municipio.center[0],
          lng: municipio.center[1],
          municipioId: municipio.id,
          ambito: 'urbano',
          claveIdempotencia: `sim_${id}`
        })
    );
    sesion.incidenciaSimuladaId = incidencia.id;
    await marcarSimulado(repositorio, 'incidencias', incidencia.id, id);
    await registrarOperacion(repositorio, sesion, accionPorId('reportar'), {
      entidadId: incidencia.id,
      despues: {
        titulo: incidencia.titulo,
        folio: incidencia.folio,
        municipioId: incidencia.municipioId
      },
      endpoint: 'POST /api/incidencias (creación inicial)'
    });
  } catch (error) {
    advertencia = `No se pudo crear el reporte inicial: ${error.message}`;
  }

  sesion.datos = {
    municipioId: municipio.id,
    municipioNombre: municipio.nombre,
    estadoEntidad: municipio.estado,
    incidenciaId: sesion.incidenciaSimuladaId,
    advertencia
  };
  const actualizada = await repositorio.actualizarSesionSimulacion(id, {
    usuarioSimulado: sesion.usuarioSimulado,
    usuarioIncidencia: sesion.usuarioIncidencia,
    incidenciaSimuladaId: sesion.incidenciaSimuladaId,
    datos: sesion.datos
  });
  return { ...actualizada, acciones: accionesPara(rolSimulado), advertencia };
}

async function ejecutarAccion(repositorio, sesion, admin, accion, datos, usuario) {
  const municipio = await municipioDeSesion(repositorio, sesion, datos);
  const objetivo = await incidenciaObjetivo(repositorio, sesion, datos);

  switch (accion.id) {
    case 'reportar': {
      const incidencia = await incidencias.crear(repositorio, usuario, {
        tipoId: 'bache',
        titulo: datos.titulo || '[SIMULACIÓN] Bache de prueba',
        descripcion: datos.descripcion || 'Reporte generado por el simulador.',
        indicaciones: 'Datos simulados.',
        lat: municipio.center[0],
        lng: municipio.center[1],
        municipioId: municipio.id,
        ambito: 'urbano',
        claveIdempotencia: `sim_${sesion.id}_${Date.now()}`
      });
      await marcarSimulado(repositorio, 'incidencias', incidencia.id, sesion.id);
      await repositorio.actualizarSesionSimulacion(sesion.id, {
        incidenciaSimuladaId: incidencia.id,
        datos: { ...datosDeSesion(sesion), incidenciaId: incidencia.id }
      });
      await registrarOperacion(repositorio, sesion, accion, {
        entidadId: incidencia.id,
        despues: { titulo: incidencia.titulo, folio: incidencia.folio }
      });
      return { tipo: 'incidencia', id: incidencia.id, folio: incidencia.folio, titulo: incidencia.titulo };
    }

    case 'comentar': {
      if (!objetivo) throw AppError.solicitudInvalida('La sesión no tiene una incidencia simulada');
      const comentario = await comentarios.crear(repositorio, usuario, objetivo.id, {
        texto: datos.texto || 'Comentario de prueba del simulador.'
      });
      await marcarComentarioSimulado(repositorio, objetivo.id, comentario.id, sesion.id);
      await registrarOperacion(repositorio, sesion, accion, {
        entidadId: comentario.id,
        despues: { incidenciaId: objetivo.id, texto: comentario.texto }
      });
      return { tipo: 'comentario', id: comentario.id, incidenciaId: objetivo.id };
    }

    case 'firmar': {
      if (!objetivo) throw AppError.solicitudInvalida('La sesión no tiene una incidencia simulada');
      const resumen = await firmas.firmarIncidencia(repositorio, usuario, objetivo.id);
      const recoleccion = await repositorio.recoleccionFirmaPorIncidencia(objetivo.id);
      if (recoleccion) await marcarSimulado(repositorio, 'recolecciones_firmas', recoleccion.id, sesion.id);
      await marcarFirmasSimuladas(repositorio, recoleccion?.id, usuario.userKey, sesion.id);
      await registrarOperacion(repositorio, sesion, accion, {
        entidadId: recoleccion?.id,
        despues: { incidenciaId: objetivo.id, total: resumen?.total || 0 }
      });
      return { tipo: 'firma', recoleccionId: recoleccion?.id, total: resumen?.total || 0 };
    }

    case 'recoleccion': {
      const resumen = await firmas.crearRecoleccionMunicipal(repositorio, usuario, {
        municipioId: municipio.id,
        titulo: datos.titulo || '[SIMULACIÓN] Recolección vecinal',
        descripcion: datos.descripcion || 'Recolección creada por el simulador.',
        meta: Number(datos.meta) || 10
      });
      await marcarSimulado(repositorio, 'recolecciones_firmas', resumen.id, sesion.id);
      await registrarOperacion(repositorio, sesion, accion, {
        entidadId: resumen.id,
        despues: { titulo: resumen.titulo, meta: resumen.meta }
      });
      return { tipo: 'recoleccion', id: resumen.id, titulo: resumen.titulo, meta: resumen.meta };
    }

    case 'cambiar-estado': {
      if (!objetivo) throw AppError.solicitudInvalida('La sesión no tiene una incidencia simulada');
      if (objetivo.simulacionId !== sesion.id) {
        throw AppError.prohibido('Solo se pueden modificar datos creados en esta simulación');
      }
      const estado = datos.estado || 'en_proceso';
      const incidencia =
        estado === 'resuelta'
          ? await incidencias.resolver(repositorio, usuario, objetivo.id, {
              solucion: datos.solucion || 'Atención simulada.'
            })
          : await incidencias.cambiarEstado(repositorio, usuario, objetivo.id, estado);
      await registrarOperacion(repositorio, sesion, accion, {
        entidadId: incidencia.id,
        despues: { estado: incidencia.estado, solucion: incidencia.solucion }
      });
      return { tipo: 'incidencia', id: incidencia.id, estado: incidencia.estado };
    }

    case 'ticket': {
      const ticket = await tickets.crear(repositorio, usuario, {
        asunto: datos.asunto || '[SIMULACIÓN] Ticket de prueba',
        cuerpo: datos.cuerpo || 'Ticket generado por el simulador.',
        municipioId: municipio.id,
        categoria: 'error',
        prioridad: 'media'
      });
      await marcarSimulado(repositorio, 'tickets', ticket.id, sesion.id);
      await registrarOperacion(repositorio, sesion, accion, {
        entidadId: ticket.id,
        despues: { folio: ticket.folio, asunto: ticket.asunto }
      });
      return { tipo: 'ticket', id: ticket.id, folio: ticket.folio };
    }

    case 'contacto': {
      const disponibles = await contactosFuncionarios.funcionariosDisponibles(
        repositorio,
        usuario,
        municipio.id
      );
      if (!disponibles.length) {
        throw AppError.solicitudInvalida(
          'Este municipio no tiene funcionarios disponibles; usa una sugerencia o solicita un funcionario.'
        );
      }
      const resultado = await contactosFuncionarios.crearContacto(repositorio, usuario, {
        municipioId: municipio.id,
        funcionarioIds: [disponibles[0].id],
        asunto: datos.asunto || '[SIMULACIÓN] Consulta ciudadana',
        mensaje: datos.mensaje || 'Mensaje de prueba del simulador.'
      });
      await marcarSimulado(repositorio, 'contactos_funcionarios', resultado.id, sesion.id);
      await registrarOperacion(repositorio, sesion, accion, {
        entidadId: resultado.id,
        despues: { folio: resultado.folio, destinatarios: resultado.destinatarios }
      });
      return { tipo: 'contacto', id: resultado.id, folio: resultado.folio };
    }

    case 'sugerencia': {
      const resultado = await sugerencias.crear(repositorio, {
        mensaje: datos.mensaje || 'Sugerencia de prueba del simulador.',
        tipo: 'mejora',
        municipioId: municipio.id,
        nombre: usuario.nombre
      });
      const sugerencia = await repositorio.sugerenciaPorFolio(resultado.folio);
      await marcarSimulado(repositorio, 'sugerencias', sugerencia?.id, sesion.id);
      await registrarOperacion(repositorio, sesion, accion, {
        entidadId: sugerencia?.id,
        despues: { folio: resultado.folio }
      });
      return { tipo: 'sugerencia', id: sugerencia?.id, folio: resultado.folio };
    }

    case 'informe': {
      const correo = String(
        datos.correo && datos.correo.includes('@')
          ? datos.correo
          : `simulacion-${sufijo()}@example.test`
      );
      const resultado = await solicitudes.crearSolicitud(
        repositorio,
        {
          nombre: datos.nombre || 'Solicitante simulado',
          correo,
          aceptaTerminos: true,
          municipioId: municipio.id,
          tiposTodos: true,
          formato: 'pdf',
          mensaje: 'Solicitud creada por el simulador.'
        },
        { ip: '127.0.0.1', userAgent: 'simulador' }
      );
      const solicitud =
        (await repositorio.solicitudInformePorFolio(resultado.folio)) || null;
      await marcarSimulado(repositorio, 'solicitudes_informe', solicitud?.id, sesion.id);
      await registrarOperacion(repositorio, sesion, accion, {
        entidadId: solicitud?.id,
        despues: { folio: resultado.folio, correo }
      });
      return { tipo: 'informe', id: solicitud?.id, folio: resultado.folio };
    }

    case 'publicacion': {
      const resultado = await publicidad.generar(repositorio, usuario, {
        red: datos.red || 'facebook',
        plantilla: 'reportar',
        municipioId: municipio.id,
        titulo: datos.titulo || '[SIMULACIÓN] Invita a reportar',
        texto: datos.texto || 'Contenido de prueba para redes sociales.',
        simulado: true,
        simulacionId: sesion.id
      });
      await marcarSimulado(repositorio, 'publicaciones_redes', resultado.publicacion.id, sesion.id);
      await registrarOperacion(repositorio, sesion, accion, {
        entidadId: resultado.publicacion.id,
        despues: { red: resultado.publicacion.red, caracteres: resultado.caracteres }
      });
      return { tipo: 'publicacion', id: resultado.publicacion.id, red: resultado.publicacion.red };
    }

    case 'correo': {
      const registrado = await correosInstitucionales.crear(repositorio, usuario, {
        estado: municipio.estado,
        municipioId: municipio.id,
        dependencia: datos.dependencia || 'Ayuntamiento (simulación)',
        correo: datos.correo || `simulacion-${sufijo()}@example.test`,
        verificado: true,
        simulado: true,
        simulacionId: sesion.id
      });
      await marcarSimulado(repositorio, 'correos_institucionales', registrado.id, sesion.id);
      await registrarOperacion(repositorio, sesion, accion, {
        entidadId: registrado.id,
        despues: { correo: registrado.correo, estado: registrado.estado }
      });
      return { tipo: 'correo', id: registrado.id, correo: registrado.correo };
    }

    default:
      throw AppError.solicitudInvalida('Acción de simulación no implementada');
  }
}

export async function ejecutar(repositorio, admin, sesionId, accionId, datos = {}) {
  const sesion = await repositorio.sesionSimulacionPorId(sesionId);
  if (!sesion || sesion.adminId !== admin.username) {
    throw AppError.noEncontrado('Sesión de simulación no encontrada');
  }
  if (sesion.estado !== 'abierta') {
    throw AppError.conflicto('La sesión de simulación no está abierta');
  }
  const accion = accionPorId(accionId);
  if (!accion) throw AppError.solicitudInvalida('Acción de simulación no encontrada');
  if (!accion.roles.includes(sesion.rolSimulado)) {
    throw AppError.prohibido(
      `El rol ${sesion.rolSimulado} no puede ejecutar «${accion.titulo}»`
    );
  }

  const usuario = await usuarioDeSesion(repositorio, sesion, 'principal');
  const resultado = await ejecutarEnSimulacion(
    {
      simulacionId: sesion.id,
      sesionId: sesion.id,
      rolSimulado: sesion.rolSimulado,
      adminId: admin.username
    },
    () => ejecutarAccion(repositorio, sesion, admin, accion, datos, usuario)
  );
  return {
    accion: {
      id: accion.id,
      titulo: accion.titulo,
      endpoint: accion.endpoint,
      permiso: accion.permiso,
      servicio: accion.servicio,
      repositorio: accion.repositorio,
      eventos: accion.eventos
    },
    resultado,
    sesion: await repositorio.sesionSimulacionPorId(sesion.id)
  };
}

export async function cerrar(repositorio, admin, id) {
  const sesion = await repositorio.sesionSimulacionPorId(id);
  if (!sesion || sesion.adminId !== admin.username) {
    throw AppError.noEncontrado('Sesión de simulación no encontrada');
  }
  if (sesion.estado !== 'abierta') {
    throw AppError.conflicto('La sesión ya no está abierta');
  }
  return repositorio.actualizarSesionSimulacion(id, {
    estado: 'cerrada',
    cerradaEn: new Date().toISOString()
  });
}

export async function revertir(repositorio, admin, id) {
  const sesion = await repositorio.sesionSimulacionPorId(id);
  if (!sesion || sesion.adminId !== admin.username) {
    throw AppError.noEncontrado('Sesión de simulación no encontrada');
  }
  if (sesion.estado === 'revertida') return { ...sesion, yaRevertida: true };

  await eliminarDatosSimulacion(repositorio, id);
  await borrarUploadsSimulacion(config, id);
  await repositorio.limpiarOperacionesSimulacion(id);
  return repositorio.actualizarSesionSimulacion(id, {
    estado: 'revertida',
    revertidaEn: new Date().toISOString(),
    datos: { ...datosDeSesion(sesion), revertida: true }
  });
}

export async function revertirTodas(repositorio, admin) {
  const sesiones = await repositorio.sesionesSimulacion({
    adminId: admin.username,
    limite: 100
  });
  const pendientes = sesiones.filter((s) => s.estado !== 'revertida');
  for (const sesion of pendientes) {
    await eliminarDatosSimulacion(repositorio, sesion.id);
    await borrarUploadsSimulacion(config, sesion.id);
    await repositorio.limpiarOperacionesSimulacion(sesion.id);
    await repositorio.actualizarSesionSimulacion(sesion.id, {
      estado: 'revertida',
      revertidaEn: new Date().toISOString()
    });
  }
  return { revertidas: pendientes.length };
}
