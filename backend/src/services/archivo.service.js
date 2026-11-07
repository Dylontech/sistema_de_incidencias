/**
 * SERVICIO: archivo general de incidencias resueltas.
 *
 * El archivo no es un listado plano: se organiza en carpetas por mes y día
 * para que el personal municipal encuentre un expediente por fecha. El alcance
 * territorial y el permiso se comprueban en el servidor; la interfaz solo
 * oculta lo que el servidor ya negaría.
 */
import { AppError } from '../utils/AppError.js';
import { tienePermiso } from './permisos.service.js';
import { listar, obtener } from './incidencias.service.js';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
];

const dinero = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : 0;
};

function fechaDeArchivo(incidencia) {
  return (
    incidencia.fechaResolucion ||
    incidencia.fechaArchivado ||
    incidencia.actualizado ||
    incidencia.fecha ||
    null
  );
}

function diaIso(valor) {
  if (!valor) return '';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '' : fecha.toISOString().slice(0, 10);
}

function etiquetaDeDia(clave) {
  const [anio, mes, dia] = clave.split('-').map(Number);
  if (!anio || !mes || !dia) return 'Sin fecha';
  return `${dia} de ${MESES[mes - 1] || ''} de ${anio}`.replace(/\s+/g, ' ').trim();
}

function etiquetaDeMes(clave) {
  const [anio, mes] = clave.split('-').map(Number);
  if (!anio || !mes) return 'Sin fecha';
  return `${MESES[mes - 1] || ''} de ${anio}`;
}

function resumenDeIncidencia(incidencia) {
  return {
    id: incidencia.id,
    folio: incidencia.folio || '',
    titulo: incidencia.titulo || '',
    tipoId: incidencia.tipoId || '',
    tipoNombre: incidencia.tipo?.nombre || incidencia.tipoId || '',
    municipioId: incidencia.municipioId || '',
    municipioNombre: incidencia.municipioNombre || '',
    zonaNombre: incidencia.zonaNombre || '',
    fecha: incidencia.fecha,
    fechaResolucion: incidencia.fechaResolucion || null,
    costoReparacion:
      incidencia.costoReparacion === null || incidencia.costoReparacion === undefined
        ? null
        : dinero(incidencia.costoReparacion),
    reparacionEstado: incidencia.reparacionEstado || 'sin_asignar',
    documentos: (incidencia.documentosResolucion || []).length
  };
}

/**
 * Convierte una lista de incidencias en carpetas mes → día.
 * Es una función pura para poder probar el orden y los totales sin base.
 */
export function agruparArchivo(incidencias = []) {
  const porMes = new Map();
  const ordenadas = [...incidencias].sort(
    (a, b) => new Date(fechaDeArchivo(b) || 0) - new Date(fechaDeArchivo(a) || 0)
  );

  for (const incidencia of ordenadas) {
    const claveDia = diaIso(fechaDeArchivo(incidencia)) || 'sin-fecha';
    const claveMes = claveDia === 'sin-fecha' ? 'sin-fecha' : claveDia.slice(0, 7);
    if (!porMes.has(claveMes)) {
      porMes.set(claveMes, {
        clave: claveMes,
        etiqueta: claveMes === 'sin-fecha' ? 'Sin fecha' : etiquetaDeMes(claveMes),
        total: 0,
        costoTotal: 0,
        dias: new Map()
      });
    }
    const mes = porMes.get(claveMes);
    if (!mes.dias.has(claveDia)) {
      mes.dias.set(claveDia, {
        clave: claveDia,
        etiqueta: claveDia === 'sin-fecha' ? 'Sin fecha' : etiquetaDeDia(claveDia),
        total: 0,
        costoTotal: 0,
        incidencias: []
      });
    }
    const dia = mes.dias.get(claveDia);
    const resumen = resumenDeIncidencia(incidencia);
    dia.incidencias.push(resumen);
    dia.total += 1;
    dia.costoTotal += resumen.costoReparacion || 0;
    mes.total += 1;
    mes.costoTotal += resumen.costoReparacion || 0;
  }

  const carpetas = [...porMes.values()].map((mes) => ({
    ...mes,
    costoTotal: dinero(mes.costoTotal),
    dias: [...mes.dias.values()]
      .map((dia) => ({ ...dia, costoTotal: dinero(dia.costoTotal) }))
      .sort((a, b) => (a.clave < b.clave ? 1 : -1))
  }));
  carpetas.sort((a, b) => (a.clave < b.clave ? 1 : -1));
  return carpetas;
}

