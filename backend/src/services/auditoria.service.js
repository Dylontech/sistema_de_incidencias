/** Consulta de la bitácora de auditoría. */
export async function listar(repositorio, filtros = {}) {
  return repositorio.listarAuditoria({
    limite: Math.min(Math.max(Number(filtros.limite) || 200, 1), 500),
    username: filtros.username ? String(filtros.username).trim() : null,
    accion: filtros.accion ? String(filtros.accion).trim() : null,
    desde: filtros.desde || null,
    hasta: filtros.hasta || null
  });
}
