/**
 * Consentimiento de entrada: municipio elegido y aceptación de los términos.
 *
 * Se guarda en `localStorage` (igual que la sesión) porque la aplicación la usa
 * público anónimo sin cuenta: no hay usuario al que asociarlo en el servidor.
 * El registro guarda la **versión** del texto aceptado y la fecha, de modo que
 * al cambiar los términos se vuelven a pedir.
 *
 * IMPORTANTE: si se modifica el texto de `#obTerminos` en `index.html`, hay que
 * subir `VERSION_TERMINOS` para que todo el mundo lo vuelva a aceptar.
 */
const CLAVE = 'inc_consentimiento_v1';

/** Fecha del texto vigente (ver `#obTerminos` en `frontend/index.html`). */
export const VERSION_TERMINOS = '2026-09-25';

export const consentimiento = {
  leer() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE) || 'null');
    } catch {
      return null;
    }
  },

  /** ¿Ya se aceptó esta versión de los términos en este dispositivo? */
  vigente() {
    return this.leer()?.version === VERSION_TERMINOS;
  },

  /** Municipio elegido la última vez (para preseleccionarlo). */
  municipioId() {
    return this.leer()?.municipioId || null;
  },

  fecha() {
    return this.leer()?.fecha || null;
  },

  guardar({ municipioId = null, version = VERSION_TERMINOS } = {}) {
    const registro = {
      version,
      fecha: new Date().toISOString(),
      municipioId: municipioId || null
    };
    localStorage.setItem(CLAVE, JSON.stringify(registro));
    return registro;
  },

  limpiar() {
    localStorage.removeItem(CLAVE);
  }
};
