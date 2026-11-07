/** Consulta de la bitácora de auditoría. */
import { AppError } from '../utils/AppError.js';

const METODOS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function fechaDeFiltro(valor, campo) {
  const texto = String(valor || '').trim();
  if (!texto) return null;
  const dia = texto.slice(0, 10);
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!coincidencia) {
    throw AppError.solicitudInvalida(`El filtro ${campo} debe usar el formato AAAA-MM-DD`);
  }
  const fecha = new Date(Date.UTC(Number(coincidencia[1]), Number(coincidencia[2]) - 1, Number(coincidencia[3])));
  if (
    fecha.getUTCFullYear() !== Number(coincidencia[1]) ||
    fecha.getUTCMonth() !== Number(coincidencia[2]) - 1 ||
    fecha.getUTCDate() !== Number(coincidencia[3])
  ) {
    throw AppError.solicitudInvalida(`El filtro ${campo} no es una fecha válida`);
  }
  return dia;
}

/** Normaliza los filtros que comparten la tabla y el informe. */
export function filtrosDe(filtros = {}) {
  const metodo = String(filtros.metodo || '').toUpperCase();
  const desde = fechaDeFiltro(filtros.desde, 'desde');
  const hasta = fechaDeFiltro(filtros.hasta, 'hasta');
  if (desde && hasta && desde > hasta) {
    throw AppError.solicitudInvalida('La fecha inicial no puede ser posterior a la final');
  }
  return {
    username: filtros.username ? String(filtros.username).trim() : null,
    accion: filtros.accion ? String(filtros.accion).trim() : null,
    metodo: METODOS.has(metodo) ? metodo : null,
    desde,
    hasta
  };
}

export async function listar(repositorio, filtros = {}) {
  return repositorio.listarAuditoria({
    ...filtrosDe(filtros),
    limite: Math.min(Math.max(Number(filtros.limite) || 200, 1), 5000)
  });
}
