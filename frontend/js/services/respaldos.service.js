/** Servicio de respaldos. */
import { api, BASE } from '../core/api.js';

function consulta(filtros = {}) {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') params.set(clave, valor);
  }
  const texto = params.toString();
  return texto ? `?${texto}` : '';
}

export const respaldosService = {
  listar: (filtros) => api.get(`/admin/respaldos${consulta(filtros)}`),
  crear: (datos) => api.post('/admin/respaldos', datos),
  detalle: (id) => api.get(`/admin/respaldos/${id}`),
  restaurar: (id, confirmacion) =>
    api.post(`/admin/respaldos/${id}/restaurar`, { confirmacion }),
  eliminar: (id) => api.del(`/admin/respaldos/${id}`),
  estadisticas: () => api.get('/admin/respaldos/estadisticas'),
  urlDescarga: (id) => `${BASE}/admin/respaldos/${id}/descargar`
};
