/**
 * Consentimiento legal: términos y aviso de privacidad.
 *
 * El servidor es la fuente de verdad: guarda una aceptación por identidad
 * (`userKey`) y versión. `localStorage` solo conserva el municipio recordado y
 * una copia de la última aceptación para poder arrancar sin repetir la lectura
 * cuando la red falla.
 */
import { api } from './api.js';

const CLAVE = 'inc_consentimiento_v1';

let estado = {
  aceptada: false,
  aceptadoEn: null,
  versiones: { terminos: 0, privacidad: 0 },
  documentos: []
};

function leerLocal() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) || 'null');
  } catch {
    return null;
  }
}

function escribirLocal({ municipioId = null } = {}) {
  const anterior = leerLocal() || {};
  // La marca antigua `version` (texto de la versión del monolito) ya no se usa;
  // se retira para no confundir el estado con el par versionTerminos/Privacidad.
  const { version: _versionAntigua, ...resto } = anterior;
  const registro = {
    ...resto,
    versionTerminos: estado.versiones.terminos,
    versionPrivacidad: estado.versiones.privacidad,
    fecha: estado.aceptadoEn || anterior.fecha || null,
    municipioId: municipioId ?? anterior.municipioId ?? null
  };
  localStorage.setItem(CLAVE, JSON.stringify(registro));
  return registro;
}

function vigenteLocal() {
  const local = leerLocal();
  if (!local) return false;
  return (
    Number(local.versionTerminos) === Number(estado.versiones.terminos) &&
    Number(local.versionPrivacidad) === Number(estado.versiones.privacidad)
  );
}

export const consentimiento = {
  leer: leerLocal,

  estado() {
    return estado;
  },

  documentos() {
    return estado.documentos || [];
  },

  /** Consulta documentos, versiones y aceptación al servidor. */
  async cargarEstado() {
    try {
      const respuesta = await api.get('/legal/aceptacion');
      estado = {
        aceptada: respuesta.aceptada === true,
        aceptadoEn: respuesta.aceptadoEn || null,
        versiones: respuesta.versiones || { terminos: 0, privacidad: 0 },
        documentos: respuesta.documentos || []
      };
      if (estado.aceptada) escribirLocal();
      return estado;
    } catch {
      // Sin red se usa la copia local; el servidor volverá a validar la
      // siguiente acción de escritura.
      estado = {
        ...estado,
        aceptada: vigenteLocal(),
        documentos: estado.documentos || []
      };
      return estado;
    }
  },

  vigente() {
    return estado.aceptada === true;
  },

  versionActual() {
    return estado.versiones;
  },

  /** Municipio elegido la última vez (para preseleccionarlo). */
  municipioId() {
    return leerLocal()?.municipioId || null;
  },

  fecha() {
    return estado.aceptadoEn || leerLocal()?.fecha || null;
  },

  /** Guarda una aceptación nueva en servidor y actualiza la copia local. */
  async aceptar({ municipioId = null } = {}) {
    if (!estado.documentos.length) await this.cargarEstado();
    let respuesta;
    try {
      respuesta = await api.post('/legal/aceptar', {
        terminos: estado.versiones.terminos,
        privacidad: estado.versiones.privacidad
      });
    } catch (error) {
      if (error?.estado === 409) await this.cargarEstado();
      throw error;
    }
    estado = {
      ...estado,
      aceptada: respuesta.aceptada === true,
      aceptadoEn: respuesta.aceptadoEn || new Date().toISOString(),
      versiones: respuesta.versiones || estado.versiones
    };
    escribirLocal({ municipioId });
    return respuesta;
  },

  /** Actualiza solo el municipio recordado sin marcar términos como aceptados. */
  guardar({ municipioId = null } = {}) {
    return escribirLocal({ municipioId });
  },

  limpiar() {
    localStorage.removeItem(CLAVE);
  }
};
