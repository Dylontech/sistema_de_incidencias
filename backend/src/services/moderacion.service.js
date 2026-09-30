/**
 * SERVICIO: Moderación.
 *
 * Cubre las dos caras de la moderación:
 *
 *  - la **denuncia**: cualquier sesión (incluida la anónima) avisa de un
 *    reporte o de un comentario que le parece inapropiado. La denuncia no
 *    cambia nada por sí sola: abre un expediente.
 *  - la **decisión del personal**: ocultar o restaurar contenido, descartar la
 *    denuncia, advertir al autor o suspender su cuenta. Todo queda en el
 *    historial del reporte y, cuando hay cuenta, avisado por notificación.
 *
 * Reglas de fondo (acordadas con el producto):
 *  - Un contenido oculto lo siguen viendo el personal y su autor, con aviso.
 *  - Tres advertencias suspenden la cuenta sola; al reactivarla el contador
 *    vuelve a 0.
 *  - La jerarquía de sanciones vive en `alcance.service.puedeSancionarA`.
 */
import { ADVERTENCIAS_MAX, LIMITES_TEXTO } from '../config/constantes.js';
import { AppError } from '../utils/AppError.js';
import { ahoraIso } from '../utils/fechas.js';
import { borrarEvidenciaDeIncidencia } from './uploads.service.js';
import { recolector } from '../utils/validacion.js';
import {
  construirDenuncia,
  esContenidoPropio,
  resolverDenuncia as cerrarDenuncia,
  validarDenuncia
} from '../models/denuncia.model.js';
import { agregarHistorial } from '../models/incidencia.model.js';
import { construirNotificacion } from '../models/notificacion.model.js';
import { estaSuspendido, limpiarSancion, publico } from '../models/usuario.model.js';
import {
  esAdmin,
  esEmpleado,
  exigirVisibilidad,
  filtrosDeAlcance,
  puedeSancionarA
} from './alcance.service.js';
import { enriquecer } from './estado.service.js';

/* ------------------------------------------------------------------ ayudas */

function exigirEmpleado(usuario, mensaje) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido(mensaje || 'Solo funcionarios y administradores pueden moderar');
  }
}

/** ¿Es una sesión sin cuenta (no se le pueden dirigir avisos)? */
function esSesionAnonima(userKey) {
  return !userKey || String(userKey).startsWith('anon_');
}

/** Envía una notificación a una cuenta (las sesiones anónimas no tienen buzón). */
async function avisar(repositorio, paraUsuario, { tipo = 'alerta', titulo, mensaje, incidenciaId = null }) {
  if (esSesionAnonima(paraUsuario)) return null;
  const notificacion = construirNotificacion({ tipo, titulo, mensaje, incidenciaId, paraUsuario });
  await repositorio.crearNotificacion(notificacion);
  return notificacion;
}

/** Texto libre opcional con un tope (motivo de moderación). */
function leerMotivo(valor, campo = 'motivo') {
  const v = recolector();
  const texto = v.texto(valor, campo, { max: LIMITES_TEXTO.motivoModeracion });
  v.terminar();
  return texto;
}

/** Comprueba que un recurso de otro municipio no se cuele al funcionario. */
function exigirAlcance(municipioId, usuario) {
  const { municipioId: efectivo } = filtrosDeAlcance(usuario, {});
  if (efectivo && municipioId && municipioId !== efectivo) {
    throw AppError.prohibido('Ese contenido pertenece a otro municipio');
  }
}

/** La cuenta del autor de un contenido (o `null` si era una sesión anónima). */
async function cuentaDeContenido(repositorio, contenido) {
  if (!contenido?.autor) return null;
  return repositorio.usuarioPorUsername(contenido.autor);
}

/* --------------------------------------------------------------- denuncias */

