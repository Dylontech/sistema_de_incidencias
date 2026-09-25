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

async function base(repositorio, usuario, municipioId = null) {
  if (!esEmpleado(usuario)) {
    throw AppError.prohibido('Los informes solo están disponibles para funcionarios y administradores');
  }
  const incidencias = await listar(repositorio, usuario, { municipioId });
  const tipos = await repositorio.todosLosTipos();
  return { incidencias, tipos };
}

/** Tarjetas del panel de administración. */
export async function panelAdmin(repositorio, usuario, municipioId = null) {
  const { incidencias, tipos } = await base(repositorio, usuario, municipioId);
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

  return { ...conteo, peligrosas: contarPeligrosas(incidencias), porTipo };
}

/** Tarjetas y tabla resumen del modal de informes. */
export async function informes(repositorio, usuario, municipioId = null) {
  const { incidencias, tipos } = await base(repositorio, usuario, municipioId);
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

  return { ...conteo, peligrosas: contarPeligrosas(incidencias), porTipo };
}

/**
 * Datos para exportar (CSV/JSON/imprimible los formatea el frontend,
 * igual que en el monolito).
 */
export async function exportacion(repositorio, usuario, municipioId = null) {
  const { incidencias, tipos } = await base(repositorio, usuario, municipioId);
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
