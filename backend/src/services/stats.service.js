/**
 * SERVICIO: Estadísticas y reportes.
 * Las agregaciones se calculan en el servidor (antes se hacían en el navegador
 * recorriendo todo el localStorage, y sin filtrar por municipio).
 */
import { esEmpleado } from './alcance.service.js';
import { AppError } from '../utils/AppError.js';
import { listar } from './incidencias.service.js';
import { contarPorEstado, contarPeligrosas } from './estado.service.js';
import { diasDesde } from '../utils/fechas.js';

/**
 * Base de los informes.
 *
 * Las publicaciones retiradas por moderación no cuentan como trabajo del
 * municipio: se apartan y se informan como «ocultas». El respaldo (exportación)
 * sí las lleva, porque es una copia de la base y el dato de moderación viaja
 * con el reporte.
 */
async function base(repositorio, usuario, municipioId = null, { incluirOcultas = false } = {}) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Los informes solo están disponibles para funcionarios y administradores');
  }
  const todas = await listar(repositorio, usuario, { municipioId });
  const tipos = await repositorio.todosLosTipos();
  const ocultas = todas.filter((i) => i.oculta === true);
  const incidencias = incluirOcultas ? todas : todas.filter((i) => i.oculta !== true);
  return { incidencias, tipos, ocultas };
}

/** Tarjetas del panel de administración. */
export async function panelAdmin(repositorio, usuario, municipioId = null) {
  const { incidencias, tipos, ocultas } = await base(repositorio, usuario, municipioId);
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

  return { ...conteo, peligrosas: contarPeligrosas(incidencias), ocultas: ocultas.length, porTipo };
}

/** Tarjetas y tabla resumen del modal de informes. */
export async function informes(repositorio, usuario, municipioId = null) {
  const { incidencias, tipos, ocultas } = await base(repositorio, usuario, municipioId);
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

  return {
    exportado: new Date().toISOString(),
    incidencias,
    tipos,
    municipios: municipios.map(({ clave, ...resto }) => resto),
    usuarios: usuarios.map(({ passwordHash, ...resto }) => resto),
    zonas
  };
}
