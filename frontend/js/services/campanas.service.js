/** Servicio de campañas de promoción y suscripciones (solo administrador). */
import { api } from '../core/api.js';

export const campanasService = {
  resumen: () => api.get('/admin/campanas/resumen'),
  listar: () => api.get('/admin/campanas'),
  detalle: (id) => api.get(`/admin/campanas/${encodeURIComponent(id)}`),
  crear: (datos) => api.post('/admin/campanas', datos),
  actualizar: (id, datos) => api.put(`/admin/campanas/${encodeURIComponent(id)}`, datos),
  prueba: (id, correo) =>
    api.post(`/admin/campanas/${encodeURIComponent(id)}/prueba`, { correo }),
  enviar: (id) => api.post(`/admin/campanas/${encodeURIComponent(id)}/enviar`),
  suscripciones: (estado) =>
    api.get(`/admin/suscripciones${estado ? `?estado=${encodeURIComponent(estado)}` : ''}`)
};