/**
 * Registra una denuncia sobre un reporte o sobre uno de sus comentarios.
 * Se admite más de una denuncia de la misma sesión (se agrupan y se cuentan en
 * la cola), pero no se puede denunciar el contenido propio.
 */
export async function denunciar(repositorio, usuario, incidenciaId, datos = {}) {
  const incidencia = await repositorio.incidenciaPorId(incidenciaId);
  exigirVisibilidad(incidencia, usuario);

  const entrada = validarDenuncia({
    motivo: datos.motivo,
    detalle: datos.detalle,
    objetivo: datos.comentarioId ? 'comentario' : 'incidencia',
    comentarioId: datos.comentarioId
  });

  let comentario = null;
  if (entrada.objetivo === 'comentario') {
    comentario = (incidencia.comentarios || []).find((c) => c.id === entrada.comentarioId) || null;
    if (!comentario) throw AppError.noEncontrado('Comentario no encontrado');
    if (esContenidoPropio(comentario, usuario)) {
      throw AppError.solicitudInvalida('No puedes denunciar tu propio comentario');
    }
  } else if (esContenidoPropio(incidencia, usuario)) {
    throw AppError.solicitudInvalida('No puedes denunciar tu propio reporte');
  }

  const denuncia = construirDenuncia({ entrada, incidencia, comentario, usuario });
  await repositorio.crearDenuncia(denuncia);

  // Acuse de recibo: solo tiene destinatario si el denunciante tiene cuenta.
  await avisar(repositorio, usuario.userKey, {
    tipo: 'reporte',
    titulo: '🚩 Denuncia registrada',
    mensaje: `Recibimos tu aviso sobre "${denuncia.objetivoTitulo}". El personal del municipio lo revisará.`,
    incidenciaId: incidencia.id
  });

  return denuncia;
}

/** Texto del aviso que recibe quien denunció, según cómo se resolvió. */
function mensajeResolucion(accion) {
  switch (accion) {
    case 'ocultar':
      return {
        titulo: '🛡️ Tu denuncia fue atendida',
        mensaje: 'Retiramos de la vista pública el contenido que denunciaste. Gracias por avisar.'
      };
    case 'eliminar':
      return {
        titulo: '🛡️ Tu denuncia fue atendida',
        mensaje: 'Eliminamos el contenido que denunciaste. Gracias por avisar.'
      };
    case 'advertir':
      return {
        titulo: '🛡️ Tu denuncia fue atendida',
        mensaje: 'El autor del contenido que denunciaste recibió una advertencia. Gracias por avisar.'
      };
    case 'suspender':
      return {
        titulo: '🛡️ Tu denuncia fue atendida',
        mensaje: 'La cuenta del autor del contenido que denunciaste quedó suspendida. Gracias por avisar.'
      };
    default:
      return {
        titulo: 'Tu denuncia fue revisada',
        mensaje: 'Revisamos el contenido y no encontramos motivos para moderarlo.'
      };
  }
}
function agrupar(denuncias) {
  const grupos = new Map();
  for (const denuncia of denuncias) {
    const clave = denuncia.comentarioId || denuncia.incidenciaId;
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        clave,
        objetivo: denuncia.objetivo,
        incidenciaId: denuncia.incidenciaId,
        comentarioId: denuncia.comentarioId,
        municipioId: denuncia.municipioId,
        objetivoTitulo: denuncia.objetivoTitulo,
        objetivoResumen: denuncia.objetivoResumen,
        objetivoAutor: denuncia.objetivoAutor,
        total: 0,
        motivos: [],
        denuncias: [],
        ultimaFecha: denuncia.fecha
      });
    }
    const grupo = grupos.get(clave);
    grupo.total++;
    grupo.denuncias.push(denuncia);
    if (!grupo.motivos.includes(denuncia.motivo)) grupo.motivos.push(denuncia.motivo);
    if (new Date(denuncia.fecha) > new Date(grupo.ultimaFecha)) grupo.ultimaFecha = denuncia.fecha;
  }
  return [...grupos.values()];
}

