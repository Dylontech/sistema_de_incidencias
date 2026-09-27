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
  esAutorDe,
  filtroOcultas,
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
    puedeCambiarEstado: esEmpleado(usuario) && !resuelta,
    puedeResolver: esEmpleado(usuario) && !resuelta,
    puedeMarcarPeligro: esEmpleado(usuario),
    puedeEliminar: esAdmin(usuario),
    puedeComentar: true,
    // Moderación: cualquiera con sesión puede denunciar lo que no es suyo, y el
    // personal puede retirar contenido y sancionar a su autor.
    puedeDenunciar: Boolean(usuario) && !esAutorDe(incidencia, usuario),
    puedeModerar: esEmpleado(usuario),
    puedeOcultar: esEmpleado(usuario),
    puedeSancionarAutor: esEmpleado(usuario) && puedeSancionarAutor,
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
    texto: resto.texto || '',
    estado: resto.estado || 'todos',
    tipoId: resto.tipoId || 'todos',
    zonaId: resto.zonaId || 'todos',
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

  // El acuse de recibo solo tiene destinatario si hay cuenta: el anónimo no
  // recibe notificaciones (por eso el registro sirve para tener seguimiento).
  const destinatario = destinatarioDeIncidencia(incidencia);
  if (destinatario) {
    await repositorio.crearNotificacion(
      construirNotificacion({
        tipo: 'reporte',
        titulo: '✅ Reporte enviado',
        mensaje: `Tu reporte "${incidencia.titulo}" fue registrado correctamente.`,
        incidenciaId: incidencia.id,
        paraUsuario: destinatario
      })
    );
  }

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
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido(
      'Solo funcionarios y administradores pueden marcar incidencias como peligrosas'
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
