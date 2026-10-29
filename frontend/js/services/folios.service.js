/** Servicio de historial de folios. */
import { api } from '../core/api.js';

function consulta(filtros = {}) {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') params.set(clave, valor);
  }
  const texto = params.toString();
  return texto ? `?${texto}` : '';
}

export const foliosService = {
  mios: (filtros) => api.get(`/folios/mios${consulta(filtros)}`),
  todos: (filtros) => api.get(`/admin/folios${consulta(filtros)}`),
  detalle: (folio) => api.get(`/folios/${encodeURIComponent(folio)}`)
};