/**
 * Cola de moderación: denuncias agrupadas por contenido, del municipio del
 * moderador (un funcionario solo ve el suyo; el admin, todos).
 *
 * Cada grupo se acompaña del estado actual del contenido denunciado (si sigue
 * existiendo, si ya está oculto y en qué estado está).
 */
export async function listarDenuncias(repositorio, usuario, filtros = {}) {
  exigirEmpleado(usuario, 'Solo funcionarios y administradores pueden ver la cola de moderación');

  const estado = filtros.estado || 'pendiente';
  const { municipioId } = filtrosDeAlcance(usuario, { municipioId: filtros.municipioId || null });
  const denuncias = await repositorio.denunciasDe({ estado, municipioId, orden: 'reciente' });
  const grupos = agrupar(denuncias);

  // Estado actual del contenido: lo consulta el panel para saber si aún se
  // puede ocultar o si ya se borró.
  const incidencias = await repositorio.buscarIncidencias({
    municipioId,
    ocultas: 'incluir'
  });
  const porId = new Map(incidencias.map((i) => [i.id, i]));
  for (const grupo of grupos) {
    const incidencia = porId.get(grupo.incidenciaId) || null;
    const comentario = grupo.comentarioId
      ? (incidencia?.comentarios || []).find((c) => c.id === grupo.comentarioId) || null
      : null;
    grupo.objetivo_estado = {
      existe: Boolean(incidencia) && (grupo.comentarioId ? Boolean(comentario) : true),
      oculto: grupo.comentarioId ? comentario?.oculto === true : incidencia?.oculta === true,
      eliminada: !incidencia,
      estado: incidencia?.estado || null,
      peligrosa: incidencia?.peligrosa === true
    };
  }

  return { denuncias, grupos };
}

/** Contadores que resume la pestaña de moderación. */
export async function resumen(repositorio, usuario, municipioId = null) {
  exigirEmpleado(usuario, 'Solo funcionarios y administradores pueden ver el resumen de moderación');

  const { municipioId: efectivo } = filtrosDeAlcance(usuario, { municipioId });
  const pendientes = await repositorio.denunciasDe({ estado: 'pendiente', municipioId: efectivo });
  const incidencias = await repositorio.buscarIncidencias({ municipioId: efectivo, ocultas: 'incluir' });
  const usuarios = await repositorio.todosLosUsuarios();

  return {
    pendientes: pendientes.length,
    ocultas: incidencias.filter((i) => i.oculta === true).length,
    suspendidas: usuarios.filter((u) => u.suspendido === true).length,
    advertidas: usuarios.filter((u) => (u.advertencias || 0) > 0).length,
    denunciasAtendidas: (await repositorio.denunciasDe({ estado: 'atendida', municipioId: efectivo })).length
  };
}

/**
 * Cierra una denuncia aplicando la decisión del moderador.
 *
 * Es el único punto donde se decide: la acción llega del panel (`descartar`,
 * `ocultar`, `eliminar`, `advertir` o `suspender`) y aquí se aplica **y** se
 * cierra el expediente. Si el contenido acumulaba varias denuncias, se cierran
 * todas las pendientes del mismo contenido con la misma decisión: al vecindario
 * le llega el mismo desenlace y al moderador no le quedan duplicados en cola.
 */
