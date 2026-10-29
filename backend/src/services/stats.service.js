/**
 * SERVICIO: Estadísticas y reportes.
 * Las agregaciones se calculan en el servidor (antes se hacían en el navegador
 * recorriendo todo el localStorage, y sin filtrar por municipio).
 */
import { alcanceDe, esEmpleado } from './alcance.service.js';
import { AppError } from '../utils/AppError.js';
import { listar } from './incidencias.service.js';
import { contarPorEstado, contarPeligrosas } from './estado.service.js';
import { plantillaInforme } from './configuracion.service.js';
import { diasDesde } from '../utils/fechas.js';

/**
 * Base de los informes.
 *
 * Las publicaciones retiradas por moderación no cuentan como trabajo del
 * municipio: se apartan y se informan como «ocultas». El respaldo (exportación)
 * sí las lleva, porque es una copia de la base y el dato de moderación viaja
 * con el reporte.
 */
function lista(valor) {
  if (!valor) return [];
  const lista = Array.isArray(valor) ? valor : String(valor).split(',');
  return [...new Set(lista.map((v) => String(v).trim()).filter(Boolean))];
}

/** Acepta la firma antigua (id de municipio) y la nueva (filtros). */
function normalizarFiltros(entrada) {
  if (!entrada) return { municipios: [], estados: [], incluirOcultas: false };
  if (typeof entrada === 'string') return { municipios: [entrada], estados: [], incluirOcultas: false };
  return {
    municipios: lista(entrada.municipios || entrada.municipio || entrada.municipioId),
    estados: lista(entrada.estados || entrada.estadoEntidad),
    incluirOcultas: entrada.incluirOcultas === true
  };
}

async function base(repositorio, usuario, filtrosEntrada = null, opciones = {}) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Los informes solo están disponibles para funcionarios y administradores');
  }
  const filtros = normalizarFiltros(filtrosEntrada);
  const incluirOcultas = opciones.incluirOcultas ?? filtros.incluirOcultas;
  // Se consulta todo el ámbito permitido y luego se filtra por la selección:
  // así un administrador puede comparar varios municipios o estados sin
  // saltarse el recorte territorial que aplica `listar`.
  const todas = await listar(repositorio, usuario, {});
  const catalogoMunicipios = await repositorio.todosMunicipios();
  const estadoDeMunicipio = new Map(catalogoMunicipios.map((m) => [String(m.id), m.estado]));
  const estadoEntidadDe = (incidencia) =>
    incidencia.estadoEntidad || estadoDeMunicipio.get(String(incidencia.municipioId)) || '';
  const seleccion = new Set(filtros.municipios);
  const estadosSeleccionados = new Set(filtros.estados);
  const filtradas = todas.filter((i) => {
    if (seleccion.size && !seleccion.has(String(i.municipioId))) return false;
    if (estadosSeleccionados.size && !estadosSeleccionados.has(estadoEntidadDe(i))) return false;
    return true;
  });
  const tipos = await repositorio.todosLosTipos();
  const ocultas = filtradas.filter((i) => i.oculta === true);
  const incidencias = incluirOcultas ? filtradas : filtradas.filter((i) => i.oculta !== true);
  return { incidencias, tipos, ocultas, catalogoMunicipios };
}

/** Días entre la fecha del reporte y su resolución (null si no aplica). */
function diasResolucion(incidencia) {
  if (!incidencia?.fechaResolucion) return null;
  const inicio = new Date(incidencia.fecha).getTime();
  const fin = new Date(incidencia.fechaResolucion).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin < inicio) return null;
  return Number(((fin - inicio) / 86400000).toFixed(2));
}

function mediana(valores = []) {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2
    ? orden[mitad]
    : Number(((orden[mitad - 1] + orden[mitad]) / 2).toFixed(2));
}

/** Agregados de tiempo de resolución para el panel y la comparación. */
function tiemposDeResolucion(incidencias = [], municipios = []) {
  const porId = new Map(municipios.map((m) => [String(m.id), m]));
  const resueltas = incidencias
    .map((i) => ({ ...i, diasResolucion: diasResolucion(i) }))
    .filter((i) => i.diasResolucion !== null);
  const valores = resueltas.map((i) => i.diasResolucion);
  return {
    muestra: valores.length,
    promedio: valores.length
      ? Number((valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2))
      : 0,
    mediana: mediana(valores),
    minimo: valores.length ? Math.min(...valores) : 0,
    maximo: valores.length ? Math.max(...valores) : 0,
    detalle: resueltas
      .sort((a, b) => b.diasResolucion - a.diasResolucion)
      .slice(0, 200)
      .map((i) => ({
        id: i.id,
        titulo: i.titulo,
        tipoId: i.tipoId,
        municipioId: i.municipioId,
        municipio: porId.get(String(i.municipioId))?.nombre || i.municipioId,
        estadoEntidad: porId.get(String(i.municipioId))?.estado || '',
        fecha: i.fecha,
        fechaResolucion: i.fechaResolucion,
        diasResolucion: i.diasResolucion
      }))
  };
}

