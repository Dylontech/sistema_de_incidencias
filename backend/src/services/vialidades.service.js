/**
 * Servicio de condición de vialidades para la capa del mapa.
 *
 * La red vial real se dibuja como polígonos de calzada. Los ejes importados
 * se convierten en corredores y se dividen en subtramos para el degradado.
 * Las incidencias se asocian a la geometría real; no se inventan líneas
 * uniendo reportes.
 */
import { AppError } from '../utils/AppError.js';
import { nuevoId } from '../utils/ids.js';
import { puedeVerMunicipio } from './alcance.service.js';
import { mapa } from './incidencias.service.js';
import {
  anchoPorTipo,
  bboxDeGeometria,
  bufferizarEje,
  distanciaPuntoAGeometriaMetros,
  esGeometriaLinea,
  esGeometriaPoligono,
  normalizarGeometria,
  posicionEnLinea
} from './geometria.service.js';
import {
  importarDesdeOsm,
  prepararViaImportada,
  viasDesdeContenido
} from './vialidades-import.service.js';

export const ESCALA_VIA = [
  { desde: 75, estado: 'critico', etiqueta: 'Crítico', color: '#111827' },
  { desde: 55, estado: 'malo', etiqueta: 'Malo', color: '#dc2626' },
  { desde: 35, estado: 'regular', etiqueta: 'Regular', color: '#f97316' },
  { desde: 15, estado: 'leve', etiqueta: 'Leve', color: '#eab308' },
  { desde: 0, estado: 'bueno', etiqueta: 'Bueno', color: '#16a34a' }
];

export const COLOR_SIN_DATOS = '#94a3b8';

const PARADAS = [
  [0, [22, 163, 74]],
  [15, [234, 179, 8]],
  [35, [249, 115, 22]],
  [55, [220, 38, 38]],
  [75, [17, 24, 39]],
  [100, [17, 24, 39]]
];