export async function resolver(repositorio, usuario, denunciaId, datos = {}) {
  exigirEmpleado(usuario, 'Solo funcionarios y administradores pueden moderar denuncias');

  const denuncia = await repositorio.denunciaPorId(denunciaId);
  if (!denuncia) throw AppError.noEncontrado('Denuncia no encontrada');
  exigirAlcance(denuncia.municipioId, usuario);
  if (denuncia.estado !== 'pendiente') {
    throw AppError.conflicto('Esa denuncia ya está cerrada');
  }

  const accion = datos.accion || 'descartar';
  const motivo = leerMotivo(datos.motivo);
  const resolucion = datos.resolucion || motivo;

  const incidencia = await repositorio.incidenciaPorId(denuncia.incidenciaId);
  let resultado = { accion, aviso: '' };

  // Las acciones que ocultan cierran el expediente por su cuenta; aquí se
  // desactiva para que el cierre y los avisos ocurran una sola vez, al final.
  const sinCierre = { cerrarDenuncias: false };

  switch (accion) {
    case 'ocultar': {
      if (!incidencia) throw AppError.conflicto('El contenido denunciado ya no existe');
      if (denuncia.comentarioId) {
        resultado = await ocultarComentario(repositorio, usuario, incidencia.id, denuncia.comentarioId, {
          oculto: true,
          motivo,
          ...sinCierre
        });
      } else {
        resultado = await ocultarIncidencia(repositorio, usuario, incidencia.id, {
          oculta: true,
          motivo,
          ...sinCierre
        });
      }
      break;
    }
    case 'eliminar': {
      // Borrar de verdad es cosa de un administrador (regla ya existente).
      if (!esAdmin(usuario)) {
        throw AppError.prohibido('Solo un administrador puede eliminar contenido');
      }
      if (!incidencia) throw AppError.conflicto('El contenido denunciado ya no existe');
      await repositorio.eliminarIncidencia(incidencia.id);
      // Igual que al eliminar desde el panel: la evidencia en disco se va con él.
      await borrarEvidenciaDeIncidencia(incidencia);
      resultado = { eliminada: true, id: incidencia.id };
      break;
    }
    case 'advertir': {
      if (!incidencia) throw AppError.conflicto('El reporte denunciado ya no existe');
      resultado = await advertirAutor(repositorio, usuario, incidencia, {
        motivo: motivo || `Contenido denunciado (${denuncia.motivo})`
      });
      break;
    }
    case 'suspender': {
      if (!incidencia) throw AppError.conflicto('El reporte denunciado ya no existe');
      const cuenta = await cuentaDeContenido(repositorio, incidencia);
      if (!cuenta) {
        throw AppError.solicitudInvalida(
          'El autor no tiene una cuenta registrada; oculta o elimina el contenido'
        );
      }
      resultado = await suspenderCuenta(repositorio, usuario, cuenta.username, {
        motivo: motivo || `Contenido denunciado (${denuncia.motivo})`,
        hasta: datos.hasta || null
      });
      break;
    }
    case 'descartar':
    default:
      resultado = { accion: 'descartar', aviso: 'Descartada' };
      break;
  }

  // Cierra todas las denuncias pendientes de ese contenido y avisa a quien las
  // presentó (la propia y las que se acumularon en el mismo objetivo).
  const cerradas = await cerrarDenunciasDe(
    repositorio,
    usuario,
    denuncia.incidenciaId,
    denuncia.comentarioId,
    resolucion,
    accion
  );

  return {
    denuncia: await repositorio.denunciaPorId(denuncia.id),
    cerradas,
    resultado
  };
}

/** Denuncias presentadas por una sesión (para el propio denunciante). */
export async function misDenuncias(repositorio, usuario, filtros = {}) {
  if (!usuario || usuario.rol === 'anonimo') return { denuncias: [] };
  const denuncias = await repositorio.denunciasDe({ autorUserKey: usuario.userKey, orden: 'reciente' });
  return { denuncias: denuncias.slice(0, filtros.limite || 50) };
}

/* ------------------------------------------------------- ocultar contenido */

/**
 * Aplica el ocultamiento a un reporte: lo retira del listado público, deja
 * constancia en el historial y avisa a su autor (que lo sigue viendo con la
 * marca). Volver a mostrarlo es la misma operación con `oculta: false`.
 */
