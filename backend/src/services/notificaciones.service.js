/** SERVICIO: Notificaciones por usuario. */
import { AppError } from '../utils/AppError.js';
import {
  ALCANCES_NOTIFICACION,
  CANALES_NOTIFICACION,
  MODOS_NOTIFICACION,
  ROLES_PERSONAL,
  SEVERIDADES_NOTIFICACION
} from '../config/constantes.js';
import { dirigidaA, construirNotificacion } from '../models/notificacion.model.js';
import { alcanceDe, esEmpleado } from './alcance.service.js';
import { emitirA } from './eventos.service.js';
import { catalogoEventos, definicionDe, eventoValido } from './notificaciones.catalogo.js';
import { enviarCorreo } from './correo.service.js';
import { contextoSimulacion } from './simulacion.contexto.js';
import { marcarSimulado } from './simulacion.utiles.js';

/**
 * Buzón del usuario.
 *
 * La sesión anónima no tiene cuenta a la que avisar, así que su buzón está
 * siempre vacío: el sistema de cuentas decidió que el anónimo solo reporta y
 * que el seguimiento (avisos de estado, comentarios y resolución) es cosa de
 * quien se registra.
 */
export async function listar(repositorio, usuario) {
  if (usuario?.rol === 'anonimo') return [];
  return repositorio.notificacionesDe(usuario.userKey);
}

export async function marcarLeida(repositorio, usuario, id) {
  const notificacion = await repositorio.notificacionPorId(id);
  if (!notificacion) throw AppError.noEncontrado('Notificación no encontrada');
  if (!dirigidaA(notificacion, usuario.userKey)) {
    throw AppError.prohibido('Esa notificación no es tuya');
  }

  await repositorio.marcarNotificacionLeida(id);
  return listar(repositorio, usuario);
}

export async function marcarTodasLeidas(repositorio, usuario) {
  const marcadas = await repositorio.marcarNotificacionesLeidas(usuario.userKey);
  return { marcadas, notificaciones: await listar(repositorio, usuario) };
}

export async function eliminar(repositorio, usuario, id) {
  const notificacion = await repositorio.notificacionPorId(id);
  if (!notificacion) throw AppError.noEncontrado('Notificación no encontrada');
  if (!dirigidaA(notificacion, usuario.userKey)) {
    throw AppError.prohibido('Esa notificación no es tuya');
  }

  // Ya no se borra: se archiva para que quede disponible en el historial.
  await repositorio.archivarNotificacion(id);
  return listar(repositorio, usuario);
}

/** Historial paginado, incluye archivadas. */
export async function historial(repositorio, usuario, filtros = {}) {
  if (usuario?.rol === 'anonimo') {
    return { notificaciones: [], total: 0, pagina: 1, limite: 30 };
  }
  return repositorio.notificacionesHistorial(usuario.userKey, {
    pagina: Number(filtros.pagina) || 1,
    limite: Number(filtros.limite) || 30,
    evento: filtros.evento || null,
    desde: filtros.desde || null,
    hasta: filtros.hasta || null,
    texto: filtros.texto || '',
    incluirArchivadas: filtros.incluirArchivadas !== false
  });
}

export async function archivar(repositorio, usuario, id) {
  const notificacion = await repositorio.notificacionPorId(id);
  if (!notificacion) throw AppError.noEncontrado('Notificación no encontrada');
  if (!dirigidaA(notificacion, usuario.userKey)) {
    throw AppError.prohibido('Esa notificación no es tuya');
  }
  await repositorio.archivarNotificacion(id);
  return listar(repositorio, usuario);
}

export async function restaurar(repositorio, usuario, id) {
  const notificacion = await repositorio.notificacionPorId(id);
  if (!notificacion) throw AppError.noEncontrado('Notificación no encontrada');
  if (!dirigidaA(notificacion, usuario.userKey)) {
    throw AppError.prohibido('Esa notificación no es tuya');
  }
  return repositorio.restaurarNotificacion(id);
}

