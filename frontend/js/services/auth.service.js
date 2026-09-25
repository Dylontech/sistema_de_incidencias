/** Servicio de autenticación (habla con /api/auth). */
import { api } from '../core/api.js';
import { sesion } from '../core/session.js';

export const authService = {
  /** Entrada ciudadana. El municipio elegido se conserva entre visitas. */
  entrarAnonimo({ municipioId } = {}) {
    return api.post('/auth/anonimo', {
      anonId: sesion.anonId(),
      municipioId: municipioId ?? sesion.municipioActivo?.id
    });
  },

  entrarFuncionario({ username, password, claveMunicipio }) {
    return api.post('/auth/funcionario', { username, password, claveMunicipio });
  },

  entrarAdmin({ username, password }) {
    return api.post('/auth/admin', { username, password });
  },

  /** Entrada de una cuenta ciudadana (correo + contraseña). */
  entrarCiudadano({ correo, password }) {
    return api.post('/auth/ciudadano', {
      correo,
      password,
      municipioId: sesion.municipioActivo?.id
    });
  },

  /**
   * Alta de cuenta ciudadana. `pseudonimo: true` pide un nombre generado en
   * lugar del nombre real (el servidor lo sortea).
   */
  registrarCiudadano({ correo, password, nombre, pseudonimo }) {
    return api.post('/auth/registro', {
      correo,
      password,
      nombre,
      pseudonimo: pseudonimo === true,
      municipioId: sesion.municipioActivo?.id
    });
  },

  /** Valida el token guardado y recupera la sesión (equivale a Auth.init). */
  yo() {
    return api.get('/auth/me');
  },

  cambiarMunicipio({ municipioId, clave }) {
    return api.post('/auth/municipio-activo', { municipioId, clave });
  }
};
