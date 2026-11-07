/**
 * SERVICIO: informes de incidencias (datos, CSV y PDF).
 *
 * El mismo generador sirve para el personal (con su alcance territorial) y para
 * las solicitudes públicas (solo datos agregados, sin autoría ni datos
 * personales).
 */
import { AppError } from '../utils/AppError.js';
import { DIAS_LIMITES } from '../config/constantes.js';
import { enriquecerLista } from './estado.service.js';
import { filtrosDeAlcance } from './alcance.service.js';
import { plantillaInforme } from './configuracion.service.js';

/** Días entre la fecha del reporte y la resolución (solo incidencias resueltas). */
function diasDeResolucion(incidencia) {
  if (!incidencia?.fechaResolucion) return null;
  const inicio = new Date(incidencia.fecha).getTime();
  const fin = new Date(incidencia.fechaResolucion).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin < inicio) return null;
  return (fin - inicio) / 86400000;
}

/** Promedio de días de atención de un conjunto de incidencias (null si no hay resueltas). */
function promedioDiasDe(lista = []) {
  const dias = lista.map(diasDeResolucion).filter((valor) => valor !== null);
  if (!dias.length) return null;
  return Number((dias.reduce((suma, valor) => suma + valor, 0) / dias.length).toFixed(1));
}

function listaUnica(valor) {
  if (!valor) return [];
  const lista = Array.isArray(valor) ? valor : String(valor).split(',');
  return [...new Set(lista.map((v) => String(v).trim()).filter(Boolean))];
}

function desdeIso(valor, fin = false) {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    throw AppError.solicitudInvalida('La fecha debe tener el formato AAAA-MM-DD');
  }
  return `${texto.slice(0, 10)}T${fin ? '23:59:59' : '00:00:00'}.000Z`;
}

/**
 * Convierte la selección «estados completos + municipios concretos» en un
 * único filtro de municipios. Los repositorios aplican municipios y estados
 * con AND; para que un estado completo y un municipio de otro estado se sumen
 * (unión), se expanden aquí los estados seleccionados.
 */
export function unirMunicipiosSeleccionados(catalogo, municipios, estados) {
  const permitidos = new Set(municipios.map(String));
  for (const municipio of catalogo) {
    if (estados.includes(municipio.estado)) permitidos.add(String(municipio.id));
  }
  return [...permitidos];
}

async function resolverConsultaTerritorial(repositorio, municipios, estados) {
  if (!estados.length) return { municipios, estados: [] };
  if (!municipios.length) return { municipios: [], estados };

  const catalogo = await repositorio.todosMunicipios();
  return {
    municipios: unirMunicipiosSeleccionados(catalogo, municipios, estados),
    estados: []
  };
}

/**
 * Agrupa las incidencias para comparar. `compararPor` decide la dimensión y
 * devuelve filas listas para la tabla y el gráfico.
 */
