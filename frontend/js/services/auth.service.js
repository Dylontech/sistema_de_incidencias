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
  },

  /* --------------------- ciclo de vida de la cuenta ---------------------- */

  /**
   * Confirma el correo con el código que llegó en el enlace.
   * El enlace apunta a `/?verificar=<código>`, así que el código lo lee
   * `main.js` de la dirección y lo pasa aquí.
   */
  verificarCorreo(token) {
    return api.post('/auth/verificar', { token });
  },

  /**
   * Pide el enlace para elegir una contraseña nueva.
   * La respuesta es la misma exista o no la cuenta: no se puede usar esta
   * pantalla para averiguar qué correos están registrados.
   */
  olvide({ correo }) {
    return api.post('/auth/olvide', { correo });
  },

  /** Elige la contraseña nueva desde el enlace del correo. */
  restablecer({ token, password }) {
    return api.post('/auth/restablecer', { token, password });
  },

  /** Cambio de contraseña desde dentro de la sesión (pide la actual). */
  cambiarPassword({ actual, nueva }) {
    return api.post('/cuenta/password', { actual, nueva });
  },

  /**
   * Pide otro enlace de confirmación sin sesión (desde la pantalla de acceso).
   * Hace falta porque quien no ha confirmado el correo tampoco puede entrar.
   */
  reenviarVerificacion(correo) {
    return api.post('/auth/reenviar', { correo });
  },

  /** Pide otro enlace de confirmación desde la cuenta ya abierta. */
  reenviarVerificacionDeCuenta() {
    return api.post('/cuenta/correo/reenviar');
  },

  /** Todo lo que el sistema guarda de la cuenta, para descargarlo. */
  datosDeLaCuenta() {
    return api.get('/cuenta/datos');
  },

  /** Baja de la cuenta: anonimiza sus reportes y borra sus avisos. */
  eliminarCuenta({ password }) {
    // El cliente expone `del` (no `delete`: es palabra reservada en JS).
    return api.del('/cuenta', { password });
  }
};