export async function archivarTodas(repositorio, usuario) {
  const total = await repositorio.archivarNotificaciones(usuario.userKey);
  return { total, notificaciones: await listar(repositorio, usuario) };
}

/* --------------------------- preferencias --------------------------- */

/** Modos que el rol puede elegir. Los funcionarios no pueden pedir «todos». */
function modosPermitidos(rol) {
  if (rol === 'admin') return [...MODOS_NOTIFICACION];
  if (rol === 'funcionario' || rol === 'auditor') return ['asignados', 'municipios', 'ninguno'];
  return ['asignados', 'ninguno'];
}

function modoPorDefecto(rol) {
  // El administrador arranca en silencio: él decide si quiere recibir avisos.
  if (rol === 'admin') return 'ninguno';
  return 'asignados';
}

/** Preferencias efectivas de la cuenta (con valores por defecto por rol). */
export async function preferencias(repositorio, usuario) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Solo el personal puede configurar notificaciones');
  }
  const [guardadas, eventos] = await Promise.all([
    repositorio.preferenciasDe(usuario.id),
    repositorio.preferenciasEventosDe(usuario.id)
  ]);
  return {
    ...guardadas,
    modo: guardadas.existe ? guardadas.modo : modoPorDefecto(usuario.rol),
    permitidos: modosPermitidos(usuario.rol),
    eventos,
    catalogo: catalogoEventos(),
    canales: CANALES_NOTIFICACION
  };
}

/** Guarda el modo, los municipios elegidos, el aviso por correo y los canales por evento. */
export async function guardarPreferencias(repositorio, usuario, datos = {}) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Solo el personal puede configurar notificaciones');
  }

  const modo = MODOS_NOTIFICACION.includes(datos.modo) ? datos.modo : 'asignados';
  if (!modosPermitidos(usuario.rol).includes(modo)) {
    throw AppError.prohibido('Tu rol no permite ese modo de notificación');
  }

  let municipios = [];
  if (modo === 'municipios') {
    municipios = [...new Set((datos.municipios || []).filter(Boolean).map(String))];
    if (!municipios.length) {
      throw AppError.solicitudInvalida('Selecciona al menos un municipio');
    }

    const catalogo = await repositorio.todosMunicipios();
    const existentes = new Set(catalogo.map((m) => m.id));
    if (municipios.some((id) => !existentes.has(id))) {
      throw AppError.solicitudInvalida('Alguno de los municipios elegidos no existe');
    }

    const alcance = alcanceDe(usuario);
    if (!alcance.todos) {
      if (!alcance.municipios) {
        throw AppError.prohibido('Tu alcance no permite elegir municipios concretos');
      }
      if (municipios.some((id) => !alcance.municipios.has(id))) {
        throw AppError.prohibido('No puedes suscribirte a un municipio fuera de tu alcance');
      }
    }
  }

  // Canales por tipo de aviso: solo eventos conocidos y canales válidos.
  const eventos = datos.eventos && typeof datos.eventos === 'object' ? datos.eventos : {};
  const canales = {};
  for (const [evento, canal] of Object.entries(eventos)) {
    if (!eventoValido(evento)) continue;
    if (!CANALES_NOTIFICACION.includes(canal)) continue;
    canales[evento] = canal;
  }

  const guardadas = await repositorio.guardarPreferencias(usuario.id, {
    modo,
    porCorreo: datos.porCorreo === true,
    municipios
  });
  for (const [evento, canal] of Object.entries(canales)) {
    await repositorio.guardarPreferenciaEvento(usuario.id, evento, canal);
  }

  return {
    ...guardadas,
    permitidos: modosPermitidos(usuario.rol),
    eventos: await repositorio.preferenciasEventosDe(usuario.id),
    catalogo: catalogoEventos(),
    canales: CANALES_NOTIFICACION
  };
}

/* --------------------- aviso de incidencia nueva --------------------- */

