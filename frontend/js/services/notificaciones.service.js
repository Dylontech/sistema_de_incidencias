/** Servicio de notificaciones. */
import { api } from '../core/api.js';

export const notificacionesService = {
  listar() {
    return api.get('/notificaciones');
  },
  marcarLeida(id) {
    return api.patch(`/notificaciones/${id}/leida`);
  },
  marcarTodas() {
    return api.post('/notificaciones/marcar-todas');
  },
  eliminar(id) {
    return api.del(`/notificaciones/${id}`);
  }
};
