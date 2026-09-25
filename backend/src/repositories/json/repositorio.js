/**
 * DRIVER JSON — implementación del contrato de repositorio sobre archivos.
 *
 * Es el driver por defecto (STORAGE_DRIVER=json): sustituye al localStorage del
 * monolito por archivos en backend/data/ con escrituras atómicas.
 * Su equivalente para MySQL/MariaDB está en ../mysql/repositorio.js y expone
 * exactamente los mismos métodos.
 */
import { AlmacenJson } from './almacen.js';
import { config } from '../../config/index.js';
import { municipiosSemilla, zonasSemilla, tiposSemilla, usuariosSemilla } from '../../config/semilla.js';
import { hashearPassword } from '../../models/usuario.model.js';
import { coincideTexto } from '../../models/incidencia.model.js';

export class RepositorioJson {
  constructor({ directorio = config.paths.data } = {}) {
    this.driver = 'json';
    this.directorio = directorio;
    this.almacen = new AlmacenJson(directorio);
    /**
     * Caché del catálogo (municipios, zonas y tipos).
     *
     * Con tres estados el catálogo pasa de 6 MB, y `zonasPorMunicipio()` se
     * consulta en cada petición (listado, creación de reportes, geocerca), así
     * que leerlo del disco cada vez no tiene sentido. Se invalida al escribir:
     * la sincronización de arranque y los tipos personalizados.
     */
    this.catalogo = new Map();
  }