/** ¿Este miembro del personal debe recibir el aviso de la incidencia? */
function leToca(preferencia, alcance, incidencia) {
  if (preferencia.modo === 'ninguno') return false;
  if (preferencia.modo === 'todos') return true;
  if (preferencia.modo === 'municipios') {
    return preferencia.municipios.includes(incidencia.municipioId);
  }

  // «asignados»: el alcance territorial de la cuenta.
  if (alcance.todos) return true;
  if (alcance.municipios) return alcance.municipios.has(incidencia.municipioId);
  if (alcance.estados) {
    return Boolean(incidencia.estadoEntidad) && alcance.estados.has(incidencia.estadoEntidad);
  }
  return false;
}

/* --------------------------- despachador central -------------------------- */

/**
 * Canales efectivos de una cuenta para un evento: lo que haya elegido en su
 * configuración personal; si no, la regla global; si no, la definición del
 * catálogo. `porCorreo` de la configuración antigua añade correo.
 */
function canalEfectivo({ evento, canalBase, preferenciasEvento = {}, porCorreo = false }) {
  const elegido = preferenciasEvento[evento];
  if (CANALES_NOTIFICACION.includes(elegido)) return elegido;
  if (porCorreo && canalBase === 'app') return 'ambos';
  return CANALES_NOTIFICACION.includes(canalBase) ? canalBase : 'app';
}

/** Envía el aviso por correo sin bloquear el flujo que lo originó. */
function enviarPorCorreo(repositorio, cuenta, { evento, titulo, mensaje, url }) {  if (!cuenta?.correo) return;
  const enlace = url ? `<p><a href="${url}">Abrir en el sistema</a></p>` : '';
  const html = plantilla({
    titulo,
    contenido: `<p>${escaparTexto(mensaje)}</p>${enlace}`,
    pie: 'Puedes cambiar qué avisos recibes desde la campana del sistema.'
  });
  enviarCorreo(repositorio, {
    para: cuenta.correo,
    asunto: `[Incidencias] ${titulo}`,
    html,
    texto: `${titulo}\n\n${mensaje}`,
    tipo: `notificacion_${evento}`
  }).catch((error) => console.error('[notificaciones] correo:', error.message));
}

