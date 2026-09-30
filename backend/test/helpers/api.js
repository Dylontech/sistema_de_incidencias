/** Cliente de pruebas: envuelve supertest y adjunta el token cuando existe. */
import request from 'supertest';

/**
 * Bandeja de salida del servicio de correo.
 *
 * Se importa **dentro** de la función a propósito: `correo.service` arrastra
 * `config`, que lee el entorno al cargarse. Un import estático aquí se evaluaría
 * antes de que la prueba fije el directorio de datos y el driver (el `.env` de
 * desarrollo apunta a MySQL), y las pruebas acabarían corriendo contra la base
 * de datos de verdad en lugar de contra la suya.
 */
async function bandejaDePrueba() {
  return import('../../src/services/correo.service.js');
}

/**
 * Token que viaja en el último correo dirigido a una dirección.
 *
 * Los correos no salen de verdad en las pruebas: el servicio los deja en una
 * bandeja en memoria, y leerlos aquí es lo que permite recorrer el flujo tal y
 * como lo vive el ciudadano (abrir el enlace del mensaje).
 */
export async function tokenDelCorreo(correo, parametro = 'verificar') {
  const { ultimoMensajePara } = await bandejaDePrueba();
  const mensaje = ultimoMensajePara(correo);
  if (!mensaje) throw new Error(`No se envió ningún correo a ${correo}`);
  const valor = new URL(mensaje.enlace).searchParams.get(parametro);
  if (!valor) throw new Error(`El correo a ${correo} no trae el parámetro ${parametro}`);
  return valor;
}

export class Api {
  constructor(app, token = null) {
    this.app = app;
    this.token = token;
  }

  #peticion(metodo, ruta) {
    const p = request(this.app)[metodo](ruta);
    return this.token ? p.set('Authorization', `Bearer ${this.token}`) : p;
  }

  get(ruta) {
    return this.#peticion('get', ruta);
  }

  post(ruta, cuerpo) {
    return this.#peticion('post', ruta).send(cuerpo);
  }

  put(ruta, cuerpo) {
    return this.#peticion('put', ruta).send(cuerpo);
  }

  patch(ruta, cuerpo) {
    return this.#peticion('patch', ruta).send(cuerpo);
  }

  delete(ruta) {
    return this.#peticion('delete', ruta);
  }

  static async anonimo(app, anonId) {
    const r = await request(app).post('/api/auth/anonimo').send({ anonId });
    return new Api(app, r.body.token);
  }

  /**
   * Ciudadano registrado (correo + contraseña). Es quien recibe los avisos de
   * sus reportes: la sesión anónima no tiene buzón.
   */
  static async ciudadano(app, datos = {}) {
    const { api } = await Api.ciudadanoConCuenta(app, datos);
    return api;
  }

  /**
   * Alta de cuenta ciudadana devolviendo la respuesta cruda: así se pueden
   * comprobar los rechazos (correo repetido, contraseña corta, sin nombre…).
   */
  static registrar(app, cuerpo = {}) {
    return request(app).post('/api/auth/registro').send(cuerpo);
  }

  /**
   * Ciudadano con su sesión a mano: la moderación necesita el `username`
   * (que es el `userKey` de la cuenta) para dirigir advertencias y sanciones.
   *
   * Recorre el alta completa: registrar, confirmar el correo abriendo el enlace
   * que el servicio dejó en su bandeja, y entrar. Es decir, lo mismo que hace
   * una persona de verdad.
   */
  static async ciudadanoConCuenta(app, datos = {}) {
    const correo =
      datos.correo || `moderacion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@ejemplo.mx`;
    const password = datos.password || 'segura1234';
    const respuesta = await request(app).post('/api/auth/registro').send({
      correo,
      password,
      nombre: datos.nombre || 'Vecino Moderación',
      pseudonimo: datos.pseudonimo === true
    });
    if (respuesta.status !== 201) {
      throw new Error(`No se pudo registrar el ciudadano de prueba: ${respuesta.body?.error || respuesta.status}`);
    }

    await Api.confirmarCorreo(app, correo);

    const entrada = await request(app).post('/api/auth/ciudadano').send({ correo, password });
    if (entrada.status !== 200) {
      throw new Error(`No se pudo entrar como ciudadano: ${entrada.body?.error || entrada.status}`);
    }

    return {
      api: new Api(app, entrada.body.token),
      usuario: entrada.body.usuario,
      correo,
      password
    };
  }

  /** Abre el enlace de confirmación del último correo, como el ciudadano. */
  static async confirmarCorreo(app, correo) {
    const token = await tokenDelCorreo(correo);
    const r = await request(app).post('/api/auth/verificar').send({ token });
    if (r.status !== 200) {
      throw new Error(`No se pudo confirmar el correo: ${r.body?.error || r.status}`);
    }
    return r;
  }

  /** Entrada de una cuenta ciudadana (correo + contraseña). */
  static entrarCiudadano(app, cuerpo = {}) {
    return request(app).post('/api/auth/ciudadano').send(cuerpo);
  }

  /** Entrada de un funcionario (respuesta cruda, para probar rechazos). */
  static entrarFuncionario(app, cuerpo = {}) {
    return request(app).post('/api/auth/funcionario').send(cuerpo);
  }

  static async funcionario(app, credenciales = {}) {
    const cuerpo = {
      username: 'funcionario',
      password: 'func123',
      claveMunicipio: CLAVE_MARAVATIO,
      ...credenciales
    };
    const r = await request(app).post('/api/auth/funcionario').send(cuerpo);
    return new Api(app, r.body.token);
  }

  static async admin(app, credenciales = {}) {
    const r = await request(app)
      .post('/api/auth/admin')
      .send({ username: 'admin', password: 'admin123', ...credenciales });
    return new Api(app, r.body.token);
  }
}

/**
 * Catálogo geoestadístico del INEGI: Maravatío es el municipio 16050 y sus
 * comunidades son localidades (`loc_<cvegeo de la localidad>`).
 */
export const MUNICIPIO_MARAVATIO = '16050';
/** Clave de acceso de funcionarios: es la clave geoestadística del municipio. */
export const CLAVE_MARAVATIO = '16050';
/** Cabecera municipal: comunidad "Maravatío de Ocampo". */
export const ZONA_MARAVATIO = 'loc_160500001';
/** Punto en la cabecera municipal (dentro de la comunidad y del municipio). */
export const PUNTO_MARAVATIO = { lat: 19.8916736, lng: -100.4416672 };
/**
 * Punto dentro del polígono municipal pero fuera de toda comunidad.
 * Las localidades del INEGI cubren las áreas pobladas, así que el resto del
 * término municipal no pertenece a ninguna.
 */
export const PUNTO_SIN_ZONA = { lat: 19.92, lng: -100.42 };
/** Punto fuera del polígono municipal. */
export const PUNTO_FUERA = { lat: 19.7, lng: -100.44 };

export function incidenciaValida(extra = {}) {
  return {
    tipoId: 'bache',
    titulo: 'Bache grande en la avenida',
    descripcion: 'Bache de 60 cm frente al mercado, sobre el carril derecho.',
    municipioId: MUNICIPIO_MARAVATIO,
    ...PUNTO_MARAVATIO,
    ...extra
  };
}