async function aplicarOcultamiento(repositorio, incidencia, { oculta, motivo, por, silencioso = false }) {
  const ahora = ahoraIso();
  const actualizada = {
    ...incidencia,
    actualizado: ahora,
    oculta,
    ocultaPor: oculta ? por : null,
    ocultaFecha: oculta ? ahora : null,
    ocultaMotivo: oculta ? motivo || '' : '',
    historial: agregarHistorial(incidencia, {
      estado: incidencia.estado,
      accion: oculta
        ? `Ocultada por moderación${motivo ? ': ' + motivo : ''}`
        : 'Vuelta a mostrar por moderación',
      por,
      ahora
    })
  };

  await repositorio.actualizarIncidencia(incidencia.id, actualizada);

  if (!silencioso) {
    await avisar(repositorio, incidencia.userKey, {
      tipo: oculta ? 'alerta' : 'estado',
      titulo: oculta ? '🚫 Tu publicación fue ocultada' : '✅ Tu publicación vuelve a ser visible',
      mensaje: oculta
        ? `"${incidencia.titulo}" fue retirada de la vista pública por moderación.${motivo ? ' Motivo: ' + motivo + '.' : ''}`
        : `"${incidencia.titulo}" vuelve a ser visible para todo el municipio.`,
      incidenciaId: incidencia.id
    });
  }

  return enriquecer(actualizada);
}

/** Oculta (o vuelve a mostrar) un reporte. Solo personal. */
export async function ocultarIncidencia(
  repositorio,
  usuario,
  id,
  { oculta = true, motivo = '', cerrarDenuncias = true } = {}
) {
  exigirEmpleado(usuario, 'Solo funcionarios y administradores pueden ocultar publicaciones');

  const incidencia = await repositorio.incidenciaPorId(id);
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  exigirAlcance(incidencia.municipioId, usuario);

  const activar = oculta !== false;
  if ((incidencia.oculta === true) === activar) {
    throw AppError.conflicto(
      activar ? 'La publicación ya está oculta' : 'La publicación ya está visible'
    );
  }

  const razon = activar ? leerMotivo(motivo) : '';
  const resultado = await aplicarOcultamiento(repositorio, incidencia, {
    oculta: activar,
    motivo: razon,
    por: usuario.nombre
  });

  // Si se ocultó por una denuncia en cola, el expediente se cierra solo.
  if (activar && cerrarDenuncias) {
    await cerrarDenunciasDe(repositorio, usuario, incidencia.id, null, razon, 'ocultar');
  }

  return { incidencia: resultado };
}

/**
 * Oculta (o vuelve a mostrar) un comentario.
 * El comentario oculto sigue ocupando su sitio: se pinta el texto sustituido
 * para quien no pueda verlo, así la conversación no se descoloca.
 */
