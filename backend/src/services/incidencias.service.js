/**
 * SERVICIO: Incidencias — núcleo del negocio.
 *
 * Reúne lo que en el monolito estaba repartido entre Incidencias.guardar(),
 * confirmarResolver(), cambiarEstado(), eliminar() y agregarComentario(),
 * más las validaciones que antes solo existían en el navegador.
 */
import { LIMITES_TEXTO, ESTADOS } from '../config/constantes.js';
import { AppError } from '../utils/AppError.js';
import { ahoraIso } from '../utils/fechas.js';
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
import { construirNotificacion, destinatarioDeIncidencia } from '../models/notificacion.model.js';
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
  filtrosDeAlcance,
  municipioDeRegistro,
  exigirVisibilidad
} from './alcance.service.js';

/** Permisos que el frontend usa para decidir qué botones mostrar. */
export function permisosDe(incidencia, usuario) {
  const resuelta = incidencia.estado === 'resuelta';
  return {
    puedeEditar: puedeEditar(incidencia, usuario) && !resuelta,
    puedeCambiarEstado: esEmpleado(usuario) && !resuelta,
    puedeResolver: esEmpleado(usuario) && !resuelta,
    puedeEliminar: esAdmin(usuario),
    puedeComentar: true
  };
}

export async function listar(repositorio, usuario, filtros = {}) {
  const { color, orden, ...resto } = filtros;

  const consulta = filtrosDeAlcance(usuario, {
    municipioId: resto.municipioId || null,
    texto: resto.texto || '',
    estado: resto.estado || 'todos',
    tipoId: resto.tipoId || 'todos',
    zonaId: resto.zonaId || 'todos',
    orden: orden === 'antigua' ? 'antigua' : 'reciente'
  });

  const incidencias = await repositorio.buscarIncidencias(consulta);
  let lista = enriquecerLista(incidencias);
  lista = filtrarPorColor(lista, color);
  if (orden === 'prioridad') lista = ordenarPorPrioridad(lista);
  return lista;
}

export async function obtener(repositorio, usuario, id) {
  const incidencia = await repositorio.incidenciaPorId(id);
  exigirVisibilidad(incidencia, usuario);
  return { ...enriquecer(incidencia), permisos: permisosDe(incidencia, usuario) };
}

/** Zonas donde el usuario puede ubicar un reporte (las del municipio activo). */
async function zonasDisponibles(repositorio, municipioId) {
  return municipioId
    ? repositorio.zonasPorMunicipio(municipioId)
    : repositorio.todasLasZonas();
}

export async function crear(repositorio, usuario, datos) {
  const entrada = validarEntrada(datos);

  const tipo = await repositorio.tipoPorId(entrada.tipoId);
  if (!tipo) {
    throw AppError.solicitudInvalida('Selecciona un tipo de incidencia válido');
  }

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

  // Manda el límite municipal: es lo que la máscara del mapa deja elegir. La
  // comunidad (localidad del INEGI) se registra cuando el punto cae en una,
  // pero las localidades solo cubren las áreas pobladas, no todo el término
  // municipal, así que un reporte puede quedarse sin comunidad.
  if (municipio) {
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
    municipioId: municipioFinal
  });

  await repositorio.crearIncidencia(incidencia);

  await repositorio.crearNotificacion(
    construirNotificacion({
      tipo: 'reporte',
      titulo: '✅ Reporte enviado',
      mensaje: `Tu reporte "${incidencia.titulo}" fue registrado correctamente.`,
      incidenciaId: incidencia.id,
      paraUsuario: usuario.userKey
    })
  );

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
    if (!zona && municipio && !dentroDelMunicipio(entrada.lat, entrada.lng, municipio)) {
      throw AppError.solicitudInvalida('La ubicación está fuera del municipio');
    }
    if (!municipio && !zona) {
      throw AppError.solicitudInvalida(
        'La ubicación está fuera de las zonas autorizadas del municipio'
      );
    }
    entrada.zonaId = zona ? zona.id : null;
    entrada.zonaNombre = zona ? zona.nombre : null;
  }

  const editada = aplicarEdicion(actual, entrada);
  await repositorio.actualizarIncidencia(id, editada);
  return enriquecer(editada);
}

export async function cambiarEstado(repositorio, usuario, id, estado) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Solo funcionarios y administradores pueden cambiar el estado');
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
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Solo funcionarios y administradores pueden resolver incidencias');
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
  const incidencia = await repositorio.incidenciaPorId(id);
  exigirVisibilidad(incidencia, usuario);

  const v = recolector();
  const limpio = v.texto(texto, 'texto', {
    requerido: true,
    max: LIMITES_TEXTO.comentario
  });
  v.terminar();

  const actualizada = {
    ...incidencia,
    actualizado: ahoraIso(),
    comentarios: agregarComentario(incidencia, { autor: usuario.nombre, texto: limpio })
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

/** Crea la notificación dirigida al autor del reporte. */
async function notificar(repositorio, incidencia, tipo, titulo, mensaje) {
  await repositorio.crearNotificacion(
    construirNotificacion({
      tipo,
      titulo,
      mensaje,
      incidenciaId: incidencia.id,
      paraUsuario: destinatarioDeIncidencia(incidencia)
    })
  );
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

export { ESTADOS };
