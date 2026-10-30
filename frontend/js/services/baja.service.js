/** Solicitudes de baja de cuentas del personal. */
import { api } from '../core/api.js';

export const bajaService = {
  mias() {
    return api.get('/baja/solicitudes/mias');
  },
  crear(datos) {
    return api.post('/baja/solicitudes', datos);
  },
  listar(filtros = {}) {
    const query = new URLSearchParams(
      Object.entries(filtros).filter(([, valor]) => valor !== undefined && valor !== '')
    ).toString();
    return api.get(`/baja/solicitudes${query ? `?${query}` : ''}`);
  },
  aprobar(id, respuesta = '') {
    return api.post(`/baja/solicitudes/${id}/aprobar`, { respuesta });
  },
  rechazar(id, respuesta = '') {
    return api.post(`/baja/solicitudes/${id}/rechazar`, { respuesta });
  }
};
