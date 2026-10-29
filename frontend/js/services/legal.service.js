/** Servicio de documentos legales. */
import { api } from '../core/api.js';

export const legalService = {
  publicados: () => api.get('/legal'),
  publicado: (clave) => api.get(`/legal/${clave}`),
  listarAdmin: () => api.get('/admin/legal'),
  obtenerAdmin: (clave) => api.get(`/admin/legal/${clave}`),
  guardarBorrador: (clave, datos) => api.put(`/admin/legal/${clave}/borrador`, datos),
  publicar: (clave) => api.post(`/admin/legal/${clave}/publicar`, {}),
  restaurar: (clave, version) => api.post(`/admin/legal/${clave}/restaurar/${version}`, {}),
  historial: (clave) => api.get(`/admin/legal/${clave}/historial`)
};
