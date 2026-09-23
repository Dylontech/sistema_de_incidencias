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
      claveMunicipio: 'MARAVATIO-2024',
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
 * Punto dentro de la zona col_guadalupe de Maravatío.
 * Con la geometría nueva (polígonos reales) este punto cae en Guadalupe.
 */
export const PUNTO_MARAVATIO = { lat: 19.92, lng: -100.42 };
/** Zona que contiene PUNTO_MARAVATIO. */
export const ZONA_MARAVATIO = 'col_guadalupe';
/** Punto dentro del polígono municipal pero fuera de toda zona (hueco de la partición). */
export const PUNTO_SIN_ZONA = { lat: 19.95, lng: -100.595 };
/** Punto fuera del polígono municipal. */
export const PUNTO_FUERA = { lat: 19.7, lng: -100.44 };

export function incidenciaValida(extra = {}) {
  return {
    tipoId: 'bache',
    titulo: 'Bache grande en la avenida',
    descripcion: 'Bache de 60 cm frente al mercado, sobre el carril derecho.',
    ...PUNTO_MARAVATIO,
    ...extra
  };
}
