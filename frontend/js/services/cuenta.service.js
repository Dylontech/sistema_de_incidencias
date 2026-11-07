/** Servicio de la propia cuenta (autoservicio y clave de personal). */
import { api } from '../core/api.js';

export const cuentaService = {
  estado() {
    return api.get('/cuenta');
  },
  cambiarCorreo({ correo, password }) {
    return api.post('/cuenta/correo', { correo, password });
  },
  cambiarPassword({ passwordActual, passwordNueva }) {
    return api.post('/cuenta/password', { passwordActual, passwordNueva });
  },
  congelar({ dias, password }) {
    return api.post('/cuenta/congelar', { dias, password });
  },
  eliminar({ password, confirmacion }) {
    return api.post('/cuenta/eliminar', { password, confirmacion });
  },
  clave() {
    return api.get('/cuenta/clave');
  },
  solicitarRenovacion(motivo = '') {
    return api.post('/cuenta/clave/solicitar-renovacion', { motivo });
  }
};