export async function ocultarComentario(
  repositorio,
  usuario,
  incidenciaId,
  comentarioId,
  { oculto = true, motivo = '', cerrarDenuncias = true } = {}
) {
  exigirEmpleado(usuario, 'Solo funcionarios y administradores pueden ocultar comentarios');

  const incidencia = await repositorio.incidenciaPorId(incidenciaId);
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  exigirAlcance(incidencia.municipioId, usuario);

  const comentario = (incidencia.comentarios || []).find((c) => c.id === comentarioId);
  if (!comentario) throw AppError.noEncontrado('Comentario no encontrado');

  const activar = oculto !== false;
  if (comentario.oculto === activar) {
    throw AppError.conflicto(
      activar ? 'El comentario ya está oculto' : 'El comentario ya está visible'
    );
  }

  const razon = activar ? leerMotivo(motivo) : '';
  const ahora = ahoraIso();
  const actualizada = {
    ...incidencia,
    actualizado: ahora,
    comentarios: incidencia.comentarios.map((c) =>
      c.id === comentarioId
        ? {
            ...c,
            oculto: activar,
            ocultoPor: activar ? usuario.nombre : null,
            ocultoFecha: activar ? ahora : null,
            ocultoMotivo: activar ? razon : ''
          }
        : c
    ),
    historial: agregarHistorial(incidencia, {
      estado: incidencia.estado,
      accion: activar
        ? `Comentario oculto por moderación${razon ? ': ' + razon : ''}`
        : 'Comentario vuelto a mostrar por moderación',
      por: usuario.nombre,
      ahora
    })
  };

  await repositorio.actualizarIncidencia(incidenciaId, actualizada);

  await avisar(repositorio, comentario.userKey, {
    tipo: activar ? 'alerta' : 'estado',
    titulo: activar ? '🚫 Tu comentario fue ocultado' : '✅ Tu comentario vuelve a ser visible',
    mensaje: activar
      ? `Un comentario tuyo en "${incidencia.titulo}" fue retirado por moderación.${razon ? ' Motivo: ' + razon + '.' : ''}`
      : `Tu comentario en "${incidencia.titulo}" vuelve a ser visible.`,
    incidenciaId
  });

  if (activar && cerrarDenuncias) {
    await cerrarDenunciasDe(repositorio, usuario, incidenciaId, comentarioId, razon, 'ocultar');
  }

  return { incidencia: enriquecer(actualizada) };
}

/**
 * Cierra las denuncias pendientes de un contenido y avisa a quien las presentó.
 * Solo avisa de las que realmente se cierran aquí: así ninguna resolución se
 * queda sin respuesta y ninguna recibe dos avisos.
 */
async function cerrarDenunciasDe(repositorio, usuario, incidenciaId, comentarioId, motivo, accion = 'ocultar') {
  const objetivo = comentarioId || null;
  const pendientes = (await repositorio.denunciasDe({
    incidenciaId,
    estado: 'pendiente'
  })).filter((d) => (d.comentarioId || null) === objetivo);
  if (!pendientes.length) return 0;

  const ahora = ahoraIso();
  const aviso = mensajeResolucion(accion);
  for (const pendiente of pendientes) {
    await repositorio.actualizarDenuncia(
      pendiente.id,
      cerrarDenuncia(pendiente, {
        accion,
        resolucion: motivo || 'Contenido moderado',
        moderador: usuario,
        ahora
      })
    );
    await avisar(repositorio, pendiente.autorUserKey, {
      tipo: 'estado',
      titulo: aviso.titulo,
      mensaje: `${aviso.mensaje} ("${pendiente.objetivoTitulo}")`,
      incidenciaId
    });
  }
  return pendientes.length;
}

/* ------------------------------------------------------ sanciones de cuenta */

/** ¿Se puede sancionar a esa cuenta? Lo comprueban siempre los servicios. */
function verificarSancionable(actor, cuenta) {
  if (!cuenta) throw AppError.noEncontrado('Cuenta no encontrada');
  if (!cuenta.username) throw AppError.solicitudInvalida('Esa cuenta no se puede sancionar');
  if (cuenta.username === actor.username) {
    throw AppError.prohibido('No puedes sancionar tu propia cuenta');
  }
  if (!puedeSancionarA(actor, cuenta)) {
    throw AppError.prohibido(`No puedes sancionar a una cuenta con rol ${cuenta.rol}`);
  }
}

/**
 * Advertir al autor: suma una advertencia y, al llegar al máximo, suspende la
 * cuenta sola (`ADVERTENCIAS_MAX`). Todo queda en el historial del reporte.
 */