  /** Lectura del catálogo con caché (sólo para colecciones de catálogo). */
  async #leerCatalogo(coleccion, porDefecto) {
    if (!this.catalogo.has(coleccion)) {
      this.catalogo.set(coleccion, await this.almacen.leer(coleccion, porDefecto));
    }
    return this.catalogo.get(coleccion);
  }

  /** Crea los archivos con los datos semilla la primera vez. */
  async inicializar() {
    this.catalogo.clear();
    const conSemilla = [
      ['municipios', municipiosSemilla],
      ['zonas', zonasSemilla],
      ['tipos', tiposSemilla],
      ['incidencias', []],
      ['notificaciones', []]
    ];

    for (const [coleccion, datos] of conSemilla) {
      if (!(await this.almacen.existe(coleccion))) {
        await this.almacen.escribir(coleccion, datos);
      }
    }

    if (!(await this.almacen.existe('usuarios'))) {
      const usuarios = [];
      for (const u of usuariosSemilla) {
        usuarios.push({
          id: u.id,
          username: u.username,
          nombre: u.nombre,
          correo: u.correo ?? null,
          rol: u.rol,
          municipioId: u.municipioId ?? null,
          activo: u.activo !== false,
          pseudonimo: u.pseudonimo === true,
          passwordHash: await hashearPassword(u.passwordInicial)
        });
      }
      await this.almacen.escribir('usuarios', usuarios);
    }

    // El catálogo geográfico se mantiene sincronizado con la semilla: cuando el
    // contorno del municipio o la partición de zonas cambia (por ejemplo al
    // pasar de rectángulos `bbox` a polígonos reales), los archivos existentes
    // se refrescan. Es catálogo del sistema, no información del ciudadano.
    await this.#sincronizarCatalogo('municipios', municipiosSemilla);
    await this.#sincronizarCatalogo('zonas', zonasSemilla);
    await this.#agregarTiposBase();
  }

  /**
   * Agrega los tipos base que falten en `tipos.json` y refresca sus campos.
   *
   * Los tipos base no se pueden borrar desde el panel (solo los `custom`), así
   * que añadir los que traiga una semilla nueva siempre es correcto: la
   * instalación que ya existía ve el concepto nuevo sin volver a sembrar, y los
   * reportes que ya lo usaban no se tocan. Al reconstruirlos desde la semilla
   * también llegan los campos que se agreguen después (como el `aviso` de
   * «Sitio peligroso»), sin pisar lo que la instalación tenga guardado encima.
   */
  async #agregarTiposBase() {
    const actuales = await this.almacen.leer('tipos', []);
    const porId = new Map(actuales.map((t) => [t.id, t]));
    const base = tiposSemilla.map((t) => (porId.has(t.id) ? { ...t, ...porId.get(t.id) } : t));
    const personalizados = actuales.filter((t) => t.custom === true);
    const resultado = [...base, ...personalizados];
    if (JSON.stringify(resultado) === JSON.stringify(actuales)) return false;

    await this.almacen.escribir('tipos', resultado);
    this.catalogo.delete('tipos');
    return true;
  }

  /** Reescribe una colección de catálogo si difiere de la semilla. */
  async #sincronizarCatalogo(coleccion, semilla) {
    const actuales = await this.almacen.leer(coleccion, []);
    this.catalogo.set(coleccion, semilla);
    if (JSON.stringify(actuales) === JSON.stringify(semilla)) return false;
    await this.almacen.escribir(coleccion, semilla);
    return true;
  }

  async cerrar() {
    /* nada que liberar: el almacén es de archivos */
  }

  /* ------------------------------- municipios ------------------------------ */

  async todosMunicipios() {
    return this.#leerCatalogo('municipios', municipiosSemilla);
  }

  async municipioPorId(id) {
    const lista = await this.todosMunicipios();
    return lista.find((m) => m.id === id) || null;
  }

  async municipioPorClave(clave) {
    const objetivo = String(clave || '').trim().toUpperCase();
    const lista = await this.todosMunicipios();
    return lista.find((m) => String(m.clave || '').toUpperCase() === objetivo) || null;
  }

  /* ---------------------------------- zonas -------------------------------- */

  async todasLasZonas() {
    return this.#leerCatalogo('zonas', zonasSemilla);
  }

  async zonasPorMunicipio(municipioId) {
    const zonas = await this.todasLasZonas();
    return zonas.filter((z) => z.municipioId === municipioId);
  }

  /* ---------------------------------- tipos -------------------------------- */

  async todosLosTipos() {
    return this.#leerCatalogo('tipos', tiposSemilla);
  }

  async tipoPorId(id) {
    const tipos = await this.todosLosTipos();
    return tipos.find((t) => t.id === id) || null;
  }

  async crearTipo(tipo) {
    const resultado = await this.almacen.transaccion('tipos', tiposSemilla, (tipos) => ({
      datos: [...tipos, tipo],
      resultado: tipo
    }));
    this.catalogo.delete('tipos');
    return resultado;
  }

  async eliminarTipo(id) {
    const resultado = await this.almacen.transaccion('tipos', tiposSemilla, (tipos) => {
      const filtrados = tipos.filter((t) => t.id !== id);
      return { datos: filtrados, resultado: filtrados.length !== tipos.length };
    });
    this.catalogo.delete('tipos');
    return resultado;
  }

  /* -------------------------------- usuarios ------------------------------- */

  async todosLosUsuarios() {
    return this.almacen.leer('usuarios', []);
  }

  async usuarioPorUsername(username) {
    const lista = await this.todosLosUsuarios();
    const objetivo = String(username || '').trim().toLowerCase();
    return lista.find((u) => String(u.username).toLowerCase() === objetivo) || null;
  }

  /** Las cuentas ciudadanas entran con su correo (siempre en minúsculas). */
  async usuarioPorCorreo(correo) {
    const objetivo = String(correo || '').trim().toLowerCase();
    if (!objetivo) return null;
    const lista = await this.todosLosUsuarios();
    return lista.find((u) => String(u.correo || '').toLowerCase() === objetivo) || null;
  }

  async usuarioPorId(id) {
    const lista = await this.todosLosUsuarios();
    return lista.find((u) => u.id === id) || null;
  }

  async crearUsuario(usuario) {
    return this.almacen.transaccion('usuarios', [], (lista) => ({
      datos: [...lista, usuario],
      resultado: usuario
    }));
  }

  /**
   * Aplica un parche parcial sobre una cuenta.
   * El username y el rol no se tocan aquí: el servicio decide qué campos viajan.
   */
  async actualizarUsuario(id, cambios = {}) {
    return this.almacen.transaccion('usuarios', [], (lista) => {
      const indice = lista.findIndex((u) => u.id === id);
      if (indice === -1) return { datos: undefined, resultado: null };
      const actualizado = { ...lista[indice], ...cambios, id: lista[indice].id };
      const datos = lista.slice();
      datos[indice] = actualizado;
      return { datos, resultado: actualizado };
    });
  }

  /* ------------------------------- incidencias ----------------------------- */

  async buscarIncidencias(filtros = {}) {
    const { municipioId, userKey, texto, estado, tipoId, zonaId, orden = 'reciente' } = filtros;
    let lista = await this.almacen.leer('incidencias', []);

    if (userKey) lista = lista.filter((i) => i.userKey === userKey);
    if (municipioId) lista = lista.filter((i) => i.municipioId === municipioId);
    if (estado && estado !== 'todos') lista = lista.filter((i) => i.estado === estado);
    if (tipoId && tipoId !== 'todos') lista = lista.filter((i) => i.tipoId === tipoId);
    if (zonaId && zonaId !== 'todos') lista = lista.filter((i) => i.zonaId === zonaId);
    if (texto) lista = lista.filter((i) => coincideTexto(i, texto));

    return this.#ordenarPorFecha(lista, orden);
  }

  async todasLasIncidencias() {
    return this.almacen.leer('incidencias', []);
  }

  async incidenciaPorId(id) {
    const lista = await this.todasLasIncidencias();
    return lista.find((i) => i.id === id) || null;
  }

  async crearIncidencia(incidencia) {
    return this.almacen.transaccion('incidencias', [], (lista) => ({
      datos: [...lista, incidencia],
      resultado: incidencia
    }));
  }

  async actualizarIncidencia(id, incidencia) {
    return this.almacen.transaccion('incidencias', [], (lista) => {
      const indice = lista.findIndex((i) => i.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = incidencia;
      return { datos: copia, resultado: incidencia };
    });
  }

  async eliminarIncidencia(id) {
    return this.almacen.transaccion('incidencias', [], (lista) => {
      const filtradas = lista.filter((i) => i.id !== id);
      return { datos: filtradas, resultado: filtradas.length !== lista.length };
    });
  }

  /** Inserción masiva (importación de respaldos del monolito). */
  async insertarIncidencias(incidencias) {
    if (!incidencias.length) return 0;
    return this.almacen.transaccion('incidencias', [], (lista) => {
      const porId = new Map(lista.map((i) => [i.id, i]));
      incidencias.forEach((i) => porId.set(i.id, i));
      return { datos: [...porId.values()], resultado: incidencias.length };
    });
  }

  async borrarIncidencias() {
    return this.almacen.transaccion('incidencias', [], (lista) => ({
      datos: [],
      resultado: lista.length
    }));
  }

  /* ----------------------------- notificaciones ---------------------------- */

  async notificacionesDe(userKey) {
    const lista = await this.todasLasNotificaciones();
    return lista
      .filter((n) => !n.paraUsuario || n.paraUsuario === userKey)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }

  async todasLasNotificaciones() {
    return this.almacen.leer('notificaciones', []);
  }

  async crearNotificacion(notificacion) {
    return this.almacen.transaccion('notificaciones', [], (lista) => ({
      datos: [...lista, notificacion],
      resultado: notificacion
    }));
  }

  async marcarNotificacionLeida(id) {
    return this.almacen.transaccion('notificaciones', [], (lista) => {
      const indice = lista.findIndex((n) => n.id === id);
      if (indice === -1) return { datos: lista, resultado: false };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], leida: true };
      return { datos: copia, resultado: true };
    });
  }

  async marcarNotificacionesLeidas(userKey) {
    return this.almacen.transaccion('notificaciones', [], (lista) => {
      let marcadas = 0;
      const copia = lista.map((n) => {
        if (n.leida || (n.paraUsuario && n.paraUsuario !== userKey)) return n;
        marcadas++;
        return { ...n, leida: true };
      });
      return { datos: copia, resultado: marcadas };
    });
  }

  async eliminarNotificacion(id) {
    return this.almacen.transaccion('notificaciones', [], (lista) => {
      const filtradas = lista.filter((n) => n.id !== id);
      return { datos: filtradas, resultado: filtradas.length !== lista.length };
    });
  }

  async borrarNotificaciones() {
    return this.almacen.transaccion('notificaciones', [], (lista) => ({
      datos: [],
      resultado: lista.length
    }));
  }

  /* --------------------------------- privados ------------------------------ */

  #ordenarPorFecha(lista, orden) {
    const copia = lista.slice();
    if (orden === 'antigua') return copia.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    // `prioridad` se resuelve en el servicio porque depende del color derivado.
    if (orden === 'prioridad') return copia;
    return copia.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }
}
