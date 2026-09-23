/**
 * Sesión del cliente.
 *
 * - El token y los datos del usuario viven en localStorage: la sesión persiste
 *   entre visitas, de modo que el ciudadano (y el personal que ya entró) no
 *   tienen que volver a identificarse en este dispositivo. Es la decisión que
 *   tomó la versión nueva del monolito, que guardaba `inc_sesion_v1` en
 *   localStorage en lugar de sessionStorage.
 * - `anonId` también se conserva en localStorage para reconocer al ciudadano
 *   anónimo y mostrarle sus propios reportes.
 *
 * Nota: guardar el token en localStorage lo expone a XSS igual que cualquier
 * dato del navegador; aquí se acepta porque la sesión ciudadana no maneja
 * información sensible. Con `HttpOnly` cookies sería más estricto.
 */
import { token } from './api.js';

const CLAVE_SESION = 'inc_sesion_v2';
const CLAVE_ANON = 'inc_anon_id_v2';

function nuevoAnonId() {
  return (crypto.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`)
    .replace(/-/g, '')
    .slice(0, 32);
}

export const sesion = {
  datos: null, // { usuario, municipioActivo }

  cargar() {
    try {
      this.datos = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null');
    } catch {
      this.datos = null;
    }
    if (!token.leer()) this.datos = null;
    return this.datos;
  },

  guardar(respuesta) {
    token.guardar(respuesta.token);
    this.datos = {
      usuario: respuesta.usuario,
      municipioActivo: respuesta.municipioActivo || null
    };
    localStorage.setItem(CLAVE_SESION, JSON.stringify(this.datos));
    if (respuesta.anonId) localStorage.setItem(CLAVE_ANON, respuesta.anonId);
    return this.datos;
  },

  actualizarMunicipio(municipio) {
    if (!this.datos) return;
    this.datos.municipioActivo = municipio;
    localStorage.setItem(CLAVE_SESION, JSON.stringify(this.datos));
  },

  limpiar() {
    token.borrar();
    this.datos = null;
    localStorage.removeItem(CLAVE_SESION);
  },

  get usuario() {
    return this.datos?.usuario || null;
  },

  get municipioActivo() {
    return this.datos?.municipioActivo || null;
  },

  get rol() {
    return this.usuario?.rol || null;
  },

  esEmpleado() {
    return this.rol === 'funcionario' || this.rol === 'admin';
  },

  esAdmin() {
    return this.rol === 'admin';
  },

  esAnonimo() {
    return this.rol === 'anonimo';
  },

  /** Identificador estable del ciudadano anónimo. */
  anonId() {
    let id = localStorage.getItem(CLAVE_ANON);
    if (!id) {
      id = nuevoAnonId();
      localStorage.setItem(CLAVE_ANON, id);
    }
    return id;
  }
};
