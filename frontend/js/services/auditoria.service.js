/** Servicio de la bitácora de auditoría. */
import { api } from '../core/api.js';

function parametros(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.username) params.set('username', filtros.username);
  if (filtros.metodo) params.set('metodo', filtros.metodo);
  if (filtros.accion) params.set('accion', filtros.accion);
  if (filtros.desde) params.set('desde', filtros.desde);
  if (filtros.hasta) params.set('hasta', filtros.hasta);
  if (filtros.limite) params.set('limite', String(filtros.limite));
  return params.toString();
}

export const auditoriaService = {
  listar(filtros = {}) {
    const consulta = parametros(filtros);
    return api.get(`/admin/auditoria${consulta ? `?${consulta}` : ''}`);
  },
  informe(filtros = {}, formato = 'pdf') {
    const consulta = parametros(filtros);
    const separador = consulta ? '&' : '';
    return formato === 'csv'
      ? api.texto(`/admin/auditoria/informe?${consulta}${separador}formato=csv`)
      : api.blob(`/admin/auditoria/informe?${consulta}${separador}formato=pdf`);
  }
};
