/** Servicio de solicitudes de permisos del personal. */
import { api } from '../core/api.js';

export const permisosService = {
  mias() {
    return api.get('/permisos/solicitudes/mias');
  },
  crear(datos) {
    return api.post('/permisos/solicitudes', datos);
  },
  solicitudes(estado = '') {
    return api.get(`/permisos/solicitudes${estado ? `?estado=${encodeURIComponent(estado)}` : ''}`);
  },
  aprobar(id, respuesta = '') {
    return api.post(`/permisos/solicitudes/${id}/aprobar`, { respuesta });
  },
  rechazar(id, respuesta = '') {
    return api.post(`/permisos/solicitudes/${id}/rechazar`, { respuesta });
  }
};
