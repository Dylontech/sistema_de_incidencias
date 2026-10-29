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
  },
  historial(filtros = {}) {
    const params = new URLSearchParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') params.set(clave, valor);
    }
    const texto = params.toString();
    return api.get(`/notificaciones/historial${texto ? `?${texto}` : ''}`);
  },
  restaurar(id) {
    return api.patch(`/notificaciones/${id}/restaurar`);
  },
  archivarTodas() {
    return api.post('/notificaciones/archivar-todas');
  },
  /** Preferencias de avisos de incidencias nuevas (solo personal). */
  preferencias() {
    return api.get('/notificaciones/preferencias');
  },
  guardarPreferencias(datos) {
    return api.put('/notificaciones/preferencias', datos);
  },

  /** Configuración global por evento (solo administrador). */
  configuracion() {
    return api.get('/admin/notificaciones/config');
  },
  guardarConfiguracion(evento, datos) {
    return api.put(`/admin/notificaciones/config/${encodeURIComponent(evento)}`, datos);
  },
  probar() {
    return api.post('/admin/notificaciones/probar');
  }
};
