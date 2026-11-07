/**
 * Cliente HTTP de la API.
 *
 * Reemplaza al objeto `DB` del monolito (que leía localStorage): ahora los
 * datos viven en el backend y aquí solo se habla REST con el token JWT.
 */

const CLAVE_TOKEN = 'inc_token_v2';

export class ErrorApi extends Error {
  constructor(mensaje, estado, detalles = null) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.detalles = detalles;
  }
}

export const token = {
  leer() {
    return localStorage.getItem(CLAVE_TOKEN) || '';
  },
  guardar(valor) {
    if (valor) localStorage.setItem(CLAVE_TOKEN, valor);
    else localStorage.removeItem(CLAVE_TOKEN);
  },
  borrar() {
    localStorage.removeItem(CLAVE_TOKEN);
  }
};

export const BASE = '/api';

/** URL de un archivo privado con el token de la sesión (para <img> y enlaces). */
export function urlPrivada(url) {
  if (!url) return '';
  const actual = token.leer();
  return actual ? `${url}?token=${encodeURIComponent(actual)}` : url;
}

/**
 * Rutas de entrada. En ellas un 401 significa «credenciales incorrectas», no
 * «sesión caducada»: si se trataran igual, fallar al escribir la contraseña
 * cerraría la sesión (por ejemplo la ciudadana anónima que ya estaba abierta)
 * y recargaría la página en lugar de mostrar el aviso.
 */
const RUTAS_ENTRADA = [
  '/auth/anonimo',
  '/auth/registro',
  '/auth/ciudadano',
  '/auth/funcionario',
  '/auth/admin',
  '/auth/cuenta/recuperar',
  '/auth/cuenta/reenviar-verificacion',
  '/auth/cuenta/validar-token',
  '/auth/cuenta/verificar',
  '/auth/cuenta/restablecer'
];

async function peticion(ruta, { metodo = 'GET', cuerpo, formulario } = {}) {
  const cabeceras = {};
  const actual = token.leer();
  if (actual) cabeceras.Authorization = `Bearer ${actual}`;

  let body;
  if (formulario) {
    body = formulario; // FormData: el navegador fija el Content-Type
  } else if (cuerpo !== undefined) {
    cabeceras['Content-Type'] = 'application/json';
    body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, { method: metodo, headers: cabeceras, body });
  } catch (e) {
    throw new ErrorApi('No se pudo conectar con el servidor. Verifica tu conexión.', 0);
  }

  const tipo = respuesta.headers.get('content-type') || '';
  const datos = tipo.includes('application/json') ? await respuesta.json() : null;

  if (!respuesta.ok) {
    // Sesión caducada o token inválido: se avisa para volver al login.
    if (respuesta.status === 401 && actual && !RUTAS_ENTRADA.includes(ruta)) {
      token.borrar();
      document.dispatchEvent(new CustomEvent('sesion-expirada'));
    }
    // Cuenta suspendida o congelada: se cubre la interfaz con el aviso (sin
    // borrar el token, para que al recargar vuelva a verse el bloqueo).
    if (
      respuesta.status === 403 &&
      !RUTAS_ENTRADA.includes(ruta) &&
      /suspendida|congelada|inactividad/i.test(datos?.error || '')
    ) {
      document.dispatchEvent(
        new CustomEvent('cuenta-suspendida', { detail: { mensaje: datos.error } })
      );
    }
    // El servidor exige una nueva aceptación de los términos (puede haber
    // cambiado la versión mientras la aplicación estaba abierta).
    if (respuesta.status === 428 && datos?.detalles?.codigo === 'terminos_pendientes') {
      document.dispatchEvent(
        new CustomEvent('terminos-pendientes', {
          detail: { mensaje: datos.error, versiones: datos.detalles.versiones }
        })
      );
    }
    throw new ErrorApi(
      datos?.error || `Error ${respuesta.status}`,
      respuesta.status,
      datos?.detalles || null
    );
  }

  return datos;
}

/** Descarga binaria o de texto con el token de la sesión. */
async function descarga(ruta) {
  const cabeceras = {};
  const actual = token.leer();
  if (actual) cabeceras.Authorization = `Bearer ${actual}`;
  let respuesta;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, { headers: cabeceras });
  } catch {
    throw new ErrorApi('No se pudo conectar con el servidor. Verifica tu conexión.', 0);
  }
  if (!respuesta.ok) {
    const tipo = respuesta.headers.get('content-type') || '';
    const datos = tipo.includes('application/json') ? await respuesta.json() : null;
    if (respuesta.status === 401 && actual) {
      token.borrar();
      document.dispatchEvent(new CustomEvent('sesion-expirada'));
    }
    throw new ErrorApi(
      datos?.error || `Error ${respuesta.status}`,
      respuesta.status,
      datos?.detalles || null
    );
  }
  return respuesta;
}

export const api = {
  get: (ruta) => peticion(ruta),
  post: (ruta, cuerpo) => peticion(ruta, { metodo: 'POST', cuerpo }),
  put: (ruta, cuerpo) => peticion(ruta, { metodo: 'PUT', cuerpo }),
  patch: (ruta, cuerpo) => peticion(ruta, { metodo: 'PATCH', cuerpo }),
  del: (ruta) => peticion(ruta, { metodo: 'DELETE' }),
  /** Descarga autenticada (PDF, CSV): el Authorization no viaja en un `<a>`. */
  async blob(ruta) {
    const respuesta = await descarga(ruta);
    return respuesta.blob();
  },
  async texto(ruta) {
    const respuesta = await descarga(ruta);
    return respuesta.text();
  },
  /** Sube archivos; por defecto usa el campo `archivos` de evidencia. */
  subir: (ruta, archivos, { campo = 'archivos' } = {}) => {
    const formulario = new FormData();
    Array.from(archivos).forEach((archivo) => formulario.append(campo, archivo, archivo.name));
    return peticion(ruta, { metodo: 'POST', formulario });
  }
};
