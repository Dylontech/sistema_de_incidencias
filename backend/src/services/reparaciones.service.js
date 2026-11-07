/**
 * SERVICIO: reparaciones de campo.
 *
 * Una incidencia con reparación asignada pasa por:
 *   asignada → en_reparacion → terminada → validada.
 *
 * La cuadrilla solo ve y mueve sus reparaciones; el funcionario coordina,
 * asigna, valida y resuelve dentro de su ámbito. Los administradores pueden
 * hacer lo mismo en su territorio.
 */
import { AppError } from '../utils/AppError.js';
import { ahoraIso } from '../utils/fechas.js';
import { agregarHistorial } from '../models/incidencia.model.js';
import {
  alcanceDe,
  esAlgunaAdmin,
  esEmpleado,
  filtrosDeAlcance,
  puedeVerIncidencia
} from './alcance.service.js';
import { emitir } from './notificaciones.service.js';

export const ESTADOS_REPARACION = [
  'sin_asignar',
  'asignada',
  'en_reparacion',
  'terminada',
  'validada'
];

function tienePermiso(usuario, permiso) {
  return Boolean(usuario?.permisos?.includes(permiso));
}

function esCoordinador(usuario) {
  return esAlgunaAdmin(usuario) || usuario?.rol === 'funcionario' || tienePermiso(usuario, 'coordinar_reparaciones');
}

function exigirCoordinador(usuario, mensaje = 'Solo el coordinador puede gestionar esta reparación') {
  if (!esCoordinador(usuario)) throw AppError.prohibido(mensaje);
}

function esCuadrilla(usuario) {
  return usuario?.rol === 'cuadrilla';
}

function esAsignadaA(incidencia, usuario) {
  return Boolean(
    incidencia?.asignadaA &&
      (incidencia.asignadaA === usuario?.id ||
        incidencia.asignadaA === usuario?.username ||
        incidencia.asignadaNombre === usuario?.nombre)
  );
}

function texto(valor, campo, { requerido = false, max = 2000 } = {}) {
  const limpio = String(valor ?? '').trim();
  if (requerido && !limpio) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo, mensaje: 'Este campo es obligatorio' }
    ]);
  }
  if (limpio.length > max) {
    throw AppError.solicitudInvalida('Datos inválidos', [
      { campo, mensaje: `No puede exceder ${max} caracteres` }
    ]);
  }
  return limpio;
}

async function alcanceDeCuadrilla(repositorio, cuenta) {
  const asignado = (await repositorio.alcancesDeUsuarios([cuenta.id]))[cuenta.id] || {
    municipios: [],
    estados: []
  };
  return alcanceDe({
    rol: cuenta.rol,
    municipios: asignado.municipios || [],
    estados: asignado.estados || [],
    municipioId: cuenta.municipioId || null
  });
}

function cubreIncidencia(alcance, incidencia) {
  if (alcance.todos) return true;
  if (alcance.municipios?.has(String(incidencia.municipioId || ''))) return true;
  return Boolean(
    incidencia.estadoEntidad && alcance.estados?.has(String(incidencia.estadoEntidad))
  );
}

/** Lista las reparaciones visibles para la cuenta. */
export async function listar(repositorio, usuario, filtros = {}) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Solo el personal puede consultar reparaciones');
  }
  const alcanceFiltros = filtrosDeAlcance(usuario, {
    municipioId: filtros.municipioId,
    estadoEntidad: filtros.estadoEntidad,
    estados: filtros.estados
  });
  const criterios = {
    ...alcanceFiltros,
    texto: filtros.texto || undefined,
    estado: filtros.estado || undefined,
    tipoId: filtros.tipoId || undefined,
    orden: filtros.orden || 'reciente',
    ocultas: 'excluir',
    incluirSimulados: false
  };
  if (esCuadrilla(usuario)) criterios.asignadaA = usuario.id;
  if (filtros.reparacionEstado) criterios.reparacionEstado = filtros.reparacionEstado;

  const lista = await repositorio.buscarIncidencias(criterios);
  return lista
    .map((incidencia) => ({
      ...incidencia,
      reparacionEstado: incidencia.reparacionEstado || 'sin_asignar'
    }))
    .filter((incidencia) => {
      if (esCuadrilla(usuario)) return esAsignadaA(incidencia, usuario);
      return true;
    });
}