export async function advertirAutor(repositorio, usuario, incidencia, { motivo = '' } = {}) {
  exigirEmpleado(usuario, 'Solo funcionarios y administradores pueden advertir');

  const cuenta = await cuentaDeContenido(repositorio, incidencia);
  if (!cuenta) {
    throw AppError.solicitudInvalida(
      'El autor no tiene una cuenta registrada: solo puedes ocultar o eliminar el contenido'
    );
  }
  verificarSancionable(usuario, cuenta);
  exigirAlcance(incidencia.municipioId, usuario);

  const razon = leerMotivo(motivo) || 'Contenido inapropiado';
  const advertencias = (cuenta.advertencias || 0) + 1;
  const suspendidaAhora = advertencias >= ADVERTENCIAS_MAX;

  const cambios = { advertencias };
  if (suspendidaAhora) {
    Object.assign(cambios, {
      suspendido: true,
      suspendidoHasta: null,
      suspendidoMotivo: `Acumuló ${advertencias} advertencias. Última: ${razon}`,
      suspendidoPor: usuario.nombre
    });
  }

  const actualizada = await repositorio.actualizarUsuario(cuenta.id, cambios);

  await avisar(repositorio, cuenta.username, {
    tipo: 'alerta',
    titulo: suspendidaAhora
      ? '🚫 Tu cuenta fue suspendida'
      : `⚠️ Advertencia (${advertencias}/${ADVERTENCIAS_MAX})`,
    mensaje: suspendidaAhora
      ? `Tu cuenta quedó suspendida por acumular ${advertencias} advertencias. Última: ${razon}.`
      : `Recibiste una advertencia por "${incidencia.titulo}". Motivo: ${razon}.`,
    incidenciaId: incidencia.id
  });

  // El historial del reporte es público: deja constancia de la advertencia.
  await repositorio.actualizarIncidencia(incidencia.id, {
    ...incidencia,
    actualizado: ahoraIso(),
    historial: agregarHistorial(incidencia, {
      estado: incidencia.estado,
      accion: suspendidaAhora
        ? `Autor suspendido tras ${advertencias} advertencias: ${razon}`
        : `Autor advertido (${advertencias}/${ADVERTENCIAS_MAX}): ${razon}`,
      por: usuario.nombre
    })
  });

  if (suspendidaAhora) {
    await ocultarContenidoDe(repositorio, usuario, cuenta.username);
  }

  return {
    cuenta: publico(actualizada),
    advertencias,
    suspendida: suspendidaAhora,
    aviso: suspendidaAhora
      ? `La cuenta llegó a ${advertencias} advertencias y quedó suspendida`
      : `Advertencia ${advertencias} de ${ADVERTENCIAS_MAX}`
  };
}

/**
 * Advertir al autor de un reporte sin denuncia de por medio (botón del detalle).
 * Carga el reporte y delega en `advertirAutor`, que aplica la jerarquía.
 */
export async function advertirDesdeIncidencia(repositorio, usuario, incidenciaId, datos = {}) {
  const incidencia = await repositorio.incidenciaPorId(incidenciaId);
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  return advertirAutor(repositorio, usuario, incidencia, datos);
}

/** Oculta las publicaciones no resueltas de una cuenta sancionada. */
async function ocultarContenidoDe(repositorio, usuario, username) {
  const suyas = await repositorio.buscarIncidencias({ userKey: username, ocultas: 'incluir' });
  let ocultas = 0;
  for (const incidencia of suyas) {
    // Las resueltas se conservan: son la constancia del trabajo del municipio.
    if (incidencia.oculta === true || incidencia.estado === 'resuelta') continue;
    await aplicarOcultamiento(repositorio, incidencia, {
      oculta: true,
      motivo: 'Suspensión de la cuenta del autor',
      por: usuario.nombre,
      silencioso: true
    });
    ocultas++;
  }
  return ocultas;
}

/**
 * Suspende una cuenta: no puede entrar, ni publicar, ni comentar.
 * `hasta` vacío = indefinida hasta que un moderador la reactive.
 */
