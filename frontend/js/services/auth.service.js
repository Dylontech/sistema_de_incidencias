/** Servicio de autenticación (habla con /api/auth). */
import { api } from '../core/api.js';
import { sesion } from '../core/session.js';

export const authService = {
  entrarAnonimo() {
    return api.post('/auth/anonimo', {
      anonId: sesion.anonId(),
      municipioId: sesion.municipioActivo?.id
    });
  },

  entrarFuncionario({ username, password, claveMunicipio }) {
    return api.post('/auth/funcionario', { username, password, claveMunicipio });
  },

  entrarAdmin({ username, password }) {
    return api.post('/auth/admin', { username, password });
  },

  /** Valida el token guardado y recupera la sesión (equivale a Auth.init). */
  yo() {
    return api.get('/auth/me');
  },

  cambiarMunicipio({ municipioId, clave }) {
    return api.post('/auth/municipio-activo', { municipioId, clave });
  }
};