/** Cuadrillas activas que el coordinador puede asignar. */
export async function cuadrillasDisponibles(repositorio, usuario) {
  exigirCoordinador(usuario, 'Solo el coordinador puede consultar las cuadrillas');
  const cuentas = await repositorio.usuariosPorRoles(['cuadrilla']);
  if (!cuentas.length) return [];
  const alcances = await repositorio.alcancesDeUsuarios(cuentas.map((c) => c.id));
  const coordinador = alcanceDe(usuario);
  const municipios = coordinador.todos ? [] : await repositorio.municipiosLigeros();
  const estadoDe = new Map(municipios.map((m) => [String(m.id), m.estado]));

  return cuentas
    .filter((cuenta) => cuenta.activo !== false)
    .map((cuenta) => {
      const asignado = alcances[cuenta.id] || { municipios: [], estados: [] };
      return {
        id: cuenta.id,
        username: cuenta.username,
        nombre: cuenta.nombre,
        municipioId: cuenta.municipioId || null,
        municipios: asignado.municipios || [],
        estados: asignado.estados || []
      };
    })
    .filter((cuenta) => {
      if (coordinador.todos) return true;
      if (coordinador.municipios) {
        if (cuenta.municipioId && coordinador.municipios.has(String(cuenta.municipioId))) return true;
        return (cuenta.municipios || []).some((id) => coordinador.municipios.has(String(id)));
      }
      if (coordinador.estados) {
        if ((cuenta.estados || []).some((estado) => coordinador.estados.has(estado))) return true;
        return (cuenta.municipios || []).some((id) => coordinador.estados.has(estadoDe.get(String(id))));
      }
      return false;
    });
}

/** Asigna una incidencia a una cuadrilla. */
export async function asignar(repositorio, usuario, id, { cuadrillaId, notas = '' } = {}) {
  exigirCoordinador(usuario, 'Solo el coordinador puede asignar reparaciones');
  const incidencia = await repositorio.incidenciaPorId(id);
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  if (!puedeVerIncidencia(incidencia, usuario)) {
    throw AppError.prohibido('La incidencia está fuera de tu ámbito');
  }
  if (incidencia.reparacionEstado === 'validada') {
    throw AppError.conflicto('La reparación ya fue validada');
  }

  const objetivo = await repositorio.usuarioPorId(cuadrillaId);
  if (!objetivo || objetivo.rol !== 'cuadrilla' || objetivo.activo === false) {
    throw AppError.solicitudInvalida('Elige una cuadrilla activa');
  }
  const alcanceObjetivo = await alcanceDeCuadrilla(repositorio, objetivo);
  if (!cubreIncidencia(alcanceObjetivo, incidencia)) {
    throw AppError.solicitudInvalida('La cuadrilla no tiene alcance sobre el municipio de la incidencia');
  }

  const ahora = ahoraIso();
  const actualizada = {
    ...incidencia,
    asignadaA: objetivo.id,
    asignadaNombre: objetivo.nombre || objetivo.username,
    reparacionEstado: 'asignada',
    reparacionNotas: texto(notas, 'notas', { max: 2000 }),
    asignadaEn: ahora,
    reparacionIniciadaEn: null,
    reparacionTerminadaEn: null,
    historial: agregarHistorial(incidencia, {
      estado: incidencia.estado,
      accion: `Reparación asignada a ${objetivo.nombre || objetivo.username}${notas ? `: ${texto(notas, 'notas', { max: 2000 })}` : ''}`,
      por: usuario.nombre,
      ahora
    })
  };
  await repositorio.actualizarIncidencia(id, actualizada);
  await emitir(repositorio, {
    evento: 'reparacion_asignada',
    paraUsuarios: [objetivo.username],
    titulo: '🛠️ Reparación asignada',
    mensaje: `Se te asignó "${incidencia.titulo}"${notas ? `: ${texto(notas, 'notas', { max: 2000 })}` : '.'}`,
    entidadTipo: 'incidencia',
    entidadId: id,
    incidenciaId: id,
    municipioId: incidencia.municipioId,
    url: `/?incidencia=${encodeURIComponent(id)}`,
    claveDedupe: `reparacion_asignada:${id}:${objetivo.username}:${ahora}`
  }).catch(() => {});
  return actualizada;
}

