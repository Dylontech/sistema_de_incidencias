/**
 * SERVICIO: Incidencias — núcleo del negocio.
 *
 * Reúne lo que en el monolito estaba repartido entre Incidencias.guardar(),
 * confirmarResolver(), cambiarEstado(), eliminar() y agregarComentario(),
 * más las validaciones que antes solo existían en el navegador.
 */
import { LIMITES_TEXTO, ESTADOS, TIPO_OTRO } from '../config/constantes.js';
import { AppError } from '../utils/AppError.js';
import { ahoraIso } from '../utils/fechas.js';

function folioDeIncidencia(fecha) {
  const dia = new Date(fecha || Date.now()).toISOString().slice(0, 10).replace(/-/g, '');
  const azar = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INC-${dia}-${azar}`;
}
import { recolector } from '../utils/validacion.js';
import {
  validarEntrada,
  construirIncidencia,
  aplicarEdicion,
  agregarHistorial,
  agregarComentario,
  puedeEditar,
  esDuplicado
} from '../models/incidencia.model.js';
import { destinatarioDeIncidencia } from '../models/notificacion.model.js';
import { avisarNuevaIncidencia, emitir } from './notificaciones.service.js';
import { localizarZona, dentroDelMunicipio } from './geocerca.service.js';
import {
  enriquecer,
  enriquecerLista,
  filtrarPorColor,
  ordenarPorPrioridad
} from './estado.service.js';
import {
  esAdmin,
  esEmpleado,
  esAutorDe,
  filtroOcultas,
  puedeOperar,
  puedeSancionarA,
  filtrosDeAlcance,
  municipioDeRegistro,
  exigirVisibilidad
} from './alcance.service.js';

/**
 * Permisos que el frontend usa para decidir qué botones mostrar.
 *
 * `contexto` solo lo rellena el detalle para el personal: sabe si el autor del
 * contenido es una cuenta sancionable (y de qué rol) y cuántas denuncias tiene
 * pendientes. Así la interfaz no tiene que adivinar la jerarquía de roles.
 */
export function permisosDe(
  incidencia,
  usuario,
  { puedeSancionarAutor = false, denunciasPendientes = 0 } = {}
) {
  const resuelta = incidencia.estado === 'resuelta';
  return {
    puedeEditar: puedeEditar(incidencia, usuario) && !resuelta,
    puedeCambiarEstado: puedeOperar(usuario) && !resuelta,
    puedeResolver: puedeOperar(usuario) && !resuelta,
    puedeMarcarPeligro: puedeOperar(usuario),
    puedeEliminar: esAdmin(usuario),
    puedeComentar: true,
    // Moderación: cualquiera con sesión puede denunciar lo que no es suyo, y el
    // personal con escritura puede retirar contenido y sancionar a su autor.
    puedeDenunciar: Boolean(usuario) && !esAutorDe(incidencia, usuario),
    puedeModerar: puedeOperar(usuario),
    puedeOcultar: puedeOperar(usuario),
    puedeSancionarAutor: puedeOperar(usuario) && puedeSancionarAutor,
    denunciasPendientes
  };
}

/**
 * Los comentarios retirados por moderación no viajan al cliente.
 *
 * Al personal y a su autor les llega el texto (para poder gestionarlo o saber
 * qué se retiró); al resto se le manda la ficha sin texto, que el frontend
 * pinta como «comentario oculto». Ocultar solo en la interfaz dejaría el texto
 * a la vista de quien mirara la respuesta de la API.
 */
function conComentariosVisibles(incidencia, usuario) {
  if (esEmpleado(usuario)) return incidencia;
  const comentarios = (incidencia.comentarios || []).map((c) => {
    if (c.oculto !== true || esAutorDe(c, usuario)) return c;
    return { ...c, texto: '', visible: false };
  });
  return { ...incidencia, comentarios };
}

export async function listar(repositorio, usuario, filtros = {}) {
  const { color, orden, ...resto } = filtros;

  // Las publicaciones retiradas por moderación no se mezclan con el listado
  // público: las ve el personal y, con aviso, su propio autor.
  const ocultas = filtroOcultas(usuario);

  const consulta = filtrosDeAlcance(usuario, {
    municipioId: resto.municipioId || null,
    estadoEntidad: resto.estadoEntidad || null,
    texto: resto.texto || '',
    estado: resto.estado || 'todos',
    tipoId: resto.tipoId || 'todos',
    zonaId: resto.zonaId || 'todos',
    ambito: resto.ambito || 'todos',
    desde: resto.desde || null,
    hasta: resto.hasta || null,
    orden: orden === 'antigua' ? 'antigua' : 'reciente',
    ocultas,
    ocultasDe: ocultas === 'propias' ? usuario.userKey : null
  });

  const incidencias = await repositorio.buscarIncidencias(consulta);
  let lista = enriquecerLista(incidencias.map((i) => conComentariosVisibles(i, usuario)));
  lista = filtrarPorColor(lista, color);
  if (orden === 'prioridad') lista = ordenarPorPrioridad(lista);
  return lista;
}

/**
 * Permisos del detalle. Para el personal se resuelve la cuenta del autor: es lo
 * que permite mostrar (o no) los botones de advertir y suspender según la
 * jerarquía de roles.
 */
async function permisosDeDetalle(repositorio, incidencia, usuario) {
  if (!esEmpleado(usuario)) return permisosDe(incidencia, usuario);
  const cuentaAutor = incidencia.autor
    ? await repositorio.usuarioPorUsername(incidencia.autor)
    : null;
  const pendientes = await repositorio.denunciasDe({
    incidenciaId: incidencia.id,
    estado: 'pendiente'
  });
  return permisosDe(incidencia, usuario, {
    puedeSancionarAutor: puedeSancionarA(usuario, cuentaAutor),
    denunciasPendientes: pendientes.length
  });
}

export async function obtener(repositorio, usuario, id) {
  const incidencia = await repositorio.incidenciaPorId(id);
  exigirVisibilidad(incidencia, usuario);
  return {
    ...enriquecer(conComentariosVisibles(incidencia, usuario)),
    permisos: await permisosDeDetalle(repositorio, incidencia, usuario)
  };
}

/** Zonas donde el usuario puede ubicar un reporte (las del municipio activo). */
async function zonasDisponibles(repositorio, municipioId) {
  return municipioId
    ? repositorio.zonasPorMunicipio(municipioId)
    : repositorio.todasLasZonas();
}

export async function crear(repositorio, usuario, datos) {
  const claveIdempotencia = datos?.claveIdempotencia
    ? String(datos.claveIdempotencia).slice(0, 80)
    : null;
  if (claveIdempotencia) {
    const previa = await repositorio.incidenciaPorIdempotencia(
      usuario.userKey,
      claveIdempotencia
    );
    if (previa) return enriquecer(previa);
  }
  if (esEmpleado(usuario) && !puedeOperar(usuario)) {
    throw AppError.prohibido('Tu cuenta es de solo lectura: no puede registrar reportes');
  }

  const entrada = validarEntrada(datos);

  const tipo = await repositorio.tipoPorId(entrada.tipoId);
  if (!tipo) {
    throw AppError.solicitudInvalida('Selecciona un tipo de incidencia válido');
  }

  // El icono propio solo vale para «Otro»: en el resto de conceptos manda el del
  // tipo, así todos los reportes del mismo tipo se ven igual.
  if (tipo.id !== TIPO_OTRO) entrada.iconoCustom = '';

  // El municipio activo lo elige el usuario en el selector; el funcionario
  // sigue atado al suyo.
  const municipioObjetivo = municipioDeRegistro(usuario, entrada.municipioId);
  const municipio = municipioObjetivo
    ? await repositorio.municipioPorId(municipioObjetivo)
    : null;

  // La comunidad se busca entre las zonas del municipio activo.
  const { zona } = localizarZona(
    entrada.lat,
    entrada.lng,
    await zonasDisponibles(repositorio, municipioObjetivo)
  );

  const ambito = entrada.ambito || 'urbano';
  const esVial = ambito !== 'urbano';

  if (esVial) {
    // En una carretera el punto puede caer entre municipios o fuera del
    // polígono urbano: se exige un municipio de referencia y el nombre de la vía.
    if (!municipioObjetivo) {
      throw AppError.solicitudInvalida('Selecciona el municipio de referencia de la vía');
    }
    if (!entrada.viaNombre) {
      throw AppError.solicitudInvalida('Escribe el nombre de la carretera, autopista o camino');
    }
  } else if (municipio) {
    // Manda el límite municipal: es lo que la máscara del mapa deja elegir. La
    // comunidad (localidad del INEGI) se registra cuando el punto cae en una,
    // pero las localidades solo cubren las áreas pobladas, no todo el término
    // municipal, así que un reporte puede quedarse sin comunidad.
    if (!dentroDelMunicipio(entrada.lat, entrada.lng, municipio)) {
      throw AppError.solicitudInvalida('La ubicación está fuera del municipio');
    }
  } else if (!zona) {
    // Sin municipio identificado (cliente antiguo) se mantiene la regla
    // estricta de la versión anterior: el punto debe caer en una zona.
    throw AppError.solicitudInvalida(
      'La ubicación está fuera de las zonas autorizadas (comunidades/localidades) del municipio'
    );
  }

  const municipioFinal = municipioObjetivo || zona?.municipioId || null;
  const municipioFinalObj = municipio || (municipioFinal ? await repositorio.municipioPorId(municipioFinal) : null);

  // Anti-duplicados: mismo usuario + mismo tipo + misma ubicación (±0.0002°).
  const previas = await repositorio.buscarIncidencias({
    municipioId: municipioFinal,
    userKey: usuario.userKey
  });
  const candidato = {
    userKey: usuario.userKey,
    tipoId: entrada.tipoId,
    lat: entrada.lat,
    lng: entrada.lng
  };
  if (previas.some((p) => esDuplicado(p, candidato))) {
    throw AppError.conflicto('Ya reportaste esta misma incidencia recientemente en esta ubicación.');
  }

  const incidencia = construirIncidencia({
    entrada,
    usuario,
    zona,
    municipioId: municipioFinal,
    estadoEntidad: municipioFinalObj?.estado || null
  });
  incidencia.claveIdempotencia = claveIdempotencia;
  incidencia.folio = folioDeIncidencia(incidencia.fecha);

  await repositorio.crearIncidencia(incidencia);

  // Acuse al autor (si tiene cuenta) y aviso al personal que sigue el municipio.
  await notificar(
    repositorio,
    incidencia,
    'reporte',
    '✅ Reporte enviado',
    `Tu reporte "${incidencia.titulo}" fue registrado correctamente.`
  );
  await avisarNuevaIncidencia(repositorio, incidencia, { municipio: municipioFinalObj });

  return enriquecer(incidencia);
}

export async function actualizar(repositorio, usuario, id, datos) {
  const actual = await repositorio.incidenciaPorId(id);
  exigirVisibilidad(actual, usuario);
  if (!puedeEditar(actual, usuario)) {
    throw AppError.prohibido('No puedes editar esta incidencia');
  }

  const entrada = validarEntrada(datos, { parcial: true, exigirUbicacion: false });

  if (entrada.tipoId) {
    const tipo = await repositorio.tipoPorId(entrada.tipoId);
    if (!tipo) throw AppError.solicitudInvalida('Tipo de incidencia inválido');
  }

  // El icono propio solo se admite (y se conserva) en «Otro».
  if ((entrada.tipoId || actual.tipoId) !== TIPO_OTRO && entrada.iconoCustom !== undefined) {
    entrada.iconoCustom = '';
  }

  // Si cambia la ubicación hay que recalcular la zona (geocerca). Se aplica la
  // misma regla que al crear: manda el límite municipal y la comunidad se
  // guarda cuando el punto cae dentro de una.
  if (entrada.lat !== undefined && entrada.lng !== undefined) {
    const municipio = await repositorio.municipioPorId(actual.municipioId);
    const { zona } = localizarZona(
      entrada.lat,
      entrada.lng,
      await repositorio.zonasPorMunicipio(actual.municipioId)
    );
    const ambito = entrada.ambito || actual.ambito || 'urbano';
    const esVial = ambito !== 'urbano';
    if (!esVial && !zona && municipio && !dentroDelMunicipio(entrada.lat, entrada.lng, municipio)) {
      throw AppError.solicitudInvalida('La ubicación está fuera del municipio');
    }
    if (!esVial && !municipio && !zona) {
      throw AppError.solicitudInvalida(
        'La ubicación está fuera de las zonas autorizadas del municipio'
      );
    }
    entrada.zonaId = zona ? zona.id : null;
    entrada.zonaNombre = zona ? zona.nombre : null;
  }

  if ((entrada.ambito || actual.ambito) && (entrada.ambito || actual.ambito) !== 'urbano') {
    const via = entrada.viaNombre !== undefined ? entrada.viaNombre : actual.viaNombre;
    if (!via) {
      throw AppError.solicitudInvalida('Escribe el nombre de la carretera, autopista o camino');
    }
  }

  const editada = aplicarEdicion(actual, entrada);
  await repositorio.actualizarIncidencia(id, editada);
  return enriquecer(editada);
}

export async function cambiarEstado(repositorio, usuario, id, estado) {
  if (!puedeOperar(usuario)) {
    throw AppError.prohibido('Solo el personal con permiso de escritura puede cambiar el estado');
  }
  if (!['reportada', 'en_proceso'].includes(estado)) {
    throw AppError.solicitudInvalida(
      'Estado no permitido. Para marcar como resuelta usa la resolución con descripción.'
    );
  }

  const actual = await repositorio.incidenciaPorId(id);
  exigirVisibilidad(actual, usuario);
  if (actual.estado === 'resuelta') {
    throw AppError.conflicto('La incidencia ya está resuelta');
  }

  const ahora = ahoraIso();
  const actualizada = {
    ...actual,
    estado,
    actualizado: ahora,
    historial: agregarHistorial(actual, {
      estado,
      accion: 'Estado cambiado a ' + estado,
      por: usuario.nombre,
      ahora
    })
  };

  await repositorio.actualizarIncidencia(id, actualizada);
  await notificar(
    repositorio,
    actualizada,
    'estado',
    '🔄 Estado actualizado',
    `"${actualizada.titulo}" cambió a "${estado}".`
  );

  return enriquecer(actualizada);
}

export async function resolver(repositorio, usuario, id, { solucion, evidenciaSolucion } = {}) {
  if (!puedeOperar(usuario)) {
    throw AppError.prohibido('Solo el personal con permiso de escritura puede resolver incidencias');
  }

  const actual = await repositorio.incidenciaPorId(id);
  exigirVisibilidad(actual, usuario);
  if (actual.estado === 'resuelta') {
    throw AppError.conflicto('La incidencia ya está resuelta');
  }

  const v = recolector();
  const texto = v.texto(solucion, 'solucion', {
    requerido: true,
    max: LIMITES_TEXTO.solucion
  });
  v.terminar();

  const { evidencia: evidenciaNormalizada } = validarEntrada(
    { evidencia: evidenciaSolucion || [] },
    { parcial: true }
  );

  const ahora = ahoraIso();
  const actualizada = {
    ...actual,
    estado: 'resuelta',
    actualizado: ahora,
    fechaResolucion: ahora,
    solucion: texto,
    evidenciaSolucion: evidenciaNormalizada || [],
    historial: agregarHistorial(actual, {
      estado: 'resuelta',
      accion: 'Incidencia resuelta: ' + texto,
      por: usuario.nombre,
      ahora
    })
  };

  await repositorio.actualizarIncidencia(id, actualizada);
  await notificar(
    repositorio,
    actualizada,
    'resuelta',
    '✅ Tu incidencia fue resuelta',
    `"${actualizada.titulo}" ha sido marcada como resuelta.`
  );

  return enriquecer(actualizada);
}

export async function eliminar(repositorio, usuario, id) {
  if (!esAdmin(usuario)) {
    throw AppError.prohibido('Solo un administrador puede eliminar incidencias');
  }
  const incidencia = await repositorio.incidenciaPorId(id);
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');

  await repositorio.eliminarIncidencia(id);
  return { eliminada: true, id };
}

export async function comentar(repositorio, usuario, id, texto) {
  if (esEmpleado(usuario) && !puedeOperar(usuario)) {
    throw AppError.prohibido('Tu cuenta es de solo lectura: no puede comentar');
  }

  const incidencia = await repositorio.incidenciaPorId(id);
  exigirVisibilidad(incidencia, usuario);

  // Un contenido oculto no admite comentarios nuevos: el autor ya lo ve con
  // aviso y el personal habla por el historial, no por la conversación.
  if (incidencia.oculta === true && !esEmpleado(usuario)) {
    throw AppError.prohibido('Esta publicación está oculta por moderación');
  }

  const v = recolector();
  const limpio = v.texto(texto, 'texto', {
    requerido: true,
    max: LIMITES_TEXTO.comentario
  });
  v.terminar();

  const actualizada = {
    ...incidencia,
    actualizado: ahoraIso(),
    comentarios: agregarComentario(incidencia, {
      autor: usuario.nombre,
      texto: limpio,
      userKey: usuario.userKey
    })
  };

  await repositorio.actualizarIncidencia(id, actualizada);

  // Avisar al autor del reporte (salvo que comente él mismo).
  const destinatario = destinatarioDeIncidencia(actualizada);
  if (destinatario && destinatario !== usuario.userKey) {
    await notificar(
      repositorio,
      actualizada,
      'comentario',
      '💬 Nuevo comentario',
      `"${actualizada.titulo}" recibió un comentario nuevo.`
    );
  }

  return enriquecer(actualizada);
}

/**
 * Marca (o desmarca) una incidencia como PELIGROSA.
 *
 * Es un juicio del personal del municipio, no del autor del reporte: sirve
 * para que el panel de administración destaque esos casos en grande, por
 * encima del resto del listado. El ciudadano que reportó recibe el aviso.
 */
export async function marcarPeligro(repositorio, usuario, id, { peligrosa = true, motivo = '' } = {}) {
  if (!puedeOperar(usuario)) {
    throw AppError.prohibido(
      'Solo el personal con permiso de escritura puede marcar incidencias como peligrosas'
    );
  }

  const actual = await repositorio.incidenciaPorId(id);
  exigirVisibilidad(actual, usuario);

  const activar = peligrosa !== false;
  if ((actual.peligrosa === true) === activar) {
    throw AppError.conflicto(
      activar
        ? 'La incidencia ya está marcada como peligrosa'
        : 'La incidencia no está marcada como peligrosa'
    );
  }

  const v = recolector();
  const razon = v.texto(motivo, 'motivo', { max: LIMITES_TEXTO.motivoPeligro });
  v.terminar();

  const ahora = ahoraIso();
  const actualizada = {
    ...actual,
    actualizado: ahora,
    peligrosa: activar,
    peligrosaPor: activar ? usuario.nombre : null,
    peligrosaFecha: activar ? ahora : null,
    peligrosaMotivo: activar ? razon || '' : '',
    historial: agregarHistorial(actual, {
      estado: actual.estado,
      accion: activar
        ? `Marcada como peligrosa${razon ? ': ' + razon : ''}`
        : 'Se retiró la marca de peligro',
      por: usuario.nombre,
      ahora
    })
  };

  await repositorio.actualizarIncidencia(id, actualizada);

  const destinatario = destinatarioDeIncidencia(actualizada);
  if (destinatario && destinatario !== usuario.userKey) {
    await notificar(
      repositorio,
      actualizada,
      activar ? 'alerta' : 'estado',
      activar ? '⚠️ Tu reporte se marcó como peligroso' : 'Tu reporte ya no está marcado como peligroso',
      activar
        ? `"${actualizada.titulo}" fue señalado como peligroso por el personal del municipio.`
        : `"${actualizada.titulo}" dejó de estar señalado como peligroso.`
    );
  }

  return enriquecer(actualizada);
}

/** Crea la notificación dirigida al autor del reporte y la empuja por SSE. */
async function notificar(repositorio, incidencia, tipo, titulo, mensaje) {
  const destinatario = destinatarioDeIncidencia(incidencia);
  if (!destinatario) return;

  const eventoPorTipo = {
    reporte: 'incidencia_creada',
    resuelta: 'incidencia_resuelta',
    comentario: 'incidencia_comentario',
    alerta: 'incidencia_peligro',
    estado: 'incidencia_estado'
  };
  const evento = eventoPorTipo[tipo] || 'incidencia_estado';

  await emitir(repositorio, {
    evento,
    tipo,
    titulo,
    mensaje,
    severidad: tipo === 'alerta' ? 'alerta' : tipo === 'resuelta' ? 'exito' : 'info',
    incidenciaId: incidencia.id,
    entidadTipo: 'incidencia',
    entidadId: incidencia.id,
    municipioId: incidencia.municipioId || null,
    url: `/?incidencia=${incidencia.id}`,
    paraUsuarios: [destinatario],
    claveDedupe: `${evento}:${incidencia.id}:${incidencia.actualizado || incidencia.fecha}`
  });
}

/** Borra todas las incidencias y notificaciones (paridad con `limpiarTodo`). */
export async function limpiar(repositorio, usuario) {
  if (!esAdmin(usuario)) {
    throw AppError.prohibido('Solo un administrador puede restablecer los datos');
  }
  const incidencias = await repositorio.borrarIncidencias();
  const notificaciones = await repositorio.borrarNotificaciones();
  return { incidencias, notificaciones };
}

/**
 * Envolvente geográfica del mapa.
 * Acepta el formato de Leaflet `toBBoxString()`: oeste,sur,este,norte.
 */
function parsearBbox(valor) {
  if (!valor) return null;
  const partes = String(valor)
    .split(',')
    .map((n) => Number(n));
  if (partes.length !== 4 || partes.some((n) => !Number.isFinite(n))) return null;
  const [a, b, c, d] = partes;
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
}

/** Agrupa puntos en celdas para no pintar miles de marcadores al alejar. */
function agruparPuntos(puntos, bbox, celdas = 48) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const pasoLat = Math.max((maxLat - minLat) / celdas, 0.0005);
  const pasoLng = Math.max((maxLng - minLng) / celdas, 0.0005);
  const grupos = new Map();

  for (const punto of puntos) {
    const fila = Math.floor((punto.lat - minLat) / pasoLat);
    const columna = Math.floor((punto.lng - minLng) / pasoLng);
    const clave = `${fila}:${columna}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(punto);
  }

  const salida = [];
  for (const grupo of grupos.values()) {
    if (grupo.length === 1) {
      salida.push({ ...grupo[0], cluster: false });
      continue;
    }
    const lat = grupo.reduce((suma, p) => suma + p.lat, 0) / grupo.length;
    const lng = grupo.reduce((suma, p) => suma + p.lng, 0) / grupo.length;
    const porTipo = {};
    for (const punto of grupo) {
      porTipo[punto.tipoId] = (porTipo[punto.tipoId] || 0) + 1;
    }
    salida.push({
      cluster: true,
      lat,
      lng,
      total: grupo.length,
      porTipo,
      peligrosa: grupo.some((p) => p.peligrosa === true),
      ids: grupo.map((p) => p.id)
    });
  }
  return salida;
}