function escaparTexto(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Envoltura mínima para el correo (evita importar toda la plantilla). */
function plantilla({ titulo, contenido, pie = '' }) {
  return `<!doctype html><html lang="es"><body style="font-family:Segoe UI,Arial,sans-serif;color:#1e293b">
    <div style="max-width:620px;margin:0 auto;padding:20px">
      <h2 style="color:#006657;font-size:18px">${escaparTexto(titulo)}</h2>
      ${contenido}
      ${pie ? `<p style="color:#64748b;font-size:12px">${escaparTexto(pie)}</p>` : ''}
    </div></body></html>`;
}

/**
 * Estado de la entidad de un aviso. Se usa para aplicar el alcance de avisos
 * de la clave cuando el evento no trae un municipio concreto.
 */
async function estadoDelAviso(repositorio, datos) {
  if (datos.estadoEntidad) return datos.estadoEntidad;
  if (!datos.municipioId) return null;
  const municipio = await repositorio.municipioPorId(datos.municipioId);
  return municipio?.estado || null;
}

/**
 * Carga, por usuario, la clave de su sesión abierta más reciente y el permiso
 * de avisos de esa clave. Los usuarios sin clave (por ejemplo, el admin que
 * entra con usuario y contraseña) conservan el comportamiento anterior.
 */
async function cargarAvisosPorClave(repositorio, cuentas = []) {
  const clavesPorUsuario = await repositorio.clavesDeSesionesActivas(
    cuentas.map((cuenta) => cuenta.id)
  );
  const claves = [...new Set(Object.values(clavesPorUsuario).filter(Boolean))];
  const notificaciones = claves.length
    ? await repositorio.notificacionesDeClaves(claves)
    : {};
  return { clavesPorUsuario, notificaciones };
}

/**
 * ¿La clave con la que entró la cuenta permite este aviso?
 *
 * - Sin clave: no se restringe (administradores y cuentas antiguas).
 * - Con avisos revocados: no se entrega.
 * - Sin municipios configurados: se usa todo el territorio de la clave.
 * - Con municipios: el evento debe caer en uno de ellos o en su estado.
 */
async function avisoPermitidoPorClave(
  repositorio,
  cuenta,
  datos,
  estadoEntidad,
  mapa,
  cache
) {
  const claveId = mapa.clavesPorUsuario[String(cuenta.id)];
  if (!claveId) return true;
  const config = mapa.notificaciones[claveId] || { activo: true, municipios: [] };
  if (config.activo === false) return false;
  const municipios = config.municipios || [];
  if (!municipios.length) return true;
  if (datos.municipioId) {
    return municipios.includes(String(datos.municipioId));
  }
  if (estadoEntidad) {
    if (!cache.porId) {
      const catalogo = await repositorio.todosMunicipios();
      cache.porId = new Map(catalogo.map((municipio) => [String(municipio.id), municipio]));
    }
    return municipios.some(
      (municipioId) => cache.porId.get(String(municipioId))?.estado === estadoEntidad
    );
  }
  return true;
}

/**
 * Entrega un aviso a una cuenta concreta: dedupe, persistencia, SSE y correo.
 * Devuelve `true` si se creó la notificación.
 */
async function entregar(repositorio, cuenta, datos = {}) {
  if (!cuenta || cuenta.rol === 'anonimo') return false;

  // En simulación solo se avisa a cuentas de la misma sesión y nunca se emite
  // SSE ni correo: los efectos externos quedan bloqueados.
  const simulacion = contextoSimulacion();
  if (simulacion) {
    if (cuenta.simulado !== true || cuenta.simulacionId !== simulacion.simulacionId) return false;
  } else if (cuenta.simulado === true) {
    return false;
  }

  const [preferenciasEvento, legado] = await Promise.all([
    repositorio.preferenciasEventosDe(cuenta.id),
    repositorio.preferenciasDe(cuenta.id)
  ]);
  const canal = canalEfectivo({
    evento: datos.evento,
    canalBase: datos.canal || 'app',
    preferenciasEvento,
    porCorreo: legado?.porCorreo === true
  });
  if (canal === 'ninguno') return false;

  if (datos.claveDedupe) {
    const existente = await repositorio.notificacionPorDedupe(cuenta.username, datos.claveDedupe);
    if (existente) return false;
  }

  const notificacion = construirNotificacion({
    tipo: datos.tipo || 'estado',
    evento: datos.evento,
    severidad: datos.severidad || 'info',
    titulo: datos.titulo,
    mensaje: datos.mensaje,
    incidenciaId: datos.incidenciaId ?? null,
    entidadTipo: datos.entidadTipo ?? null,
    entidadId: datos.entidadId ?? null,
    municipioId: datos.municipioId ?? null,
    url: datos.url ?? null,
    claveDedupe: datos.claveDedupe ?? null,
    paraUsuario: cuenta.username
  });

  await repositorio.crearNotificacion(notificacion);
  if (simulacion) {
    await marcarSimulado(repositorio, 'notificaciones', notificacion.id, simulacion.simulacionId);
    return true;
  }
  emitirA([cuenta.username], { ...notificacion, tipo: 'notificacion' });

  if (canal === 'correo' || canal === 'ambos') {
    enviarPorCorreo(repositorio, cuenta, datos);
  }
  return true;
}

/**
 * Emite un evento del catálogo.
 *
 * - Con `paraUsuarios` avisa solo a esas cuentas (autor, responsable…).
 * - Sin él, usa los roles de la configuración global y aplica el alcance
 *   territorial (`todos`, `estados`, `municipios` o `asignados`).
 * - Cada cuenta decide después su canal por evento.
 */
export async function emitir(repositorio, datos = {}) {
  const evento = String(datos.evento || '');
  const definicion = definicionDe(evento);
  if (!definicion) throw AppError.solicitudInvalida(`Evento de notificación desconocido: ${evento}`);

  const config = (await repositorio.configuracionNotificacion(evento)) || {};
  if (config.activo === false) return 0;

  const canalBase = CANALES_NOTIFICACION.includes(config.canal)
    ? config.canal
    : definicion.canal;
  if (canalBase === 'ninguno') return 0;

  const excluir = new Set((datos.excluir || []).filter(Boolean).map(String));
  const titulo = datos.titulo || definicion.etiqueta;
  const mensaje = datos.mensaje || '';
  const severidad = SEVERIDADES_NOTIFICACION.includes(datos.severidad)
    ? datos.severidad
    : config.severidad || definicion.severidad;
  const base = {
    evento,
    tipo: datos.tipo || tipoDeEvento(evento),
    titulo,
    mensaje,
    severidad,
    canal: canalBase,
    incidenciaId: datos.incidenciaId ?? null,
    entidadTipo: datos.entidadTipo ?? definicion.entidadTipo ?? null,
    entidadId: datos.entidadId ?? null,
    municipioId: datos.municipioId ?? null,
    url: datos.url ?? null,
    claveDedupe: datos.claveDedupe ?? null
  };

  // 1) Destinatarios explícitos (autor del ticket, responsable asignado…).
  if (Array.isArray(datos.paraUsuarios) && datos.paraUsuarios.length) {
    const cuentas = await repositorio.usuariosPorKeys(datos.paraUsuarios);
    let avisos = 0;
    const estadoEntidad = await estadoDelAviso(repositorio, datos);
    const mapaClaves = await cargarAvisosPorClave(repositorio, cuentas);
    const cache = { porId: null };
    for (const cuenta of cuentas) {
      if (cuenta.activo === false || excluir.has(cuenta.username)) continue;
      if (
        !(await avisoPermitidoPorClave(
          repositorio,
          cuenta,
          datos,
          estadoEntidad,
          mapaClaves,
          cache
        ))
      ) {
        continue;
      }
      if (await entregar(repositorio, cuenta, base)) avisos++;
    }
    return avisos;
  }

  // 2) Destinatarios por rol + alcance territorial.
  const roles = Array.isArray(config.roles) && config.roles.length ? config.roles : definicion.roles;
  if (!roles?.length) return 0;

  const candidatos = (await repositorio.usuariosPorRoles(roles)).filter(
    (u) => u.activo !== false && !excluir.has(u.username)
  );
  if (!candidatos.length) return 0;

  const alcanceRegla = ALCANCES_NOTIFICACION.includes(config.alcance)
    ? config.alcance
    : definicion.alcance;
  const municipiosRegla = new Set(config.municipios || []);
  const estadosRegla = new Set(config.estados || []);

  const estadoEntidad = await estadoDelAviso(repositorio, datos);

  const ids = candidatos.map((u) => u.id);
  const [alcances, legado, mapaClaves] = await Promise.all([
    alcanceRegla === 'asignados'
      ? repositorio.alcancesDeUsuarios(ids)
      : Promise.resolve({}),
    repositorio.preferenciasDeVarios(ids),
    cargarAvisosPorClave(repositorio, candidatos)
  ]);
  const cache = { porId: null };

  let avisos = 0;
  for (const cuenta of candidatos) {
    const asignado = alcances[cuenta.id] || { municipios: [], estados: [] };
    const alcance = alcanceDe({
      rol: cuenta.rol,
      municipios: asignado.municipios?.length ? asignado.municipios : [cuenta.municipioId].filter(Boolean),
      estados: asignado.estados || [],
      municipioId: cuenta.municipioId
    });

    const entra = (() => {
      if (alcanceRegla === 'todos') return true;
      if (alcanceRegla === 'municipios') {
        if (alcance.todos) return true;
        const objetivo = datos.municipioId;
        if (!objetivo) return municipiosRegla.size === 0;
        return municipiosRegla.size
          ? municipiosRegla.has(objetivo)
          : Boolean(alcance.municipios?.has(objetivo));
      }
      if (alcanceRegla === 'estados') {
        if (alcance.todos) return true;
        if (!estadoEntidad) return true;
        return estadosRegla.size
          ? estadosRegla.has(estadoEntidad)
          : Boolean(alcance.estados?.has(estadoEntidad));
      }
      // asignados
      if (alcance.todos) return true;
      if (alcance.municipios && datos.municipioId) return alcance.municipios.has(datos.municipioId);
      if (alcance.estados && estadoEntidad) return alcance.estados.has(estadoEntidad);
      return false;
    })();
    if (!entra) continue;
    if (legado[cuenta.id]?.modo === 'ninguno') continue;
    if (
      !(await avisoPermitidoPorClave(
        repositorio,
        cuenta,
        datos,
        estadoEntidad,
        mapaClaves,
        cache
      ))
    ) {
      continue;
    }

    if (await entregar(repositorio, cuenta, base)) avisos++;
  }
  return avisos;
}

/** Tipo visual de la campana a partir del evento (compatibilidad con iconos). */
function tipoDeEvento(evento) {
  if (evento === 'incidencia_resuelta') return 'resuelta';
  if (evento === 'incidencia_comentario') return 'comentario';
  if (evento === 'incidencia_creada') return 'reporte';
  if (evento === 'sugerencia_creada' || evento === 'sugerencia_respondida') return 'sugerencia';
  if (evento.startsWith('contacto_')) return 'contacto';
  if (evento.startsWith('solicitud_')) return 'solicitud';
  if (evento.startsWith('ticket_')) return 'solicitud';
  if (evento.startsWith('firma_') || evento === 'meta_firmas_alcanzada' || evento.startsWith('recoleccion_')) {
    return 'solicitud';
  }
  if (evento.startsWith('respaldo_')) return 'alerta';
  if (evento.startsWith('ficha_') || evento.startsWith('permiso_')) return 'solicitud';
  if (evento === 'mensaje_directo' || evento === 'difusion_personal') return 'mensaje';
  if (evento.startsWith('moderacion_') || evento === 'seguridad_alerta') return 'alerta';
  return 'estado';
}

/* ------------------------ configuración del panel ------------------------ */

/** Definición + regla guardada de un evento. */
export async function configuracionDe(repositorio, evento) {
  const definicion = definicionDe(evento);
  if (!definicion) throw AppError.solicitudInvalida('Evento de notificación desconocido');
  const guardada = await repositorio.configuracionNotificacion(evento);
  return {
    evento,
    etiqueta: definicion.etiqueta,
    descripcion: definicion.descripcion,
    rolesDisponibles: ROLES_PERSONAL,
    canales: CANALES_NOTIFICACION,
    severidades: SEVERIDADES_NOTIFICACION,
    alcances: ALCANCES_NOTIFICACION,
    ...definicion,
    ...(guardada || {})
  };
}

/** Todas las reglas (con los valores por defecto del catálogo). */
export async function configuracionCompleta(repositorio) {
  const guardadas = await repositorio.configuracionesNotificacion();
  const porEvento = new Map(guardadas.map((c) => [c.evento, c]));
  return catalogoEventos().map((definicion) => ({
    ...definicion,
    ...(porEvento.get(definicion.evento) || {}),
    rolesDisponibles: ROLES_PERSONAL,
    canales: CANALES_NOTIFICACION,
    severidades: SEVERIDADES_NOTIFICACION,
    alcances: ALCANCES_NOTIFICACION
  }));
}

/** Guarda la regla global de un evento (solo administradores). */
export async function guardarConfiguracion(repositorio, actor, evento, datos = {}) {
  const definicion = definicionDe(evento);
  if (!definicion) throw AppError.solicitudInvalida('Evento de notificación desconocido');

  const canal = CANALES_NOTIFICACION.includes(datos.canal) ? datos.canal : definicion.canal;
  const severidad = SEVERIDADES_NOTIFICACION.includes(datos.severidad)
    ? datos.severidad
    : definicion.severidad;
  const alcance = ALCANCES_NOTIFICACION.includes(datos.alcance)
    ? datos.alcance
    : definicion.alcance;

  const roles = [...new Set((datos.roles || []).filter((r) => ROLES_PERSONAL.includes(r)))];
  if (canal !== 'ninguno' && !roles.length && !datos.paraUsuarios) {
    throw AppError.solicitudInvalida('Elige al menos un rol destinatario');
  }

  let municipios = [];
  let estados = [];
  if (alcance === 'municipios') {
    municipios = [...new Set((datos.municipios || []).filter(Boolean).map(String))];
    if (!municipios.length) {
      throw AppError.solicitudInvalida('Elige al menos un municipio para el alcance');
    }
    const catalogo = await repositorio.todosMunicipios();
    const existentes = new Set(catalogo.map((m) => m.id));
    if (municipios.some((id) => !existentes.has(id))) {
      throw AppError.solicitudInvalida('Alguno de los municipios no existe');
    }
  }
  if (alcance === 'estados') {
    estados = [...new Set((datos.estados || []).filter(Boolean).map(String))];
    if (!estados.length) {
      throw AppError.solicitudInvalida('Elige al menos un estado para el alcance');
    }
  }

  return repositorio.guardarConfiguracionNotificacion(evento, {
    activo: datos.activo !== false,
    canal,
    severidad,
    alcance,
    roles,
    municipios,
    estados,
    actualizadoPor: actor?.username || null
  });
}

/**
 * Crea y empuja un aviso por cada funcionario, auditor, enlace o admin que
 * sigue el municipio de la incidencia nueva. Devuelve cuántos avisos creó.
 *
 * Los funcionarios reciben solo su ámbito; los administradores, lo que hayan
 * configurado (por defecto nada).
 */
export async function avisarNuevaIncidencia(repositorio, incidencia, { municipio = null } = {}) {
  const personal = await repositorio.usuariosPorRoles(ROLES_PERSONAL);
  const candidatos = personal.filter(
    (u) => u.username !== incidencia.userKey && u.activo !== false
  );
  if (!candidatos.length) return 0;

  const ids = candidatos.map((u) => u.id);
  const [alcances, guardadas] = await Promise.all([
    repositorio.alcancesDeUsuarios(ids),
    repositorio.preferenciasDeVarios(ids)
  ]);

  const lugar = municipio?.nombre || 'el municipio';
  let avisos = 0;

  for (const cuenta of candidatos) {
    const asignado = alcances[cuenta.id] || { municipios: [], estados: [] };
    const preferencia = guardadas[cuenta.id] || {
      modo: modoPorDefecto(cuenta.rol),
      porCorreo: false,
      municipios: [],
      existe: false
    };
    const modo = preferencia.existe
      ? preferencia.modo
      : modoPorDefecto(cuenta.rol);
    const efectiva = { ...preferencia, modo };

    const alcance = alcanceDe({
      rol: cuenta.rol,
      municipios: asignado.municipios,
      estados: asignado.estados,
      municipioId: cuenta.municipioId
    });

    if (!leToca(efectiva, alcance, incidencia)) continue;

    const creada = await entregar(repositorio, cuenta, {
      evento: 'incidencia_creada',
      tipo: 'reporte',
      severidad: 'info',
      titulo: '📍 Nueva incidencia reportada',
      mensaje: `"${incidencia.titulo}" se reportó en ${lugar}.`,
      incidenciaId: incidencia.id,
      entidadTipo: 'incidencia',
      entidadId: incidencia.id,
      municipioId: incidencia.municipioId || null,
      url: `/?incidencia=${incidencia.id}`,
      claveDedupe: `incidencia_creada:${incidencia.id}:${cuenta.username}`,
      canal: preferencia.porCorreo ? 'ambos' : 'app'
    });
    if (creada) avisos++;
  }

  return avisos;
}

