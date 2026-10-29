/** Servicio de solicitudes de acceso (admin). */
import { api } from '../core/api.js';

export const solicitudesAccesoService = {
  listar() {
    return api.get('/admin/solicitudes-acceso');
  },
  aprobar(id) {
    return api.post(`/admin/solicitudes-acceso/${id}/aprobar`);
  },
  rechazar(id, motivo) {
    return api.post(`/admin/solicitudes-acceso/${id}/rechazar`, { motivo });
  }
};