/**
 * Datos para pintar el mapa.
 *
 * Devuelve solo lo necesario (sin evidencias, historial ni comentarios) y, si
 * se pide `cluster`, agrupa por celdas dentro de la envolvente visible. El
 * detalle completo se carga al abrir una incidencia.
 */
export async function mapa(repositorio, usuario, filtros = {}) {
  const { color, orden, cluster = false, celdas = 48, limite = 3000, bbox } = filtros;
  const ocultas = filtroOcultas(usuario);

  const consulta = filtrosDeAlcance(usuario, {
    municipioId: filtros.municipioId || null,
    estadoEntidad: filtros.estadoEntidad || null,
    texto: filtros.texto || '',
    estado: filtros.estado || 'todos',
    tipoId: filtros.tipoId || 'todos',
    zonaId: filtros.zonaId || 'todos',
    ambito: filtros.ambito || 'todos',
    desde: filtros.desde || null,
    hasta: filtros.hasta || null,
    ocultas,
    ocultasDe: ocultas === 'propias' ? usuario.userKey : null
  });

  const caja = parsearBbox(bbox);
  const puntos = await repositorio.puntosIncidencias({ ...consulta, bbox: caja, limite });

  let lista = enriquecerLista(puntos);
  lista = filtrarPorColor(lista, color);
  if (orden === 'prioridad') lista = ordenarPorPrioridad(lista);

  if (cluster && caja) {
    return {
      total: lista.length,
      cluster: true,
      puntos: agruparPuntos(lista, caja, Math.min(Number(celdas) || 48, 120))
    };
  }

  return { total: lista.length, cluster: false, puntos: lista };
}

export { ESTADOS };
