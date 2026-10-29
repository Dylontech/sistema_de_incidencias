/** Servicio de sesiones conectadas. */
import { api } from '../core/api.js';

export const sesionesService = {
  listar() {
    return api.get('/admin/sesiones');
  },
  revocar(id) {
    return api.del(`/admin/sesiones/${id}`);
  }
};