function exigirArchivo(usuario) {
  if (!tienePermiso(usuario, 'ver_incidencias_panel')) {
    throw AppError.prohibido('El archivo general solo está disponible para el personal autorizado');
  }
}

/** Archivo agrupado por fecha, con filtros de fecha y texto. */
export async function archivo(repositorio, usuario, filtros = {}) {
  exigirArchivo(usuario);
  const incidencias = await listar(repositorio, usuario, {
    ...filtros,
    archivo: true,
    orden: 'reciente'
  });
  const desde = diaIso(filtros.desde);
  const hasta = diaIso(filtros.hasta);
  const filtradas = incidencias.filter((incidencia) => {
    const dia = diaIso(fechaDeArchivo(incidencia));
    if (!dia) return !desde && !hasta;
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    return true;
  });
  const carpetas = agruparArchivo(filtradas);
  return {
    carpetas,
    resumen: {
      total: filtradas.length,
      carpetas: carpetas.length,
      costoTotal: dinero(
        filtradas.reduce((suma, incidencia) => suma + Number(incidencia.costoReparacion || 0), 0)
      ),
      desde: filtros.desde || null,
      hasta: filtros.hasta || null
    }
  };
}

/** Expediente completo de una incidencia resuelta y visible para el usuario. */
export async function expediente(repositorio, usuario, id) {
  exigirArchivo(usuario);
  const incidencia = await obtener(repositorio, usuario, id);
  if (incidencia.estado !== 'resuelta') {
    throw AppError.conflicto('El expediente solo está disponible para incidencias resueltas');
  }
  const documentos = [
    ...(incidencia.documentosReparacion || []).map((documento) => ({
      ...documento,
      origen: 'reparacion'
    })),
    ...(incidencia.documentosResolucion || []).map((documento) => ({
      ...documento,
      origen: 'resolucion'
    }))
  ];
  const fechaResolucion = incidencia.fechaResolucion || incidencia.actualizado || null;
  const diasResolucion =
    fechaResolucion && incidencia.fecha
      ? Math.max(
          0,
          Math.round(
            (new Date(fechaResolucion).getTime() - new Date(incidencia.fecha).getTime()) / 86400000
          )
        )
      : null;
  const costoDesglose = (incidencia.desgloseCostos || []).reduce(
    (suma, concepto) => suma + Number(concepto.monto || 0),
    0
  );
  return {
    generadoEn: new Date().toISOString(),
    incidencia,
    resumen: {
      folio: incidencia.folio || '',
      titulo: incidencia.titulo,
      estado: incidencia.estado,
      fecha: incidencia.fecha,
      fechaResolucion,
      diasResolucion,
      costoReparacion:
        incidencia.costoReparacion === null || incidencia.costoReparacion === undefined
          ? null
          : dinero(incidencia.costoReparacion),
      costoDesglose: dinero(costoDesglose),
      documentos: documentos.length,
      comentarios: (incidencia.comentarios || []).length
    },
    reparacion: {
      estado: incidencia.reparacionEstado || 'sin_asignar',
      asignadaA: incidencia.asignadaA || null,
      asignadaNombre: incidencia.asignadaNombre || null,
      notas: incidencia.reparacionNotas || '',
      asignadaEn: incidencia.asignadaEn || null,
      iniciadaEn: incidencia.reparacionIniciadaEn || null,
      terminadaEn: incidencia.reparacionTerminadaEn || null,
      desgloseCostos: incidencia.desgloseCostos || [],
      documentos: incidencia.documentosReparacion || []
    },
    documentos,
    historial: incidencia.historial || [],
    evidencias: incidencia.evidencia || [],
    solucion: incidencia.solucion || '',
    comentarios: incidencia.comentarios || []
  };
}