function compararIncidencias(lista, compararPor, { municipiosPorId, tiposPorId }) {
  const grupos = new Map();
  const claveDe = (incidencia) => {
    if (compararPor === 'tipo') return incidencia.tipoId || 'sin-tipo';
    if (compararPor === 'ambito') return incidencia.ambito || 'urbano';
    if (compararPor === 'estado') {
      return municipiosPorId.get(incidencia.municipioId)?.estado || 'Sin entidad';
    }
    if (compararPor === 'mes') return String(incidencia.fecha || '').slice(0, 7) || 'sin-fecha';
    return incidencia.municipioId || 'sin-municipio';
  };
  const etiquetaDe = (clave, incidencia) => {
    if (compararPor === 'tipo') return tiposPorId.get(clave)?.nombre || clave;
    if (compararPor === 'ambito') {
      return {
        urbano: 'Zona urbana o municipal',
        carretera_estatal: 'Carretera estatal',
        carretera_federal: 'Carretera federal',
        autopista: 'Autopista',
        camino_rural: 'Camino rural'
      }[clave] || clave;
    }
    if (compararPor === 'mes') return clave;
    if (compararPor === 'estado') return clave;
    return municipiosPorId.get(clave)?.nombre || clave;
  };
  for (const incidencia of lista) {
    const clave = claveDe(incidencia);
    if (!grupos.has(clave)) {
      grupos.set(clave, { clave, etiqueta: etiquetaDe(clave, incidencia), filas: [] });
    }
    grupos.get(clave).filas.push(incidencia);
  }
  return [...grupos.values()]
    .map(({ clave, etiqueta, filas }) => {
      const resueltas = filas.filter((i) => i.estado === 'resuelta').length;
      const criticas = filas.filter(
        (i) => i.estado !== 'resuelta' && Number(i.dias) > DIAS_LIMITES.naranja
      ).length;
      return {
        clave,
        etiqueta,
        total: filas.length,
        resueltas,
        pendientes: filas.length - resueltas,
        criticas,
        tasaResolucion:
          filas.length > 0 ? Number(((resueltas / filas.length) * 100).toFixed(1)) : 0,
        promedioDias: promedioDiasDe(filas)
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Totales por mes para la gráfica de tendencia. */
function serieMensual(lista) {
  const meses = new Map();
  for (const incidencia of lista) {
    const periodo = String(incidencia.fecha || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(periodo)) continue;
    if (!meses.has(periodo)) meses.set(periodo, { periodo, total: 0, resueltas: 0 });
    const fila = meses.get(periodo);
    fila.total += 1;
    if (incidencia.estado === 'resuelta') fila.resueltas += 1;
  }
  return [...meses.values()].sort((a, b) => a.periodo.localeCompare(b.periodo)).slice(-12);
}

/**
 * Reúne los datos del informe.
 *
 * `publico: true` evita cualquier dato personal: ni autor, ni userKey, ni
 * comentarios. Además exige un filtro territorial para no volcar el país entero.
 */
export async function datosInforme(
  repositorio,
  filtros = {},
  { publico = false, usuario = null } = {}
) {
  const municipios = listaUnica(filtros.municipios || filtros.municipioId);
  const estados = listaUnica(filtros.estados || filtros.estadoEntidad);
  const municipioUnico = municipios.length === 1 ? municipios[0] : null;
  const estadoUnico = estados.length === 1 ? estados[0] : null;
  const consultaTerritorial = await resolverConsultaTerritorial(repositorio, municipios, estados);
  const ambito = filtros.ambito || 'todos';
  const ambitos = listaUnica(filtros.ambitos || filtros.ambito).filter((a) => a !== 'todos');
  const tiposTodos = filtros.tiposTodos === true;
  const tipos = tiposTodos ? [] : listaUnica(filtros.tipos);
  const desde = desdeIso(filtros.desde);
  const hasta = desdeIso(filtros.hasta, true);
  // Ejes de comparación y piezas opcionales del informe.
  const compararPor = ['municipio', 'estado', 'tipo', 'ambito', 'mes', 'ninguna'].includes(
    filtros.compararPor
  )
    ? filtros.compararPor
    : 'municipio';
  const incluirDetalle = !(filtros.incluirDetalle === false || filtros.incluirDetalle === 'false');

  if (publico && !municipios.length && !estados.length) {
    throw AppError.solicitudInvalida('Elige al menos un municipio o un estado para el informe');
  }

  const base = {
    municipioId:
      consultaTerritorial.municipios.length === 1 ? consultaTerritorial.municipios[0] : null,
    municipios: consultaTerritorial.municipios.length
      ? consultaTerritorial.municipios
      : null,
    estadoEntidad:
      consultaTerritorial.estados.length === 1 ? consultaTerritorial.estados[0] : null,
    estados: consultaTerritorial.estados.length ? consultaTerritorial.estados : null,
    ambito,
    desde,
    hasta,
    ocultas: 'excluir',
    orden: 'reciente'
  };

  // El personal solo puede informar de su ámbito; el público ya viene filtrado
  // por municipio o estado en el propio formulario.
  const consulta = usuario ? filtrosDeAlcance(usuario, base) : base;
  const todas = await repositorio.buscarIncidencias(consulta);

  const filtradas = todas.filter(
    (i) =>
      (!tipos.length || tipos.includes(i.tipoId)) &&
      (!ambitos.length || ambitos.includes(i.ambito || 'urbano'))
  );

  const enriquecidas = enriquecerLista(filtradas);
  const catalogoTipos = await repositorio.todosLosTipos();
  const porId = new Map(catalogoTipos.map((t) => [t.id, t]));
  const catalogoMunicipios = await repositorio.todosMunicipios();
  const municipiosPorId = new Map(catalogoMunicipios.map((m) => [m.id, m]));

  const resumen = {
    total: enriquecidas.length,
    reportadas: enriquecidas.filter((i) => i.estado === 'reportada').length,
    enProceso: enriquecidas.filter((i) => i.estado === 'en_proceso').length,
    resueltas: enriquecidas.filter((i) => i.estado === 'resuelta').length,
    criticas: enriquecidas.filter(
      (i) => i.estado !== 'resuelta' && Number(i.dias) > DIAS_LIMITES.naranja
    ).length,
    viales: enriquecidas.filter((i) => (i.ambito || 'urbano') !== 'urbano').length
  };
  resumen.tasaResolucion =
    resumen.total > 0 ? Number(((resumen.resueltas / resumen.total) * 100).toFixed(1)) : 0;
  resumen.promedioDias = promedioDiasDe(enriquecidas);

  const porTipo = [...porId.values()]
    .map((tipo) => {
      const deTipo = enriquecidas.filter((i) => i.tipoId === tipo.id);
      const resueltas = deTipo.filter((i) => i.estado === 'resuelta').length;
      return {
        tipoId: tipo.id,
        nombre: tipo.nombre,
        icono: tipo.icono,
        total: deTipo.length,
        resueltas,
        pendientes: deTipo.length - resueltas,
        porcentaje:
          resumen.total > 0 ? Number(((deTipo.length / resumen.total) * 100).toFixed(1)) : 0
      };
    })
    .filter((fila) => fila.total > 0)
    .sort((a, b) => b.total - a.total);

  const porMunicipio = [...new Set(enriquecidas.map((i) => i.municipioId))]
    .map((id) => {
      const municipio = municipiosPorId.get(id);
      const deMunicipio = enriquecidas.filter((i) => i.municipioId === id);
      return {
        municipioId: id,
        municipio: municipio?.nombre || id,
        estado: municipio?.estado || '',
        total: deMunicipio.length,
        resueltas: deMunicipio.filter((i) => i.estado === 'resuelta').length
      };
    })
    .sort((a, b) => b.total - a.total);

  const comparativa = compararPor === 'ninguna'
    ? []
    : compararIncidencias(enriquecidas, compararPor, {
        municipiosPorId,
        tiposPorId: porId
      });
  const series = serieMensual(enriquecidas);

  const detalle = !incluirDetalle
    ? []
    : enriquecidas.slice(0, 1500).map((i) => ({
    id: i.id,
    folio: i.folio || i.id,
    fecha: i.fecha,
    tipo: porId.get(i.tipoId)?.nombre || i.tipoId,
    titulo: i.titulo,
    estado: i.estado,
    municipio: municipiosPorId.get(i.municipioId)?.nombre || i.municipioId,
    estadoEntidad: municipiosPorId.get(i.municipioId)?.estado || i.estadoEntidad || '',
    zona: i.zonaNombre || '',
    ambito: i.ambito || 'urbano',
    viaNombre: i.viaNombre || '',
    kilometro: i.kilometro ?? null,
    lat: i.lat,
    lng: i.lng,
    dias: i.dias,
    ...(publico
      ? {}
      : {
          autor: i.esAnonimo ? 'Anónimo' : i.autorNombre,
          peligrosa: i.peligrosa === true
        })
  }));

  return {
    generadoEn: new Date().toISOString(),
    plantilla: await plantillaInforme(repositorio),
    filtros: {
      municipioId: municipioUnico,
      municipios,
      estadoEntidad: estadoUnico,
      estados,
      ambito,
      ambitos,
      tipos,
      tiposTodos,
      compararPor,
      incluirDetalle,
      desde: desde ? desde.slice(0, 10) : null,
      hasta: hasta ? hasta.slice(0, 10) : null
    },
    resumen,
    porTipo,
    porMunicipio,
    comparativa,
    series,
    detalle
  };
}

const COLUMNAS_CSV = [
  'Folio interno',
  'Fecha',
  'Tipo',
  'Título',
  'Estado',
  'Municipio',
  'Entidad',
  'Comunidad',
  'Ámbito',
  'Vía',
  'Km',
  'Latitud',
  'Longitud',
  'Días'
];

function celda(valor) {
  const texto = String(valor ?? '').replace(/"/g, '""');
  return `"${texto}"`;
}

/** CSV con BOM (Excel en español lo abre con acentos correctos). */
export function generarCSV(datos) {
  const lineas = [];
  lineas.push(
    ['Informe de incidencias', datos.generadoEn].map(celda).join(',')
  );
  const filtros = [
    datos.filtros.municipios?.length && `Municipios: ${datos.filtros.municipios.join(', ')}`,
    datos.filtros.estados?.length && `Estados: ${datos.filtros.estados.join(', ')}`,
    datos.filtros.desde && `Desde: ${datos.filtros.desde}`,
    datos.filtros.hasta && `Hasta: ${datos.filtros.hasta}`,
    datos.filtros.ambitos?.length
      ? `Ámbitos: ${datos.filtros.ambitos.join(', ')}`
      : datos.filtros.ambito !== 'todos' && `Ámbito: ${datos.filtros.ambito}`
  ].filter(Boolean);
  if (filtros.length) lineas.push([filtros.join(' · ')].map(celda).join(','));
  lineas.push('');
  lineas.push(COLUMNAS_CSV.map(celda).join(','));
  for (const inc of datos.detalle) {
    lineas.push(
      [
        inc.id,
        inc.fecha,
        inc.tipo,
        inc.titulo,
        inc.estado,
        inc.municipio,
        inc.estadoEntidad,
        inc.zona,
        inc.ambito,
        inc.viaNombre,
        inc.kilometro,
        inc.lat,
        inc.lng,
        inc.dias
      ]
        .map(celda)
        .join(',')
    );
  }
  return `\uFEFF${lineas.join('\r\n')}`;
}

export function nombreArchivo(datos, formato) {
  const partes = ['informe-incidencias'];
  if (datos.filtros.municipioId) partes.push(datos.filtros.municipioId);
  if (datos.filtros.estadoEntidad) {
    partes.push(String(datos.filtros.estadoEntidad).toLowerCase().replace(/\s+/g, '-'));
  }
  const fecha = datos.generadoEn.slice(0, 10);
  return `${partes.join('-')}-${fecha}.${formato}`;
}
