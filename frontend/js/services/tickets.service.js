/** Servicio de tickets (bandeja administrativa). */
import { api } from '../core/api.js';

export const ticketsService = {
  listar(filtros = {}) {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([clave, valor]) => {
      if (valor !== null && valor !== undefined && valor !== '') {
        params.set(clave, valor);
      }
    });
    const consulta = params.toString();
    return api.get(`/tickets${consulta ? `?${consulta}` : ''}`);
  },
  obtener(id) {
    return api.get(`/tickets/${id}`);
  },
  crear(datos) {
    return api.post('/tickets', datos);
  },
  responder(id, texto, { interno = false } = {}) {
    return api.post(`/tickets/${id}/mensajes`, { texto, interno });
  },
  staff() {
    return api.get('/tickets/staff');
  },
  cambiarEstado(id, estado) {
    return api.patch(`/tickets/${id}/estado`, { estado });
  },
  asignar(id, asignadoA) {
    return api.patch(`/tickets/${id}/asignacion`, { asignadoA });
  },
  listarBandeja(filtros = {}) {
    return this.listar(filtros);
  },
  cambiarPrioridad(id, prioridad) {
    return api.patch(`/tickets/${id}/prioridad`, { prioridad });
  },
  /** Reglas de asignación automática (solo administrador). */
  reglas() {
    return api.get('/admin/tickets/reglas');
  },
  crearRegla(datos) {
    return api.post('/admin/tickets/reglas', datos);
  },
  eliminarRegla(id) {
    return api.del(`/admin/tickets/reglas/${id}`);
  }
};
