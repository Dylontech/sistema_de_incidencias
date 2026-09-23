/**
 * Almacén de archivos JSON con escritura atómica y colas por colección.
 *
 * Sustituye al objeto `DB` del monolito (que usaba localStorage) manteniendo
 * la misma idea de "una colección = un array serializado", pero del lado del
 * servidor y sin condiciones de carrera.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export class AlmacenJson {
  /** @param {string} directorio carpeta donde viven los .json */
  constructor(directorio) {
    this.directorio = directorio;
    /** @type {Map<string, Promise<unknown>>} colas de escritura por colección */
    this.colas = new Map();
  }

  ruta(coleccion) {
    return path.join(this.directorio, `${coleccion}.json`);
  }

  async asegurarDirectorio() {
    await fs.mkdir(this.directorio, { recursive: true });
  }

  async existe(coleccion) {
    try {
      await fs.access(this.ruta(coleccion));
      return true;
    } catch {
      return false;
    }
  }

  async leer(coleccion, porDefecto = []) {
    await this.asegurarDirectorio();
    try {
      const crudo = await fs.readFile(this.ruta(coleccion), 'utf8');
      const datos = JSON.parse(crudo);
      return datos === null || datos === undefined ? porDefecto : datos;
    } catch (e) {
      if (e.code === 'ENOENT') return porDefecto;
      throw new Error(`Archivo de datos corrupto (${coleccion}.json): ${e.message}`);
    }
  }

  async escribir(coleccion, datos) {
    return this.#enCola(coleccion, () => this.#escribirDirecto(coleccion, datos));
  }

  /**
   * Lectura-modificación-escritura sin carreras.
   * @param {(datos:any) => ({datos:any, resultado?:any}|any)} fn
   */
  async transaccion(coleccion, porDefecto, fn) {
    return this.#enCola(coleccion, async () => {
      const actuales = await this.leer(coleccion, porDefecto);
      const salida = await fn(actuales);
      const datos = salida && typeof salida === 'object' && 'datos' in salida ? salida.datos : salida;
      if (datos !== undefined) await this.#escribirDirecto(coleccion, datos);
      return salida && typeof salida === 'object' && 'resultado' in salida ? salida.resultado : datos;
    });
  }

  async #escribirDirecto(coleccion, datos) {
    await this.asegurarDirectorio();
    const destino = this.ruta(coleccion);
    const temporal = `${destino}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporal, JSON.stringify(datos, null, 2), 'utf8');
    await fs.rename(temporal, destino);
    return datos;
  }

  #enCola(coleccion, tarea) {
    const previa = this.colas.get(coleccion) || Promise.resolve();
    const actual = previa.then(tarea, tarea);
    // Se guarda una versión "silenciada" para que un fallo no rompa la cadena.
    this.colas.set(coleccion, actual.then(() => undefined, () => undefined));
    return actual;
  }
}
