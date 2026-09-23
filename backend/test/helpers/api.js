/** Cliente de pruebas: envuelve supertest y adjunta el token cuando existe. */
import request from 'supertest';

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