/** Comparación por municipio o entidad para las tarjetas del panel. */
function comparativo(incidencias, municipios, agruparPor = 'municipio') {
  const porId = new Map(municipios.map((m) => [String(m.id), m]));
  const grupos = new Map();
  for (const inc of incidencias) {
    const municipio = porId.get(String(inc.municipioId));
    const clave = agruparPor === 'estado' ? municipio?.estado || inc.estadoEntidad || 'Sin estado' : municipio?.nombre || inc.municipioId;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(inc);
  }
  return [...grupos.entries()]
    .map(([nombre, lista]) => {
      const resueltas = lista.filter((i) => i.estado === 'resuelta');
      const tiempos = resueltas
        .map((i) => diasResolucion(i))
        .filter((d) => d !== null);
      return {
        nombre,
        total: lista.length,
        resueltas: resueltas.length,
        pendientes: lista.filter((i) => i.estado !== 'resuelta').length,
        tasaResolucion: lista.length
          ? Number(((resueltas.length / lista.length) * 100).toFixed(1))
          : 0,
        promedioResolucion: tiempos.length
          ? Number((tiempos.reduce((a, b) => a + b, 0) / tiempos.length).toFixed(2))
          : 0,
        criticas: lista.filter((i) => i.estado !== 'resuelta' && Number(i.dias) > 30).length
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Tarjetas del panel de administración. */
export async function panelAdmin(repositorio, usuario, filtros = null) {
  const { incidencias, tipos, ocultas, catalogoMunicipios: municipios } = await base(
    repositorio,
    usuario,
    filtros
  );
  const conteo = contarPorEstado(incidencias);

  const porTipo = tipos
    .map((tipo) => {
      const deEseTipo = incidencias.filter((i) => i.tipoId === tipo.id);
      const resueltas = deEseTipo.filter((i) => i.estado === 'resuelta').length;
      return {
        tipoId: tipo.id,
        nombre: tipo.nombre,
        icono: tipo.icono,
        total: deEseTipo.length,
        resueltas,
        pendientes: deEseTipo.length - resueltas,
        porcentaje: conteo.total > 0 ? Number(((deEseTipo.length / conteo.total) * 100).toFixed(1)) : 0
      };
    })
    .filter((fila) => fila.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    ...conteo,
    peligrosas: contarPeligrosas(incidencias),
    ocultas: ocultas.length,
    porTipo,
    comparativo: comparativo(incidencias, municipios),
    comparativoEstados: comparativo(incidencias, municipios, 'estado'),
    tiempos: tiemposDeResolucion(incidencias, municipios)
  };
}

/** Tarjetas y tabla resumen del modal de informes. */
export async function informes(repositorio, usuario, filtros = null) {
  const { incidencias, tipos, ocultas } = await base(repositorio, usuario, filtros);
  const conteo = contarPorEstado(incidencias);

  const porTipo = tipos
    .map((tipo) => {
      const deEseTipo = incidencias.filter((i) => i.tipoId === tipo.id);
      const resueltas = deEseTipo.filter((i) => i.estado === 'resuelta').length;
      const dias = deEseTipo.map((i) => diasDesde(i.fecha));
      return {
        tipoId: tipo.id,
        nombre: tipo.nombre,
        icono: tipo.icono,
        total: deEseTipo.length,
        resueltas,
        pendientes: deEseTipo.length - resueltas,
        promedioDias: dias.length ? Number((dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(1)) : 0
      };
    })
    .filter((fila) => fila.total > 0)
    .sort((a, b) => b.total - a.total);

  return { ...conteo, peligrosas: contarPeligrosas(incidencias), ocultas: ocultas.length, porTipo };
}

/**
 * Datos para exportar (CSV/JSON/imprimible los formatea el frontend,
 * igual que en el monolito).
 */
export async function exportacion(repositorio, usuario, municipioId = null) {
  const { incidencias, tipos } = await base(repositorio, usuario, municipioId, { incluirOcultas: true });
  const municipios = await repositorio.todosMunicipios();
  const usuarios = await repositorio.todosLosUsuarios();
  const zonas = await repositorio.todasLasZonas();

  // El respaldo no puede convertirse en una fuga: solo viaja el catálogo y el
  // personal del ámbito del solicitante. Los ciudadanos nunca se exportan.
  const alcance = alcanceDe(usuario);
  const municipiosVisibles = municipios.filter((m) => {
    if (alcance.todos) return true;
    if (alcance.municipios) return alcance.municipios.has(m.id);
    if (alcance.estados) return alcance.estados.has(m.estado);
    return false;
  });
  const idsVisibles = new Set(municipiosVisibles.map((m) => m.id));
  const personalVisible = usuarios.filter((u) => {
    if (u.rol === 'ciudadano' || u.rol === 'anonimo') return false;
    if (alcance.todos) return true;
    return u.municipioId ? idsVisibles.has(u.municipioId) : u.rol === 'admin';
  });

  return {
    exportado: new Date().toISOString(),
    incidencias,
    tipos,
    municipios: municipiosVisibles.map(({ clave, ...resto }) => resto),
    usuarios: personalVisible.map(({ passwordHash, ...resto }) => resto),
    zonas: zonas.filter((z) => idsVisibles.has(z.municipioId)),
    informePlantilla: await plantillaInforme(repositorio)
  };
}