const aHex = (rgb) => `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;

/** Color continuo entre los cinco cortes de la escala. */
export function colorDeIndice(indice) {
  const valor = Math.max(0, Math.min(100, Number(indice) || 0));
  for (let i = 1; i < PARADAS.length; i += 1) {
    const [hasta, colorHasta] = PARADAS[i];
    const [desde, colorDesde] = PARADAS[i - 1];
    if (valor <= hasta) {
      const proporcion = (valor - desde) / (hasta - desde || 1);
      return aHex(
        colorDesde.map((canal, posicion) => canal + (colorHasta[posicion] - canal) * proporcion)
      );
    }
  }
  return aHex(PARADAS.at(-1)[1]);
}

/** Etiqueta y color de corte para un índice. */
export function nivelDeIndice(indice) {
  const valor = Math.max(0, Math.min(100, Number(indice) || 0));
  const nivel = ESCALA_VIA.find((corte) => valor >= corte.desde) || ESCALA_VIA.at(-1);
  return { ...nivel, color: colorDeIndice(valor) };
}

/** Normaliza el nombre de una vía para agrupar «Av. Juárez» y «AV JUAREZ». */
export function claveDeVia(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function diasDe(punto, ahora = Date.now()) {
  if (Number.isFinite(Number(punto.dias))) return Math.max(0, Number(punto.dias));
  const fecha = new Date(punto.fecha || ahora).getTime();
  if (!Number.isFinite(fecha)) return 0;
  return Math.max(0, Math.floor((ahora - fecha) / 86400000));
}

/** Gravedad individual: peligro + antigüedad + estado. */
function gravedadDePunto(punto, ahora) {
  if (punto.estado === 'resuelta') return 0;
  const dias = diasDe(punto, ahora);
  let valor = 10 + Math.min(42, dias * 1.15);
  if (punto.peligrosa === true) valor += 34;
  if (punto.estado === 'en_proceso') valor += 4;
  return Math.max(0, Math.min(100, valor));
}

/** Índice agregado de un conjunto de incidencias de la misma vía o zona. */
export function indiceDePuntos(puntos = [], ahora = Date.now()) {
  if (!puntos.length) {
    return {
      indice: null,
      estado: 'sin_datos',
      etiqueta: 'Sin datos',
      color: COLOR_SIN_DATOS,
      total: 0,
      activas: 0,
      resueltas: 0,
      peligrosas: 0,
      diasPromedio: 0,
      ultimaFecha: null
    };
  }
  const activas = puntos.filter((punto) => punto.estado !== 'resuelta');
  const resueltas = puntos.length - activas.length;
  const peligrosas = puntos.filter((punto) => punto.peligrosa === true).length;
  const dias = puntos.map((punto) => diasDe(punto, ahora));
  const diasPromedio = Math.round(dias.reduce((suma, valor) => suma + valor, 0) / dias.length);

  if (!activas.length) {
    return {
      indice: 0,
      estado: 'bueno',
      etiqueta: 'Bueno',
      color: colorDeIndice(0),
      total: puntos.length,
      activas: 0,
      resueltas,
      peligrosas,
      diasPromedio,
      ultimaFecha: puntos.map((p) => p.fecha).filter(Boolean).sort().at(-1) || null
    };
  }

  const promedio = activas.reduce((suma, punto) => suma + gravedadDePunto(punto, ahora), 0) / activas.length;
  // Más reportes en el mismo tramo indican un problema persistente, no casos aislados.
  const presion = Math.min(24, Math.log2(activas.length + 1) * 7);
  const indice = Math.round(Math.max(0, Math.min(100, promedio * 0.72 + presion)));
  const nivel = nivelDeIndice(indice);
  return {
    ...nivel,
    indice,
    total: puntos.length,
    activas: activas.length,
    resueltas,
    peligrosas,
    diasPromedio,
    ultimaFecha: puntos.map((p) => p.fecha).filter(Boolean).sort().at(-1) || null
  };
}

function caminoDePoligono(geometria) {
  if (!geometria) return [];
  const anillos =
    geometria.type === 'Polygon'
      ? geometria.coordinates
      : geometria.type === 'MultiPolygon'
        ? geometria.coordinates[0] || []
        : [];
  return (anillos[0] || []).map(([lng, lat]) => [lat, lng]);
}

function indiceLocal(puntos, centro, radio = 150) {
  const cercanos = puntos.filter((punto) => Math.abs((punto.avance || 0) - centro) <= radio);
  if (!cercanos.length) {
    return {
      indice: 0,
      estado: 'sin_reportes',
      etiqueta: 'Sin reportes',
      color: colorDeIndice(0),
      total: 0,
      activas: 0,
      resueltas: 0,
      peligrosas: 0,
      diasPromedio: 0,
      ultimaFecha: null,
      sinReportes: true
    };
  }
  const nivel = indiceDePuntos(cercanos);
  return {
    ...nivel,
    color: colorDeIndice(nivel.indice ?? 0),
    sinReportes: false
  };
}

function suavizarIndices(segmentos) {
  const valores = segmentos.map((segmento) => (segmento.sinReportes ? 0 : segmento.indice ?? 0));
  return segmentos.map((segmento, indice) => {
    if (segmento.sinReportes) return segmento;
    const vecinos = [valores[indice - 1], valores[indice], valores[indice + 1]].filter(
      (valor) => Number.isFinite(valor)
    );
    const promedio = vecinos.reduce((suma, valor) => suma + valor, 0) / (vecinos.length || 1);
    const valor = Math.round(promedio);
    return {
      ...segmento,
      indice: valor,
      ...nivelDeIndice(valor),
      color: colorDeIndice(valor)
    };
  });
}

function segmentosDeVia(via, puntos, ahora) {
  const total = indiceDePuntos(puntos, ahora);
  if (!puntos.length) {
    return {
      ...total,
      indice: 0,
      estado: 'sin_reportes',
      etiqueta: 'Sin reportes',
      color: colorDeIndice(0),
      sinReportes: true,
      segmentos: [
        {
          geometria: via.geometria,
          indice: 0,
          estado: 'sin_reportes',
          etiqueta: 'Sin reportes',
          color: colorDeIndice(0),
          total: 0,
          sinReportes: true
        }
      ]
    };
  }
  if (!via.eje) {
    const color = colorDeIndice(total.indice ?? 0);
    return {
      ...total,
      color,
      sinReportes: false,
      segmentos: [
        {
          geometria: via.geometria,
          indice: total.indice,
          estado: total.estado,
          etiqueta: total.etiqueta,
          color,
          total: total.total,
          sinReportes: false
        }
      ]
    };
  }
  const buffer = bufferizarEje(via.eje, via.anchoM, { paso: 40, maxMuestras: 200 });
  if (!buffer?.segmentos?.length) {
    return segmentosDeVia({ ...via, eje: null }, puntos, ahora);
  }
  const segmentos = buffer.segmentos.map((subtramo) => ({
    geometria: subtramo.geometria,
    ...indiceLocal(puntos, subtramo.avanceCentro)
  }));
  const suavizados = suavizarIndices(segmentos);
  return {
    ...total,
    color: colorDeIndice(total.indice ?? 0),
    sinReportes: false,
    segmentos: suavizados
  };
}

/**
 * Prepara la red real y asigna cada incidencia a la vialidad poligonal más
 * cercana. Ya no se generan líneas uniendo reportes.
 */
function tramosReales(vialidades, puntos) {
  const ahora = Date.now();
  const preparadas = vialidades
    .map((via) => {
      const geometriaCruda = normalizarGeometria(via.geometria);
      if (!geometriaCruda) return null;
      const ejeCrudo = normalizarGeometria(via.eje);
      const eje = ejeCrudo && esGeometriaLinea(ejeCrudo)
        ? ejeCrudo
        : esGeometriaLinea(geometriaCruda)
          ? geometriaCruda
          : null;
      const anchoM = Number(via.anchoM) || anchoPorTipo(via.tipo);
      const geometria = esGeometriaPoligono(geometriaCruda)
        ? geometriaCruda
        : bufferizarEje(eje, anchoM, { segmentos: false, soloVertices: true })?.geometria;
      if (!geometria) return null;
      return {
        ...via,
        geometria,
        eje,
        anchoM,
        bbox: via.bbox || bboxDeGeometria(geometria),
        puntos: []
      };
    })
    .filter(Boolean);

  for (const punto of puntos) {
    let mejor = null;
    for (const via of preparadas) {
      const distancia = distanciaPuntoAGeometriaMetros(punto, via.geometria);
      if (distancia <= 120 && (!mejor || distancia < mejor.distancia)) {
        mejor = { via, distancia };
      }
    }
    if (!mejor) continue;
    const posicion = mejor.via.eje
      ? posicionEnLinea(punto, mejor.via.eje)
      : { avance: 0 };
    mejor.via.puntos.push({ ...punto, avance: posicion.avance });
  }

  return preparadas
    .map((via) => {
      const condicion = segmentosDeVia(via, via.puntos, ahora);
      const camino = via.eje
        ? via.eje.coordinates.map(([lng, lat]) => [lat, lng])
        : caminoDePoligono(via.geometria);
      const { puntos: _puntos, ...resto } = via;
      return {
        ...resto,
        camino,
        ...condicion,
        incidenciaIds: via.puntos.map((punto) => punto.id).filter(Boolean),
        medicion: 'importada',
        fuente: via.fuente || 'geo'
      };
    })
    .sort((a, b) => (b.indice ?? -1) - (a.indice ?? -1));
}

/** Mapa de calor por zona/comunidad. */
function puntoMasCercano(puntos) {
  return puntos.length
    ? puntos.reduce((mejor, actual) => {
        const promedio = (p) => (Number(p.lat) + Number(p.lng)) / 2;
        return Math.abs(promedio(actual) - promedio(puntos[0])) <
          Math.abs(promedio(mejor) - promedio(puntos[0]))
          ? actual
          : mejor;
      }, puntos[0])
    : null;
}

function zonasDeCalor(puntos) {
  const grupos = new Map();
  for (const punto of puntos) {
    const clave = punto.zonaId || claveDeVia(punto.zonaNombre) || 'SIN-ZONA';
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        zonaId: punto.zonaId || null,
        nombre: punto.zonaNombre || 'Zona sin asignar',
        puntos: []
      });
    }
    grupos.get(clave).puntos.push(punto);
  }
  return [...grupos.values()]
    .map((grupo) => {
      const nivel = indiceDePuntos(grupo.puntos);
      const centro = puntoMasCercano(grupo.puntos);
      return {
        zonaId: grupo.zonaId,
        nombre: grupo.nombre,
        centro: centro ? [Number(centro.lat), Number(centro.lng)] : null,
        ...nivel
      };
    })
    .sort((a, b) => (b.indice ?? -1) - (a.indice ?? -1));
}

/**
 * Datos de la capa de condición de vialidades.
 *
 * @param {Object} repositorio
 * @param {Object} usuario
 * @param {Object} filtros mismos filtros del mapa (`municipio`, `bbox`, «desde»…)
 */
export async function condicionVialidades(repositorio, usuario, filtros = {}) {
  const { puntos } = await mapa(repositorio, usuario, {
    ...filtros,
    cluster: false,
    limite: filtros.limite || 5000
  });

  const vialidades = filtros.municipioId
    ? await repositorio.listarVialidades({ municipioId: filtros.municipioId, limite: 5000 })
    : [];

  const vias = tramosReales(vialidades, puntos);
  const zonas = zonasDeCalor(puntos);
  const conReportes = vias.filter((via) => !via.sinReportes).length;
  const resumen = {
    totalIncidencias: puntos.length,
    vias: vias.length,
    conDatos: conReportes,
    conReportes,
    sinReportes: vias.length - conReportes,
    zonas: zonas.length,
    criticas: vias.filter((via) => via.estado === 'critico').length,
    sinDatos: vias.filter((via) => via.estado === 'sin_datos').length,
    redReal: vialidades.length > 0,
    sinRedReal: vialidades.length === 0
  };

  return {
    vias,
    zonas,
    resumen,
    escala: ESCALA_VIA,
    colorSinDatos: COLOR_SIN_DATOS,
    redReal: vialidades.length > 0,
    sinRedReal: vialidades.length === 0,
    aviso:
      vialidades.length > 0
        ? null
        : 'No hay red vial real importada para este municipio. Importa un KML/GeoJSON o carga OpenStreetMap.'
  };
}

/** Valida que el llamador pueda pedir la capa (personal con panel). */
export function exigirAcceso(usuario) {
  if (!usuario || usuario.rol === 'anonimo') {
    throw AppError.noAutenticado('Inicia sesión para ver la condición de vialidades');
  }
}

/* ------------------------- administración de vialidades ------------------------- */

export const TIPOS_VIA = [
  { clave: 'calle', etiqueta: 'Calle' },
  { clave: 'avenida', etiqueta: 'Avenida' },
  { clave: 'camino_rural', etiqueta: 'Camino rural' },
  { clave: 'carretera_estatal', etiqueta: 'Carretera estatal' },
  { clave: 'carretera_federal', etiqueta: 'Carretera federal' },
  { clave: 'autopista', etiqueta: 'Autopista' },
  { clave: 'otra', etiqueta: 'Otra vialidad' }
];

export const FUENTES_VIA = [
  { clave: 'local', etiqueta: 'Dato local' },
  { clave: 'google_maps', etiqueta: 'Google Maps' },
  { clave: 'openstreetmap', etiqueta: 'OpenStreetMap' },
  { clave: 'geojson', etiqueta: 'GeoJSON importado' },
  { clave: 'manual', etiqueta: 'Captura manual' }
];

const CLAVES_TIPO = new Set(TIPOS_VIA.map((tipo) => tipo.clave));
const CLAVES_FUENTE = new Set(FUENTES_VIA.map((fuente) => fuente.clave));
const DIAS_DESACTUALIZADA = 180;

const texto = (valor, campo, { max = 160, requerido = false } = {}) => {
  const limpio = String(valor ?? '').trim();
  if (requerido && !limpio) {
    throw AppError.solicitudInvalida(`El campo ${campo} es obligatorio`);
  }
  if (limpio.length > max) {
    throw AppError.solicitudInvalida(`El campo ${campo} admite ${max} caracteres`);
  }
  return limpio;
};

function municipioDeVia(usuario, municipioId) {
  const id = texto(municipioId, 'municipio', { max: 64, requerido: true });
  if (!puedeVerMunicipio(usuario, id)) {
    throw AppError.prohibido('El municipio está fuera de tu alcance');
  }
  return id;
}

function enlaceGoogle(valor) {
  const enlace = texto(valor, 'enlace de Google Maps', { max: 500 });
  if (!enlace) return '';
  if (!/^https?:\/\//i.test(enlace)) {
    throw AppError.solicitudInvalida('El enlace de Google Maps debe empezar por http:// o https://');
  }
  return enlace;
}

function datosDeVia(usuario, datos = {}, { crear = false } = {}) {
  const municipioId = municipioDeVia(usuario, datos.municipioId);
  const nombre = texto(datos.nombre, 'nombre', { max: 160, requerido: true });
  const tipo = CLAVES_TIPO.has(String(datos.tipo || '')) ? String(datos.tipo) : 'calle';
  const fuente = CLAVES_FUENTE.has(String(datos.fuente || '')) ? String(datos.fuente) : 'manual';
  const clave = texto(datos.clave, 'clave', { max: 160 }) || claveDeVia(nombre);
  const geometriaCruda = normalizarGeometria(datos.geometria);
  if (!geometriaCruda) {
    throw AppError.solicitudInvalida('Agrega una geometría válida para delimitar la vialidad');
  }
  const anchoM = Number(datos.anchoM) || anchoPorTipo(tipo);
  let eje = normalizarGeometria(datos.eje);
  let geometria = geometriaCruda;
  let geometriaTipo = 'poligono';
  if (esGeometriaLinea(geometriaCruda)) {
    const buffer = bufferizarEje(geometriaCruda, anchoM, {
      segmentos: false,
      soloVertices: true
    });
    if (!buffer) throw AppError.solicitudInvalida('No se pudo generar el polígono de la vialidad');
    eje = geometriaCruda;
    geometria = buffer.geometria;
    geometriaTipo = 'poligono_generado';
  } else if (esGeometriaPoligono(geometriaCruda)) {
    eje = eje && esGeometriaLinea(eje) ? eje : null;
    geometriaTipo = geometriaCruda.type === 'MultiPolygon' ? 'multipoligono' : 'poligono';
  } else {
    throw AppError.solicitudInvalida('La vialidad debe ser una línea o un polígono');
  }
  const ahora = new Date().toISOString();
  return {
    municipioId,
    nombre,
    clave,
    tipo,
    fuente,
    geometria,
    eje,
    anchoM,
    bbox: bboxDeGeometria(geometria),
    geometriaTipo,
    osmId: texto(datos.osmId, 'osm_id', { max: 64 }) || null,
    googleMapsUrl: enlaceGoogle(datos.googleMapsUrl),
    notas: texto(datos.notas, 'notas', { max: 2000 }),
    ...(crear
      ? { verificadaEn: ahora, verificadaPor: usuario.username || usuario.nombre || null }
      : {}),
    actualizadoEn: ahora
  };
}

function estaDesactualizada(via, ahora = Date.now()) {
  if (!via.verificadaEn) return true;
  const fecha = new Date(via.verificadaEn).getTime();
  return !Number.isFinite(fecha) || ahora - fecha > DIAS_DESACTUALIZADA * 86400000;
}

/** Listado administrativo con la condición vial actual y el estado de revisión. */
export async function listarAdmin(repositorio, usuario, filtros = {}) {
  const municipioId = municipioDeVia(usuario, filtros.municipioId || filtros.municipio);
  const vialidades = await repositorio.listarVialidades({
    municipioId,
    tipo: CLAVES_TIPO.has(String(filtros.tipo || '')) ? filtros.tipo : null,
    fuente: CLAVES_FUENTE.has(String(filtros.fuente || '')) ? filtros.fuente : null,
    texto: filtros.texto || '',
    limite: 5000
  });
  const { vias } = await condicionVialidades(repositorio, usuario, { municipioId, limite: 5000 });
  const porId = new Map((vias || []).map((via) => [String(via.id), via]));
  const porClave = new Map((vias || []).map((via) => [via.clave, via]));
  const ahora = Date.now();
  let lista = vialidades.map((via) => {
    const condicion = porId.get(String(via.id)) || porClave.get(via.clave) || null;
    return {
      ...via,
      condicion: condicion
        ? {
            indice: condicion.indice,
            estado: condicion.estado,
            etiqueta: condicion.etiqueta,
            color: condicion.color,
            total: condicion.total,
            peligrosas: condicion.peligrosas,
            sinReportes: condicion.sinReportes === true
          }
        : null,
      desactualizada: estaDesactualizada(via, ahora),
      sinVerificar: !via.verificadaEn
    };
  });
  if (filtros.soloDesactualizadas === true || filtros.soloDesactualizadas === 'true') {
    lista = lista.filter((via) => via.desactualizada);
  }
  if (filtros.soloSinVerificar === true || filtros.soloSinVerificar === 'true') {
    lista = lista.filter((via) => via.sinVerificar);
  }
  const resumen = {
    total: lista.length,
    criticas: lista.filter((via) => via.condicion?.estado === 'critico').length,
    conDatos: lista.filter((via) => via.condicion).length,
    conReportes: lista.filter((via) => via.condicion && !via.condicion.sinReportes).length,
    sinReportes: lista.filter((via) => via.condicion?.sinReportes).length,
    sinVerificar: lista.filter((via) => via.sinVerificar).length,
    desactualizadas: lista.filter((via) => via.desactualizada).length,
    porTipo: TIPOS_VIA.map((tipo) => ({
      ...tipo,
      total: lista.filter((via) => via.tipo === tipo.clave).length
    })).filter((tipo) => tipo.total)
  };
  return {
    vialidades: lista,
    resumen,
    tipos: TIPOS_VIA,
    fuentes: FUENTES_VIA,
    diasDesactualizada: DIAS_DESACTUALIZADA,
    municipioId
  };
}

export async function crearAdmin(repositorio, usuario, datos = {}) {
  const via = datosDeVia(usuario, datos, { crear: true });
  return repositorio.crearVialidad({
    id: `via-${nuevoId()}`,
    ...via,
    activo: true
  });
}

export async function actualizarAdmin(repositorio, usuario, id, datos = {}) {
  const actual = await repositorio.vialidadPorId(id);
  if (!actual) throw AppError.noEncontrado('Vialidad no encontrada');
  municipioDeVia(usuario, actual.municipioId);
  const via = datosDeVia(usuario, { ...actual, ...datos }, { crear: false });
  return repositorio.actualizarVialidad(id, {
    ...via,
    verificadaEn: new Date().toISOString(),
    verificadaPor: usuario.username || usuario.nombre || null
  });
}

export async function verificarAdmin(repositorio, usuario, id) {
  const actual = await repositorio.vialidadPorId(id);
  if (!actual) throw AppError.noEncontrado('Vialidad no encontrada');
  municipioDeVia(usuario, actual.municipioId);
  return repositorio.actualizarVialidad(id, {
    verificadaEn: new Date().toISOString(),
    verificadaPor: usuario.username || usuario.nombre || null
  });
}

export async function eliminarAdmin(repositorio, usuario, id) {
  const actual = await repositorio.vialidadPorId(id);
  if (!actual) throw AppError.noEncontrado('Vialidad no encontrada');
  municipioDeVia(usuario, actual.municipioId);
  await repositorio.eliminarVialidad(id);
  return { id, activo: false };
}

/** Importa KML/GeoJSON y fusiona por osm_id/clave sin borrar datos manuales. */
export async function importarAdmin(repositorio, usuario, datos = {}) {
  const municipioId = municipioDeVia(usuario, datos.municipioId || datos.municipio);
  const contenido = datos.contenido || datos.geojson || datos.kml;
  const vias = viasDesdeContenido(contenido, { municipioId, limite: 5000 });
  if (!vias.length) {
    throw AppError.solicitudInvalida('No se encontraron trazados o polígonos en el archivo');
  }
  const fuente = CLAVES_FUENTE.has(String(datos.fuente || '')) ? datos.fuente : null;
  if (fuente) vias.forEach((via) => { via.fuente = fuente; });
  const resultado = await repositorio.sincronizarVialidades(municipioId, vias, {
    reemplazar: datos.reemplazar === true || datos.reemplazar === 'true'
  });
  return {
    municipioId,
    total: resultado.total,
    creadas: resultado.creadas,
    actualizadas: resultado.actualizadas,
    reemplazar: datos.reemplazar === true || datos.reemplazar === 'true',
    fuente: fuente || vias[0]?.fuente || 'geojson',
    vialidades: vias.length
  };
}

/** Importa la red vehicular real del municipio desde OpenStreetMap. */
export async function importarOsmAdmin(repositorio, usuario, datos = {}) {
  const municipioId = municipioDeVia(usuario, datos.municipioId || datos.municipio);
  const municipio = await repositorio.municipioPorId(municipioId);
  if (!municipio) throw AppError.noEncontrado('Municipio no encontrado');
  const vias = await importarDesdeOsm(municipio, {
    radio: datos.radio || 6000,
    limite: datos.limite || 5000
  });
  if (!vias.length) {
    throw AppError.solicitudInvalida('OpenStreetMap no devolvió vialidades para ese municipio');
  }
  const resultado = await repositorio.sincronizarVialidades(municipioId, vias, {
    reemplazar: datos.reemplazar === true || datos.reemplazar === 'true'
  });
  return {
    municipioId,
    total: resultado.total,
    creadas: resultado.creadas,
    actualizadas: resultado.actualizadas,
    fuente: 'openstreetmap',
    vialidades: vias.length,
    reemplazar: datos.reemplazar === true || datos.reemplazar === 'true'
  };
}
