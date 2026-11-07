/** Servicio de claves de acceso multi-municipio. */
import { api } from '../core/api.js';

export const clavesService = {
  listar() {
    return api.get('/admin/claves');
  },
  crear(datos) {
    return api.post('/admin/claves', datos);
  },
  actualizar(id, datos) {
    return api.patch(`/admin/claves/${id}`, datos);
  },
  renovar(id, datos) {
    return api.post(`/admin/claves/${id}/renovar`, datos);
  },
  renovaciones(estado = 'pendiente') {
    return api.get(`/admin/claves/renovaciones?estado=${encodeURIComponent(estado)}`);
  },
  resolverRenovacion(id, aprobar, datos = {}) {
    return api.post(`/admin/claves/renovaciones/${id}/${aprobar ? 'aprobar' : 'rechazar'}`, datos);
  },
  revocar(id) {
    return api.post(`/admin/claves/${id}/revocar`, {});
  },
  eliminar(id) {
    return api.del(`/admin/claves/${id}`);
  },
  guardarNotificaciones(id, datos) {
    return api.put(`/admin/claves/${id}/notificaciones`, datos);
  },
  revocarNotificaciones(id) {
    return api.post(`/admin/claves/${id}/notificaciones/revocar`, {});
  },
  reactivarNotificaciones(id) {
    return api.post(`/admin/claves/${id}/notificaciones/reactivar`, {});
  }
};
