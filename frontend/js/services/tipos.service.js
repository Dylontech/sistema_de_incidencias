/** Servicio de tipos de incidencia. */
import { api } from '../core/api.js';

export const tiposService = {
  listar() {
    return api.get('/tipos');
  },
  crear({ nombre, icono }) {
    return api.post('/tipos', { nombre, icono });
  },
  eliminar(id) {
    return api.del(`/tipos/${id}`);
  }
};
