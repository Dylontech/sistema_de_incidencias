/** Servicio de la bitácora de auditoría. */
import { api } from '../core/api.js';

export const auditoriaService = {
  listar({ username = '', accion = '', desde = '', hasta = '', limite = 200 } = {}) {
    const params = new URLSearchParams();
    if (username) params.set('username', username);
    if (accion) params.set('accion', accion);
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    if (limite) params.set('limite', String(limite));
    const consulta = params.toString();
    return api.get(`/admin/auditoria${consulta ? `?${consulta}` : ''}`);
  }
};