/** Inicia, termina o valida una reparación. */
export async function cambiarEstado(repositorio, usuario, id, { estado, notas = '' } = {}) {
  const destino = String(estado || '');
  if (!['en_reparacion', 'terminada', 'validada'].includes(destino)) {
    throw AppError.solicitudInvalida('Estado de reparación no válido');
  }
  const incidencia = await repositorio.incidenciaPorId(id);
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  if (!puedeVerIncidencia(incidencia, usuario)) {
    throw AppError.prohibido('La incidencia está fuera de tu ámbito');
  }

  const coordinador = esCoordinador(usuario);
  const asignada = esAsignadaA(incidencia, usuario);
  if (!coordinador && !asignada) {
    throw AppError.prohibido('Solo la cuadrilla asignada o el coordinador pueden mover esta reparación');
  }
  if (destino === 'validada' && !coordinador) {
    throw AppError.prohibido('Solo el coordinador puede validar la reparación');
  }
  if (destino === 'en_reparacion' && incidencia.reparacionEstado !== 'asignada') {
    throw AppError.conflicto('La reparación debe estar asignada antes de iniciarse');
  }
  if (
    destino === 'terminada' &&
    !['asignada', 'en_reparacion'].includes(incidencia.reparacionEstado || 'sin_asignar')
  ) {
    throw AppError.conflicto('La reparación no está en un estado que permita terminarla');
  }
  if (destino === 'validada' && incidencia.reparacionEstado !== 'terminada') {
    throw AppError.conflicto('La reparación debe estar terminada antes de validarse');
  }

  const ahora = ahoraIso();
  const cambios = {
    ...incidencia,
    reparacionEstado: destino,
    reparacionNotas: texto(notas, 'notas', { max: 2000 }) || incidencia.reparacionNotas || '',
    historial: agregarHistorial(incidencia, {
      estado: incidencia.estado,
      accion:
        destino === 'en_reparacion'
          ? 'Reparación iniciada por la cuadrilla'
          : destino === 'terminada'
            ? 'Reparación terminada; pendiente de validación'
            : 'Reparación validada por el coordinador',
      por: usuario.nombre,
      ahora
    })
  };
  if (destino === 'en_reparacion') cambios.reparacionIniciadaEn = ahora;
  if (destino === 'terminada') cambios.reparacionTerminadaEn = ahora;

  await repositorio.actualizarIncidencia(id, cambios);

  const evento =
    destino === 'en_reparacion'
      ? 'reparacion_iniciada'
      : destino === 'terminada'
        ? 'reparacion_terminada'
        : 'reparacion_validada';
  const base = {
    evento,
    titulo:
      destino === 'en_reparacion'
        ? '🚧 Reparación iniciada'
        : destino === 'terminada'
          ? '✅ Reparación terminada'
          : '✔️ Reparación validada',
    mensaje:
      destino === 'en_reparacion'
        ? `La cuadrilla inició "${incidencia.titulo}".`
        : destino === 'terminada'
          ? `La cuadrilla terminó "${incidencia.titulo}". Falta la validación del coordinador.`
          : `El coordinador validó la reparación de "${incidencia.titulo}".`,
    entidadTipo: 'incidencia',
    entidadId: id,
    incidenciaId: id,
    municipioId: incidencia.municipioId,
    url: `/?incidencia=${encodeURIComponent(id)}`
  };
  if (destino === 'validada' && incidencia.asignadaA) {
    const asignadaCuenta = await repositorio.usuarioPorId(incidencia.asignadaA);
    if (asignadaCuenta) {
      await emitir(repositorio, {
        ...base,
        paraUsuarios: [asignadaCuenta.username],
        claveDedupe: `reparacion_validada:${id}:${ahora}`
      }).catch(() => {});
    }
  } else {
    await emitir(repositorio, {
      ...base,
      claveDedupe: `${evento}:${id}:${ahora}`
    }).catch(() => {});
  }
  return cambios;
}

/** Agrega documentos oficiales aportados por la cuadrilla. */
export async function agregarDocumentos(repositorio, usuario, id, documentos = []) {
  const incidencia = await repositorio.incidenciaPorId(id);
  if (!incidencia) throw AppError.noEncontrado('Incidencia no encontrada');
  if (!puedeVerIncidencia(incidencia, usuario)) {
    throw AppError.prohibido('La incidencia está fuera de tu ámbito');
  }
  const coordinador = esCoordinador(usuario);
  if (!coordinador && !esAsignadaA(incidencia, usuario)) {
    throw AppError.prohibido('Solo la cuadrilla asignada o el coordinador pueden subir documentos');
  }
  const lista = Array.isArray(documentos) ? documentos : [];
  if (!lista.length) throw AppError.solicitudInvalida('Adjunta al menos un documento');
  if (lista.length > 20) throw AppError.solicitudInvalida('Máximo 20 documentos por reparación');
  const actuales = Array.isArray(incidencia.documentosReparacion)
    ? incidencia.documentosReparacion
    : [];
  const nuevos = lista
    .filter((documento) => documento && (documento.id || documento.url))
    .map((documento) => ({
      id: documento.id || null,
      nombre: String(documento.nombre || 'Documento').slice(0, 160),
      tipo: String(documento.tipo || '').slice(0, 120),
      tamano: Number(documento.tamano) || 0,
      url: String(documento.url || '').slice(0, 500)
    }));
  if (!nuevos.length) throw AppError.solicitudInvalida('Los documentos no tienen un archivo válido');
  const actualizada = {
    ...incidencia,
    documentosReparacion: [...actuales, ...nuevos],
    historial: agregarHistorial(incidencia, {
      estado: incidencia.estado,
      accion: `${nuevos.length} documento(s) oficial(es) de la reparación agregados`,
      por: usuario.nombre,
      ahora: ahoraIso()
    })
  };
  await repositorio.actualizarIncidencia(id, actualizada);
  await emitir(repositorio, {
    evento: 'reparacion_documentos',
    titulo: '📄 Documentos de reparación',
    mensaje: `Se agregaron ${nuevos.length} documento(s) a "${incidencia.titulo}".`,
    entidadTipo: 'incidencia',
    entidadId: id,
    incidenciaId: id,
    municipioId: incidencia.municipioId,
    url: `/?incidencia=${encodeURIComponent(id)}`,
    claveDedupe: `reparacion_documentos:${id}:${Date.now()}`
  }).catch(() => {});
  return actualizada;
}
