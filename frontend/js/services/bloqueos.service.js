/** Bloqueos personales entre cuentas (dejar de recibir mensajes). */
import { api } from '../core/api.js';

export const bloqueosService = {
  listar() {
    return api.get('/bloqueos');
  },
  /** `username` o `usuarioId` de la cuenta que se deja de recibir. */
  bloquear(datos) {
    return api.post('/bloqueos', datos);
  },
  desbloquear(identificador) {
    return api.del(`/bloqueos/${encodeURIComponent(identificador)}`);
  }
};
