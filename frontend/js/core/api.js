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

  return datos;
}

export const api = {
  get: (ruta) => peticion(ruta),
  post: (ruta, cuerpo) => peticion(ruta, { metodo: 'POST', cuerpo }),
  put: (ruta, cuerpo) => peticion(ruta, { metodo: 'PUT', cuerpo }),
  patch: (ruta, cuerpo) => peticion(ruta, { metodo: 'PATCH', cuerpo }),
  del: (ruta) => peticion(ruta, { metodo: 'DELETE' }),
  /** Sube archivos al endpoint de evidencia (campo `archivos`). */
  subir: (ruta, archivos) => {
    const formulario = new FormData();
    Array.from(archivos).forEach((archivo) => formulario.append('archivos', archivo, archivo.name));
    return peticion(ruta, { metodo: 'POST', formulario });
  }
};
