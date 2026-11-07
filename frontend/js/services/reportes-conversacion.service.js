/** Reportes de conversación (bandeja y moderación). */
import { api } from '../core/api.js';

export const reportesConversacionService = {
  contexto(canal, conversacionId) {
    const query = new URLSearchParams({ canal, conversacionId }).toString();
    return api.get(`/reportes-conversacion/contexto?${query}`);
  },
  crear(datos) {
    return api.post('/reportes-conversacion', datos);
  },
  listar(filtros = {}) {
    const query = new URLSearchParams(
      Object.entries(filtros).filter(([, valor]) => valor !== undefined && valor !== '')
    ).toString();
    return api.get(`/reportes-conversacion${query ? `?${query}` : ''}`);
  },
  resolver(id, datos) {
    return api.patch(`/reportes-conversacion/${id}/resolver`, datos);
  },
  revertir(id) {
    return api.patch(`/reportes-conversacion/${id}/revertir`, {});
  }
};
