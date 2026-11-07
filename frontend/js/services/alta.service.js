/** Solicitudes de alta de cuentas del personal. */
import { api } from '../core/api.js';

export const altaService = {
  mias() {
    return api.get('/alta/solicitudes/mias');
  },
  crear(datos) {
    return api.post('/alta/solicitudes', datos);
  },
  listar(filtros = {}) {
    const query = new URLSearchParams(
      Object.entries(filtros).filter(([, valor]) => valor !== undefined && valor !== '')
    ).toString();
    return api.get(`/alta/solicitudes${query ? `?${query}` : ''}`);
  },
  aprobar(id, datos = {}) {
    const cuerpo = typeof datos === 'string' ? { respuesta: datos } : datos;
    return api.post(`/alta/solicitudes/${id}/aprobar`, {
      respuesta: 'Aprobada desde el panel',
      ...cuerpo
    });
  },
  rechazar(id, respuesta = '') {
    return api.post(`/alta/solicitudes/${id}/rechazar`, { respuesta });
  }
};
