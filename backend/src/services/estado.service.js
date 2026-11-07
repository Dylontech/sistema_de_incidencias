/**
 * SERVICIO: Estado derivado y alertas por antigüedad.
 *
 * El color NUNCA se persiste (el monolito guardaba `colorAuto`, lo que
 * duplicaba la regla en tres lugares). Aquí se calcula siempre a partir de la
 * fecha y el estado, y se añade a las respuestas como `color` y `dias`.
 */
import { DIAS_LIMITES, PRIORIDAD_COLOR } from '../config/constantes.js';
import { diasDesde } from '../utils/fechas.js';
import { emitir } from './notificaciones.service.js';

/** Regla del monolito: resuelta → verde; ≥30 días → rojo; ≥15 → naranja; resto amarillo. */
export function colorPorAntiguedad(incidencia, ahora = new Date()) {
  if (incidencia.estado === 'resuelta') return 'verde';
  const dias = diasDesde(incidencia.fecha, ahora);
  if (dias >= DIAS_LIMITES.naranja) return 'rojo';
  if (dias >= DIAS_LIMITES.amarillo) return 'naranja';
  return 'amarillo';
}

export function diasActivos(incidencia, ahora = new Date()) {
  return incidencia.estado === 'resuelta' ? null : diasDesde(incidencia.fecha, ahora);
}

/** Horas que una incidencia resuelta permanece en la lista antes de archivar. */
export const HORAS_ANTES_DE_ARCHIVAR = 24;

/** ¿Ya pasó el día desde la resolución? */
export function estaArchivada(incidencia, ahora = new Date()) {
  if (incidencia?.estado !== 'resuelta' || !incidencia.fechaResolucion) return false;
  if (incidencia.archivadaEn) return true;
  const resuelta = new Date(incidencia.fechaResolucion).getTime();
  if (Number.isNaN(resuelta)) return false;
  return ahora.getTime() - resuelta >= HORAS_ANTES_DE_ARCHIVAR * 60 * 60 * 1000;
}

/** Añade los campos derivados que consume el frontend. */
export function enriquecer(incidencia, ahora = new Date()) {
  if (!incidencia) return null;
  return {
    ...incidencia,
    color: colorPorAntiguedad(incidencia, ahora),
    dias: diasActivos(incidencia, ahora),
    archivada: estaArchivada(incidencia, ahora)
  };
}

export function enriquecerLista(lista, ahora = new Date()) {
  return lista.map((i) => enriquecer(i, ahora));
}

/**
 * Reportes marcados como peligrosos que siguen sin resolverse.
 * Es el número que el panel destaca en grande.
 */
export function contarPeligrosas(lista = []) {
  return lista.filter((i) => i.peligrosa === true && i.estado !== 'resuelta').length;
}

export function filtrarPorColor(lista, color) {
  if (!color || color === 'todos') return lista;
  return lista.filter((i) => i.color === color);
}

export function ordenarPorPrioridad(lista) {
  return lista
    .slice()
    .sort((a, b) => PRIORIDAD_COLOR[a.color] - PRIORIDAD_COLOR[b.color]);
}

/**
 * Crea las notificaciones de alerta para incidencias con más de 30 días.
 * Es idempotente: no repite la alerta si ya existe una para esa incidencia,
 * de modo que puede ejecutarse periódicamente sin efectos acumulativos.
 *
 * Antes era una notificación global que cualquiera marcaba como leída; ahora
 * el despachador crea una fila por funcionario/auditor del municipio y la
 * empuja por SSE.
 */
export async function sincronizarAlertas(repositorio, ahora = new Date()) {
  const incidencias = await repositorio.todasLasIncidencias();
  const notificaciones = await repositorio.todasLasNotificaciones();
  const yaAvisadas = new Set(
    notificaciones
      .filter((n) => n.evento === 'incidencia_alerta' || n.tipo === 'alerta')
      .map((n) => n.incidenciaId)
  );

  let creadas = 0;
  for (const incidencia of incidencias) {
    if (incidencia.estado === 'resuelta') continue;
    // El aviso es del personal del municipio; un contenido oculto por
    // moderación no puede nombrarse aquí.
    if (incidencia.oculta === true) continue;
    if (yaAvisadas.has(incidencia.id)) continue;
    if (colorPorAntiguedad(incidencia, ahora) !== 'rojo') continue;

    const avisos = await emitir(repositorio, {
      evento: 'incidencia_alerta',
      titulo: '🔴 Incidencia crítica',
      mensaje: `"${incidencia.titulo}" lleva más de ${DIAS_LIMITES.naranja} días sin resolver.`,
      severidad: 'alerta',
      incidenciaId: incidencia.id,
      entidadTipo: 'incidencia',
      entidadId: incidencia.id,
      municipioId: incidencia.municipioId || null,
      url: `/?incidencia=${incidencia.id}`,
      claveDedupe: `incidencia_alerta:${incidencia.id}`
    });
    if (avisos > 0) creadas++;
  }
  return creadas;
}

/** Estadísticas básicas de un conjunto de incidencias ya enriquecidas. */
export function contarPorEstado(lista) {
  const total = lista.length;
  const resueltas = lista.filter((i) => i.estado === 'resuelta').length;
  const enProceso = lista.filter((i) => i.estado === 'en_proceso').length;
  const reportadas = lista.filter((i) => i.estado === 'reportada').length;
  return {
    total,
    reportadas,
    enProceso,
    resueltas,
    pendientes: total - resueltas,
    criticas: lista.filter((i) => i.color === 'rojo').length,
    naranjas: lista.filter((i) => i.color === 'naranja').length,
    amarillas: lista.filter((i) => i.color === 'amarillo').length,
    tasaResolucion: total > 0 ? Number(((resueltas / total) * 100).toFixed(1)) : 0
  };
}
