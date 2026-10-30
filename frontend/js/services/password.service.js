/** Solicitudes de cambio de contraseña. */
import { api } from '../core/api.js';

export const passwordService = {
  mias() {
    return api.get('/password/solicitudes/mias');
  },
  crear(datos) {
    return api.post('/password/solicitudes', datos);
  },
  listar(filtros = {}) {
    const query = new URLSearchParams(
      Object.entries(filtros).filter(([, valor]) => valor !== undefined && valor !== '')
    ).toString();
    return api.get(`/password/solicitudes${query ? `?${query}` : ''}`);
  },
  aprobar(id, respuesta = '') {
    return api.post(`/password/solicitudes/${id}/aprobar`, { respuesta });
  },
  rechazar(id, respuesta = '') {
    return api.post(`/password/solicitudes/${id}/rechazar`, { respuesta });
  }
};
