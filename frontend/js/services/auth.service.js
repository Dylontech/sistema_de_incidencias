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

  /**
   * Entrada del personal. `claveAcceso` es la clave que genera el panel al
   * crear la cuenta (cubre uno o varios municipios); `claveMunicipio` es la
   * clave geoestadística que usaban las cuentas antiguas. El servidor prueba
   * primero la primera y, si no lo es, la segunda.
   */
  entrarFuncionario({ username, password, claveMunicipio, claveAcceso }) {
    return api.post('/auth/funcionario', { username, password, claveMunicipio, claveAcceso });
  },

  entrarAdmin({ username, password }) {
    return api.post('/auth/admin', { username, password });
  },

  /** Entrada de una cuenta ciudadana con su nombre, pseudónimo o correo. */
  entrarCiudadano({ identificador, nombre, password }) {
    return api.post('/auth/ciudadano', {
      identificador: identificador || nombre,
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

  /** Reenvía el enlace de confirmación de correo. */
  reenviarVerificacion(correo) {
    return api.post('/auth/cuenta/reenviar-verificacion', { correo });
  },

  /** Valida el token guardado y recupera la sesión (equivale a Auth.init). */
  yo() {
    return api.get('/auth/me');
  },

  cambiarMunicipio({ municipioId, clave }) {
    return api.post('/auth/municipio-activo', { municipioId, clave });
  }
};
