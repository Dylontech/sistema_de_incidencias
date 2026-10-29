/** Servicio del simulador de acciones (admin maestro). */
import { api } from '../core/api.js';

export const simuladorService = {
  catalogo: (rol = '') => api.get(`/admin/simulador/acciones${rol ? `?rol=${encodeURIComponent(rol)}` : ''}`),
  sesiones: () => api.get('/admin/simulador/sesiones'),
  abrir: (datos) => api.post('/admin/simulador/sesiones', datos),
  detalle: (id) => api.get(`/admin/simulador/sesiones/${id}`),
  ejecutar: (id, accionId, datos) =>
    api.post(`/admin/simulador/sesiones/${id}/acciones/${accionId}`, datos || {}),
  cerrar: (id) => api.post(`/admin/simulador/sesiones/${id}/cerrar`, {}),
  revertir: (id) => api.post(`/admin/simulador/sesiones/${id}/revertir`, {}),
  revertirTodas: () => api.post('/admin/simulador/revertir-todo', {})
};