export async function suspenderCuenta(repositorio, usuario, username, { motivo = '', hasta = null } = {}) {
  exigirEmpleado(usuario, 'Solo funcionarios y administradores pueden suspender cuentas');

  const cuenta = await repositorio.usuarioPorUsername(username);
  verificarSancionable(usuario, cuenta);
  if (estaSuspendido(cuenta)) throw AppError.conflicto('Esa cuenta ya está suspendida');

  const razon = leerMotivo(motivo) || 'Incumplimiento de las normas de convivencia';
  let fecha = null;
  if (hasta) {
    fecha = new Date(hasta);
    if (Number.isNaN(fecha.getTime())) {
      throw AppError.solicitudInvalida('La fecha de fin de la suspensión no es válida');
    }
    if (fecha.getTime() <= Date.now()) {
      throw AppError.solicitudInvalida('La fecha de fin debe ser posterior a hoy');
    }
  }

  const actualizada = await repositorio.actualizarUsuario(cuenta.id, {
    suspendido: true,
    suspendidoHasta: fecha ? fecha.toISOString() : null,
    suspendidoMotivo: razon,
    suspendidoPor: usuario.nombre
  });

  await avisar(repositorio, cuenta.username, {
    tipo: 'alerta',
    titulo: '🚫 Tu cuenta fue suspendida',
    mensaje: fecha
      ? `No podrás entrar hasta el ${fecha.toISOString().slice(0, 10)}. Motivo: ${razon}.`
      : `No podrás entrar hasta que el municipio levante la suspensión. Motivo: ${razon}.`
  });

  const ocultas = await ocultarContenidoDe(repositorio, usuario, cuenta.username);

  return { cuenta: publico(actualizada), ocultas };
}

/** Reactiva una cuenta suspendida y deja su contador de advertencias a 0. */
export async function reactivarCuenta(repositorio, usuario, username) {
  exigirEmpleado(usuario, 'Solo funcionarios y administradores pueden reactivar cuentas');

  const cuenta = await repositorio.usuarioPorUsername(username);
  verificarSancionable(usuario, cuenta);
  if (!cuenta.suspendido) throw AppError.conflicto('Esa cuenta no está suspendida');

  const actualizada = await repositorio.actualizarUsuario(cuenta.id, limpiarSancion());

  await avisar(repositorio, cuenta.username, {
    tipo: 'estado',
    titulo: '✅ Tu cuenta fue reactivada',
    mensaje: 'Ya puedes volver a entrar, reportar y comentar.'
  });

  return { cuenta: publico(actualizada) };
}

/** Estado de una cuenta concreta (lo consulta el modal de sanción). */
export async function cuenta(repositorio, usuario, username) {
  exigirEmpleado(usuario, 'Solo funcionarios y administradores pueden consultar cuentas');

  const encontrada = await repositorio.usuarioPorUsername(username);
  if (!encontrada) throw AppError.noEncontrado('Cuenta no encontrada');

  const pendientes = await repositorio.denunciasDe({
    objetivoUserKey: encontrada.username,
    estado: 'pendiente'
  });
  const suyas = await repositorio.buscarIncidencias({ userKey: encontrada.username, ocultas: 'incluir' });

  return {
    cuenta: publico(encontrada),
    denunciasPendientes: pendientes.length,
    publicaciones: suyas.length,
    ocultas: suyas.filter((i) => i.oculta === true).length,
    puedeSancionar: encontrada.username !== usuario.username && puedeSancionarA(usuario, encontrada)
  };
}

/** Listado de cuentas advertidas o suspendidas que puede gestionar el usuario. */
export async function sanciones(repositorio, usuario) {
  exigirEmpleado(usuario, 'Solo funcionarios y administradores pueden ver las sanciones');

  const usuarios = await repositorio.todosLosUsuarios();
  return usuarios
    .filter((u) => puedeSancionarA(usuario, u))
    .filter((u) => u.suspendido === true || (u.advertencias || 0) > 0)
    .map((u) => ({
      ...publico(u),
      suspendidoAhora: estaSuspendido(u)
    }))
    .sort((a, b) => (b.advertencias || 0) - (a.advertencias || 0));
}
