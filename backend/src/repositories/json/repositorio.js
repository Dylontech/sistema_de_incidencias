/**
 * DRIVER JSON — implementación del contrato de repositorio sobre archivos.
 *
 * Sustituye al localStorage del monolito por archivos en backend/data/ con
 * escrituras atómicas. Desde la migración a Docker el driver por defecto es
 * MySQL/MariaDB (../mysql/repositorio.js); este se activa con
 * STORAGE_DRIVER=json y expone exactamente los mismos métodos.
 */
import { constants as fsConstants, promises as fsPromesas } from 'node:fs';
import { AlmacenJson } from './almacen.js';
import { config } from '../../config/index.js';
import { ROLES_PERSONAL } from '../../config/constantes.js';
import { municipiosSemilla, zonasSemilla, tiposSemilla, usuariosSemilla } from '../../config/semilla.js';
import { hashearPassword } from '../../models/usuario.model.js';
import { coincideTexto } from '../../models/incidencia.model.js';
import { normalizarBusqueda } from '../../utils/validacion.js';

export class RepositorioJson {
  constructor({ directorio = config.paths.data } = {}) {
    this.driver = 'json';
    this.directorio = directorio;
    this.almacen = new AlmacenJson(directorio);
    /**
     * Caché del catálogo (municipios, zonas y tipos).
     *
     * Con el catálogo nacional el JSON pesa decenas de MB, y
     * `zonasPorMunicipio()` se consulta en cada petición (listado, creación de
     * reportes, geocerca), así que leerlo del disco cada vez no tiene sentido.
     * Se invalida al escribir: la sincronización de arranque y los tipos
     * personalizados.
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
      ['notificaciones', []],
      ['denuncias', []]
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
          passwordHash: await hashearPassword(u.passwordInicial),
          // Moderación: mismo punto de partida que `construirUsuario`.
          advertencias: 0,
          suspendido: false,
          suspendidoHasta: null,
          suspendidoMotivo: '',
          suspendidoPor: null
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

    // Backfill de folios para instalaciones JSON anteriores a V2.2.
    const incidencias = await this.almacen.leer('incidencias', []);
    if (incidencias.some((i) => !i.folio)) {
      const conFolio = incidencias.map((i) => {
        if (i.folio) return i;
        const dia = new Date(i.fecha || Date.now()).toISOString().slice(0, 10).replace(/-/g, '');
        const azar = Math.random().toString(36).slice(2, 8).toUpperCase();
        return { ...i, folio: `INC-${dia}-${azar}` };
      });
      await this.almacen.escribir('incidencias', conFolio);
    }
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

  /**
   * Comprobación ligera de salud (`GET /api/salud`): con este driver basta con
   * saber que el directorio de datos es accesible y escribible.
   */
  async ping() {
    await fsPromesas.access(this.directorio, fsConstants.W_OK);
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

  /** Conteos por municipio para la pestaña Municipios del panel. */
  async resumenPorMunicipio() {
    const [incidencias, tickets, sugerencias, usuarios, asignaciones] = await Promise.all([
      this.almacen.leer('incidencias', []),
      this.almacen.leer('tickets', []),
      this.almacen.leer('sugerencias', []),
      this.almacen.leer('usuarios', []),
      this.almacen.leer('usuario_municipios', [])
    ]);

    const mapa = new Map();
    const base = (id) => {
      if (!mapa.has(id)) {
        mapa.set(id, {
          municipioId: id,
          incidenciasAbiertas: 0,
          ticketsAbiertos: 0,
          sugerenciasPendientes: 0,
          personal: 0
        });
      }
      return mapa.get(id);
    };

    for (const incidencia of incidencias) {
      if (incidencia.estado === 'resuelta' || !incidencia.municipioId) continue;
      base(incidencia.municipioId).incidenciasAbiertas++;
    }
    for (const ticket of tickets) {
      if (ticket.estado === 'cerrado' || !ticket.municipioId) continue;
      base(ticket.municipioId).ticketsAbiertos++;
    }
    for (const sugerencia of sugerencias) {
      if (!sugerencia.municipioId) continue;
      if (!['nueva', 'en_revision'].includes(sugerencia.estado)) continue;
      base(sugerencia.municipioId).sugerenciasPendientes++;
    }

    const personal = new Set(
      usuarios
        .filter((u) => ROLES_PERSONAL.includes(u.rol) && u.activo !== false)
        .map((u) => u.id)
    );
    for (const fila of asignaciones) {
      if (!personal.has(fila.usuarioId)) continue;
      base(fila.municipioId).personal++;
    }

    return [...mapa.values()];
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
    const [usuarios, roles] = await Promise.all([
      this.almacen.leer('usuarios', []),
      this.almacen.leer('roles_personalizados', [])
    ]);
    const porId = new Map(roles.map((r) => [r.id, r]));
    return usuarios.map((u) => ({
      ...u,
      rolPersonalizado: u.rolPersonalizadoId ? porId.get(u.rolPersonalizadoId) || null : null
    }));
  }

  /** Personal activo por rol (evita cargar ciudadanos en el aviso de incidencias). */
  async usuariosPorRoles(roles = []) {
    const objetivos = new Set(roles);
    const lista = await this.todosLosUsuarios();
    return lista.filter((u) => objetivos.has(u.rol) && u.activo !== false);
  }

  /** Cuentas concretas por `username`/`userKey` (autores y responsables). */
  async usuariosPorKeys(keys = []) {
    const objetivos = new Set((keys || []).filter(Boolean).map(String));
    if (!objetivos.size) return [];
    const lista = await this.todosLosUsuarios();
    return lista.filter((u) => objetivos.has(u.username));
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

  /**
   * Ciudadanos cuyo nombre coincide (sin distinguir mayúsculas ni acentos).
   * El nombre es la credencial de acceso, pero las bases antiguas pueden tener
   * nombres repetidos: por eso devuelve todos los candidatos y el servicio
   * comprueba la contraseña de cada uno.
   */
  async usuariosPorNombre(nombre) {
    const objetivo = normalizarBusqueda(nombre);
    if (!objetivo) return [];
    const lista = await this.todosLosUsuarios();
    return lista.filter(
      (u) => u.rol === 'ciudadano' && normalizarBusqueda(u.nombre) === objetivo
    );
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

  /* --------------------------- alcance territorial ------------------------- */

  /** Asignaciones N:M de un usuario (municipios y estados). */
  async alcanceDeUsuario(id) {
    const [municipios, estados] = await Promise.all([
      this.#leerCatalogo('usuario_municipios', []),
      this.#leerCatalogo('usuario_estados', [])
    ]);
    return {
      municipios: municipios
        .filter((r) => r.usuarioId === id)
        .map((r) => r.municipioId),
      estados: estados.filter((r) => r.usuarioId === id).map((r) => r.estado)
    };
  }

  /** Versión por lote para el listado del panel (evita N lecturas de disco). */
  async alcancesDeUsuarios(ids = []) {
    const objetivos = new Set(ids);
    const [municipios, estados] = await Promise.all([
      this.#leerCatalogo('usuario_municipios', []),
      this.#leerCatalogo('usuario_estados', [])
    ]);
    const mapa = {};
    for (const id of ids) mapa[id] = { municipios: [], estados: [] };

    for (const fila of municipios) {
      if (!objetivos.has(fila.usuarioId)) continue;
      mapa[fila.usuarioId]?.municipios.push(fila.municipioId);
    }
    for (const fila of estados) {
      if (!objetivos.has(fila.usuarioId)) continue;
      mapa[fila.usuarioId]?.estados.push(fila.estado);
    }
    return mapa;
  }

  async guardarAlcanceUsuario(id, { municipios = [], estados = [] } = {}) {
    const limpiosMunicipios = [...new Set(municipios.filter(Boolean).map(String))];
    const limpiosEstados = [...new Set(estados.filter(Boolean).map(String))];

    await this.almacen.transaccion('usuario_municipios', [], (lista) => ({
      datos: [
        ...lista.filter((r) => r.usuarioId !== id),
        ...limpiosMunicipios.map((municipioId) => ({ usuarioId: id, municipioId }))
      ]
    }));
    await this.almacen.transaccion('usuario_estados', [], (lista) => ({
      datos: [
        ...lista.filter((r) => r.usuarioId !== id),
        ...limpiosEstados.map((estado) => ({ usuarioId: id, estado }))
      ]
    }));

    this.catalogo.delete('usuario_municipios');
    this.catalogo.delete('usuario_estados');
    return { municipios: limpiosMunicipios, estados: limpiosEstados };
  }

  /* ---------------------- preferencias de notificación --------------------- */

  /** Preferencia de una cuenta; `existe: false` cuando nunca la ha guardado. */
  async preferenciasDe(usuarioId) {
    const [preferencias, municipios] = await Promise.all([
      this.almacen.leer('preferencias_notificacion', []),
      this.almacen.leer('preferencia_municipios', [])
    ]);
    const fila = preferencias.find((p) => p.usuarioId === usuarioId);
    return {
      modo: fila?.modo || 'asignados',
      porCorreo: fila?.porCorreo === true,
      municipios: municipios
        .filter((m) => m.usuarioId === usuarioId)
        .map((m) => m.municipioId),
      existe: Boolean(fila)
    };
  }

  /** Versión por lote para el aviso masivo a personal. */
  async preferenciasDeVarios(ids = []) {
    const objetivos = new Set(ids);
    const [preferencias, municipios] = await Promise.all([
      this.almacen.leer('preferencias_notificacion', []),
      this.almacen.leer('preferencia_municipios', [])
    ]);

    const mapa = {};
    for (const id of ids) {
      mapa[id] = { modo: 'asignados', porCorreo: false, municipios: [], existe: false };
    }
    for (const fila of preferencias) {
      if (!objetivos.has(fila.usuarioId)) continue;
      mapa[fila.usuarioId] = {
        modo: fila.modo || 'asignados',
        porCorreo: fila.porCorreo === true,
        municipios: [],
        existe: true
      };
    }
    for (const fila of municipios) {
      if (!objetivos.has(fila.usuarioId)) continue;
      mapa[fila.usuarioId]?.municipios.push(fila.municipioId);
    }
    return mapa;
  }

  async guardarPreferencias(usuarioId, { modo = 'asignados', porCorreo = false, municipios = [] } = {}) {
    const limpios = [...new Set(municipios.filter(Boolean).map(String))];

    await this.almacen.transaccion('preferencias_notificacion', [], (lista) => ({
      datos: [
        ...lista.filter((p) => p.usuarioId !== usuarioId),
        {
          usuarioId,
          modo,
          porCorreo: porCorreo === true,
          actualizadoEn: new Date().toISOString()
        }
      ]
    }));

    await this.almacen.transaccion('preferencia_municipios', [], (lista) => ({
      datos: [
        ...lista.filter((m) => m.usuarioId !== usuarioId),
        ...limpios.map((municipioId) => ({ usuarioId, municipioId }))
      ]
    }));

    return { modo, porCorreo: porCorreo === true, municipios: limpios, existe: true };
  }

  /* ----------------------------- claves de acceso -------------------------- */

  async todasLasClaves() {
    const [claves, municipios, estados] = await Promise.all([
      this.almacen.leer('claves_acceso', []),
      this.almacen.leer('clave_acceso_municipios', []),
      this.almacen.leer('clave_acceso_estados', [])
    ]);
    return claves
      .map((clave) => ({
        ...clave,
        municipios: municipios
          .filter((m) => m.claveId === clave.id)
          .map((m) => m.municipioId),
        estados: estados.filter((e) => e.claveId === clave.id).map((e) => e.estado)
      }))
      .sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)));
  }

  async claveAccesoPorCodigo(codigo) {
    const objetivo = String(codigo || '').trim().toUpperCase();
    const claves = await this.todasLasClaves();
    return claves.find((c) => String(c.codigo).toUpperCase() === objetivo) || null;
  }

  async crearClaveAcceso(clave) {
    await this.almacen.transaccion('claves_acceso', [], (lista) => ({
      datos: [...lista, clave],
      resultado: clave
    }));
    await this.almacen.transaccion('clave_acceso_municipios', [], (lista) => ({
      datos: [
        ...lista,
        ...(clave.municipios || []).map((municipioId) => ({ claveId: clave.id, municipioId }))
      ]
    }));
    await this.almacen.transaccion('clave_acceso_estados', [], (lista) => ({
      datos: [
        ...lista,
        ...(clave.estados || []).map((estado) => ({ claveId: clave.id, estado }))
      ]
    }));
    return { ...clave, municipios: clave.municipios || [], estados: clave.estados || [] };
  }

  async revocarClaveAcceso(id) {
    const resultado = await this.almacen.transaccion('claves_acceso', [], (lista) => {
      const indice = lista.findIndex((c) => c.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], activa: false, revocadaEn: new Date().toISOString() };
      return { datos: copia, resultado: copia[indice] };
    });
    if (!resultado) return null;
    const clave = await this.claveAccesoPorCodigo(resultado.codigo);
    return clave;
  }

  /** Elimina la clave y sus asignaciones; las sesiones se cierran aparte. */
  async eliminarClaveAcceso(id) {
    const clave = (await this.todasLasClaves()).find((c) => c.id === id) || null;
    if (!clave) return null;
    await this.almacen.transaccion('claves_acceso', [], (lista) => ({
      datos: lista.filter((c) => c.id !== id)
    }));
    await this.almacen.transaccion('clave_acceso_municipios', [], (lista) => ({
      datos: lista.filter((m) => m.claveId !== id)
    }));
    await this.almacen.transaccion('clave_acceso_estados', [], (lista) => ({
      datos: lista.filter((e) => e.claveId !== id)
    }));
    return clave;
  }

  async usuariosDeClaves(ids = []) {
    const mapa = {};
    const limpios = new Set((ids || []).filter(Boolean).map(String));
    if (!limpios.size) return mapa;
    const [usos, usuarios] = await Promise.all([
      this.almacen.leer('clave_acceso_usos', []),
      this.almacen.leer('usuarios', [])
    ]);
    const porId = new Map(usuarios.map((u) => [u.id, u]));
    const vistos = new Set();
    for (const uso of usos) {
      if (!limpios.has(String(uso.claveId))) continue;
      const identidad = String(uso.usuarioId || uso.username || '');
      if (!identidad) continue;
      const llave = `${uso.claveId}:${identidad}`;
      if (vistos.has(llave)) continue;
      vistos.add(llave);
      const usuario = uso.usuarioId ? porId.get(uso.usuarioId) : null;
      if (!mapa[uso.claveId]) mapa[uso.claveId] = [];
      mapa[uso.claveId].push({
        id: uso.usuarioId || null,
        username: usuario?.username || uso.username || null,
        nombre: usuario?.nombre || uso.nombre || null
      });
    }
    return mapa;
  }

  async actualizarClaveAcceso(id, cambios = {}) {
    await this.almacen.transaccion('claves_acceso', [], (lista) => {
      const indice = lista.findIndex((c) => c.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
    const lista = await this.todasLasClaves();
    return lista.find((c) => c.id === id) || null;
  }

  async registrarUsoClave(id, { usuarioId = null, ipHash = null } = {}) {
    await this.almacen.transaccion('claves_acceso', [], (lista) => {
      const indice = lista.findIndex((c) => c.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], usos: Number(copia[indice].usos || 0) + 1 };
      return { datos: copia, resultado: copia[indice] };
    });
    return this.almacen.transaccion('clave_acceso_usos', [], (lista) => ({
      datos: [
        ...lista,
        { id: `uso_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, claveId: id, usuarioId, ipHash, creadoEn: new Date().toISOString() }
      ]
    }));
  }

  /* ------------------------------- incidencias ----------------------------- */

  async buscarIncidencias(filtros = {}) {
    const {
      municipioId,
      municipios,
      estados,
      estadoEntidad,
      ambito,
      userKey,
      texto,
      estado,
      tipoId,
      zonaId,
      desde,
      hasta,
      orden = 'reciente',
      ocultas = 'excluir',
      ocultasDe = null,
      incluirSimulados = false
    } = filtros;
    let lista = await this.almacen.leer('incidencias', []);
    if (!incluirSimulados) lista = lista.filter((i) => i.simulado !== true);

    if (userKey) lista = lista.filter((i) => i.userKey === userKey);
    if (municipioId) lista = lista.filter((i) => i.municipioId === municipioId);
    if (Array.isArray(municipios) && municipios.length) {
      const permitidos = new Set(municipios);
      lista = lista.filter((i) => permitidos.has(i.municipioId));
    }

    // Los incidentes guardados antes de la migración 010 no tienen
    // `estadoEntidad`: se deriva del catálogo de municipios.
    if (estadoEntidad || (Array.isArray(estados) && estados.length)) {
      const catalogo = await this.#leerCatalogo('municipios', municipiosSemilla);
      const estadoDeMunicipio = new Map(catalogo.map((m) => [m.id, m.estado]));
      const estadoDe = (i) => i.estadoEntidad || estadoDeMunicipio.get(i.municipioId) || null;
      if (estadoEntidad) lista = lista.filter((i) => estadoDe(i) === estadoEntidad);
      if (Array.isArray(estados) && estados.length) {
        const permitidos = new Set(estados);
        lista = lista.filter((i) => permitidos.has(estadoDe(i)));
      }
    }
    if (ambito && ambito !== 'todos') lista = lista.filter((i) => (i.ambito || 'urbano') === ambito);
    if (estado && estado !== 'todos') lista = lista.filter((i) => i.estado === estado);
    if (tipoId && tipoId !== 'todos') lista = lista.filter((i) => i.tipoId === tipoId);
    if (zonaId && zonaId !== 'todos') lista = lista.filter((i) => i.zonaId === zonaId);
    if (desde) lista = lista.filter((i) => String(i.fecha) >= desde);
    if (hasta) lista = lista.filter((i) => String(i.fecha) <= hasta);
    if (texto) lista = lista.filter((i) => coincideTexto(i, texto));

    // Qué hacer con las publicaciones retiradas por moderación. `propias` deja
    // ver las visibles de todos más las ocultas del propio autor.
    if (ocultas === 'excluir') lista = lista.filter((i) => i.oculta !== true);
    else if (ocultas === 'propias') {
      lista = lista.filter((i) => i.oculta !== true || i.userKey === ocultasDe);
    }

    return this.#ordenarPorFecha(lista, orden);
  }

  /**
   * Versión ligera para el mapa: sin evidencias, historial ni comentarios.
   * El detalle completo se pide aparte solo cuando se abre una incidencia.
   */
  async puntosIncidencias(filtros = {}) {
    const { bbox = null, limite = 3000 } = filtros;
    let lista = await this.buscarIncidencias(filtros);

    if (Array.isArray(bbox) && bbox.length === 4) {
      const [minLng, minLat, maxLng, maxLat] = bbox.map(Number);
      lista = lista.filter(
        (i) => i.lat >= minLat && i.lat <= maxLat && i.lng >= minLng && i.lng <= maxLng
      );
    }

    return lista.slice(0, Math.min(Number(limite) || 3000, 5000)).map((i) => ({
      id: i.id,
      tipoId: i.tipoId,
      iconoCustom: i.iconoCustom || '',
      titulo: i.titulo,
      resumen: String(i.descripcion || '').slice(0, 160),
      lat: Number(i.lat),
      lng: Number(i.lng),
      fecha: i.fecha,
      estado: i.estado,
      municipioId: i.municipioId,
      estadoEntidad: i.estadoEntidad || null,
      ambito: i.ambito || 'urbano',
      viaNombre: i.viaNombre || '',
      kilometro: i.kilometro ?? null,
      zonaNombre: i.zonaNombre || null,
      peligrosa: i.peligrosa === true,
      autorNombre: i.esAnonimo ? 'Anónimo' : i.autorNombre,
      esAnonimo: i.esAnonimo === true,
      userKey: i.userKey
    }));
  }

  async todasLasIncidencias() {
    return this.almacen.leer('incidencias', []);
  }

  async incidenciaPorId(id) {
    const lista = await this.todasLasIncidencias();
    return lista.find((i) => i.id === id) || null;
  }

  async incidenciaPorIdempotencia(userKey, clave) {
    if (!userKey || !clave) return null;
    const lista = await this.todasLasIncidencias();
    return lista.find((i) => i.userKey === userKey && i.claveIdempotencia === clave) || null;
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

  async notificacionesDe(userKey, { limite = 200, incluirArchivadas = false } = {}) {
    const lista = await this.todasLasNotificaciones();
    return lista
      .filter((n) => !n.paraUsuario || n.paraUsuario === userKey)
      .filter((n) => incluirArchivadas || !n.archivadaEn)
      .filter((n) => !n.eliminadaEn)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, Math.min(Number(limite) || 200, 500));
  }

  async notificacionPorId(id) {
    const lista = await this.todasLasNotificaciones();
    return lista.find((n) => n.id === id) || null;
  }

  async notificacionPorDedupe(userKey, clave) {
    if (!clave) return null;
    const lista = await this.todasLasNotificaciones();
    return (
      lista.find((n) => n.paraUsuario === userKey && n.claveDedupe === String(clave)) || null
    );
  }

  async todasLasNotificaciones() {
    return this.almacen.leer('notificaciones', []);
  }

  async crearNotificacion(notificacion) {
    return this.almacen.transaccion('notificaciones', [], (lista) => {
      // Dedupe defensivo: la clave identifica un aviso concreto para una cuenta.
      if (
        notificacion.claveDedupe &&
        lista.some(
          (n) =>
            n.paraUsuario === notificacion.paraUsuario &&
            n.claveDedupe === notificacion.claveDedupe
        )
      ) {
        return { datos: lista, resultado: notificacion };
      }
      return { datos: [...lista, notificacion], resultado: notificacion };
    });
  }

  async marcarNotificacionLeida(id) {
    return this.almacen.transaccion('notificaciones', [], (lista) => {
      const indice = lista.findIndex((n) => n.id === id);
      if (indice === -1) return { datos: lista, resultado: false };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], leida: true, leidaEn: new Date().toISOString() };
      return { datos: copia, resultado: true };
    });
  }

  async marcarNotificacionesLeidas(userKey) {
    return this.almacen.transaccion('notificaciones', [], (lista) => {
      let marcadas = 0;
      const ahora = new Date().toISOString();
      const copia = lista.map((n) => {
        if (n.leida || (n.paraUsuario && n.paraUsuario !== userKey)) return n;
        marcadas++;
        return { ...n, leida: true, leidaEn: ahora };
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

  /* --------------------- preferencias por evento y reglas ------------------ */

  async preferenciasEventosDe(usuarioId) {
    const filas = await this.almacen.leer('preferencia_eventos', []);
    return Object.fromEntries(
      filas.filter((f) => f.usuarioId === usuarioId).map((f) => [f.evento, f.canal])
    );
  }

  async guardarPreferenciaEvento(usuarioId, evento, canal) {
    return this.almacen.transaccion('preferencia_eventos', [], (lista) => {
      const indice = lista.findIndex((f) => f.usuarioId === usuarioId && f.evento === evento);
      const fila = { usuarioId, evento, canal, actualizadoEn: new Date().toISOString() };
      const datos = lista.slice();
      if (indice === -1) datos.push(fila);
      else datos[indice] = fila;
      return { datos, resultado: fila };
    });
  }

  async configuracionNotificacion(evento) {
    const lista = await this.almacen.leer('configuracion_notificaciones', []);
    return lista.find((c) => c.evento === evento) || null;
  }

  async configuracionesNotificacion() {
    return this.almacen.leer('configuracion_notificaciones', []);
  }

  async guardarConfiguracionNotificacion(evento, datos = {}) {
    return this.almacen.transaccion('configuracion_notificaciones', [], (lista) => {
      const fila = {
        evento,
        activo: datos.activo !== false,
        canal: datos.canal || 'app',
        severidad: datos.severidad || 'info',
        alcance: datos.alcance || 'asignados',
        roles: datos.roles || [],
        municipios: datos.municipios || [],
        estados: datos.estados || [],
        actualizadoPor: datos.actualizadoPor || null,
        actualizadoEn: new Date().toISOString()
      };
      const indice = lista.findIndex((c) => c.evento === evento);
      const copia = lista.slice();
      if (indice === -1) copia.push(fila);
      else copia[indice] = fila;
      return { datos: copia, resultado: fila };
    });
  }

  /* ------------------------------- sesiones -------------------------------- */

  async registrarSesion(sesion) {
    return this.almacen.transaccion('sesiones_usuario', [], (lista) => {
      const indice = lista.findIndex((s) => s.id === sesion.id);
      const ahora = new Date().toISOString();
      if (indice === -1) {
        return {
          datos: [
            ...lista,
            {
              id: sesion.id,
              usuarioId: sesion.usuarioId || null,
              userKey: sesion.userKey || null,
              rol: sesion.rol || null,
              municipioId: sesion.municipioId || null,
              claveId: sesion.claveId || null,
              ipHash: sesion.ipHash || null,
              userAgent: sesion.userAgent || null,
              inicio: ahora,
              ultimaActividad: ahora,
              cerradaEn: null,
              motivoCierre: null
            }
          ]
        };
      }
      const copia = lista.slice();
      copia[indice] = {
        ...copia[indice],
        usuarioId: sesion.usuarioId || copia[indice].usuarioId || null,
        rol: sesion.rol || copia[indice].rol,
        municipioId: sesion.municipioId || copia[indice].municipioId,
        claveId: sesion.claveId || copia[indice].claveId || null,
        ultimaActividad: ahora
      };
      return { datos: copia };
    });
  }

  async sesionPorId(id) {
    const lista = await this.almacen.leer('sesiones_usuario', []);
    return lista.find((s) => s.id === id) || null;
  }

  async cerrarSesion(id, motivo = 'cierre') {
    return this.almacen.transaccion('sesiones_usuario', [], (lista) => {
      const indice = lista.findIndex((s) => s.id === id);
      if (indice === -1) return { datos: lista };
      const copia = lista.slice();
      copia[indice] = {
        ...copia[indice],
        cerradaEn: new Date().toISOString(),
        motivoCierre: motivo
      };
      return { datos: copia };
    });
  }

  /** Cierra todas las sesiones abiertas con una clave y devuelve las afectadas. */
  async cerrarSesionesPorClave(claveId, motivo = 'clave eliminada') {
    const cerradas = [];
    const ahora = new Date().toISOString();
    await this.almacen.transaccion('sesiones_usuario', [], (lista) => {
      const copia = lista.map((sesion) => {
        if (sesion.claveId !== claveId || sesion.cerradaEn) return sesion;
        cerradas.push({
          id: sesion.id,
          usuarioId: sesion.usuarioId || null,
          userKey: sesion.userKey || null,
          claveId: sesion.claveId
        });
        return { ...sesion, cerradaEn: ahora, motivoCierre: motivo };
      });
      return { datos: copia };
    });
    return cerradas;
  }

  async listarSesiones({ limite = 200, claveId = null } = {}) {
    const [lista, claves] = await Promise.all([
      this.almacen.leer('sesiones_usuario', []),
      this.almacen.leer('claves_acceso', [])
    ]);
    const porId = new Map(claves.map((c) => [c.id, c]));
    return lista
      .filter((s) => !s.cerradaEn)
      .filter((s) => !claveId || s.claveId === claveId)
      .sort((a, b) => String(b.ultimaActividad).localeCompare(String(a.ultimaActividad)))
      .slice(0, Math.min(Number(limite) || 200, 500))
      .map((s) => {
        const clave = s.claveId ? porId.get(s.claveId) : null;
        return {
          ...s,
          claveCodigo: clave?.codigo || null,
          claveNombre: clave?.nombre || null
        };
      });
  }

  /* ------------------------------- auditoría ------------------------------- */

  async registrarAuditoria(registro) {
    return this.almacen.transaccion('auditoria', [], (lista) => ({
      datos: [...lista, registro],
      resultado: registro
    }));
  }

  async listarAuditoria({
    limite = 200,
    username = null,
    accion = null,
    desde = null,
    hasta = null
  } = {}) {
    const lista = await this.almacen.leer('auditoria', []);
    const claves = await this.almacen.leer('claves_acceso', []);
    const porId = new Map(claves.map((c) => [c.id, c]));
    const objetivoUsuario = String(username || '').toLowerCase();
    const objetivoAccion = String(accion || '').toLowerCase();
    const fechaCompleta = (valor, fin) => {
      const texto = String(valor || '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        return new Date(`${texto}T${fin ? '23:59:59.999' : '00:00:00.000'}`).getTime();
      }
      return new Date(texto).getTime();
    };
    const desdeMs = desde ? fechaCompleta(desde, false) : null;
    const hastaMs = hasta ? fechaCompleta(hasta, true) : null;
    return lista
      .filter((r) => {
        if (objetivoUsuario && !String(r.username || '').toLowerCase().includes(objetivoUsuario)) {
          return false;
        }
        if (objetivoAccion && !String(r.accion || '').toLowerCase().includes(objetivoAccion)) {
          return false;
        }
        const cuando = new Date(r.creadoEn).getTime();
        if (desdeMs !== null && cuando < desdeMs) return false;
        if (hastaMs !== null && cuando > hastaMs) return false;
        return true;
      })
      .sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)))
      .slice(0, Math.min(Number(limite) || 200, 500))
      .map((r) => {
        const clave = r.claveId ? porId.get(r.claveId) : null;
        return {
          ...r,
          claveCodigo: clave?.codigo || null,
          claveNombre: clave?.nombre || null
        };
      });
  }

  /* --------------------------- solicitudes de acceso ----------------------- */

  async crearSolicitudAcceso(solicitud) {
    return this.almacen.transaccion('solicitudes_acceso', [], (lista) => ({
      datos: [...lista, solicitud],
      resultado: solicitud
    }));
  }

  async solicitudesAcceso({ estado = null } = {}) {
    const lista = await this.almacen.leer('solicitudes_acceso', []);
    return lista
      .filter((s) => !estado || s.estado === estado)
      .sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)));
  }

  async solicitudAccesoPorId(id) {
    const lista = await this.almacen.leer('solicitudes_acceso', []);
    return lista.find((s) => s.id === id) || null;
  }

  async solicitudAccesoAbiertaPorCorreo(correo) {
    const objetivo = String(correo || '').trim().toLowerCase();
    const lista = await this.almacen.leer('solicitudes_acceso', []);
    return lista.find(
      (s) => String(s.correo).toLowerCase() === objetivo && s.estado === 'pendiente'
    ) || null;
  }

  async actualizarSolicitudAcceso(id, cambios = {}) {
    return this.almacen.transaccion('solicitudes_acceso', [], (lista) => {
      const indice = lista.findIndex((s) => s.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  /* -------------------------------- tickets -------------------------------- */

  async crearTicket(ticket) {
    return this.almacen.transaccion('tickets', [], (lista) => ({
      datos: [...lista, ticket],
      resultado: ticket
    }));
  }

  /** Tickets visibles para una cuenta o para el equipo (con filtros). */
  async ticketsDe({
    userKey = null,
    todos = false,
    estado = null,
    prioridad = null,
    categoria = null,
    asignadoA = undefined,
    municipioId = null,
    texto = null,
    incluirSimulados = false,
    limite = 200
  } = {}) {
    const lista = await this.almacen.leer('tickets', []);
    const objetivo = String(texto || '').toLowerCase();
    return lista
      .filter((t) => incluirSimulados || t.simulado !== true)
      .filter((t) => todos || t.autorUserKey === userKey)
      .filter((t) => !estado || t.estado === estado)
      .filter((t) => !prioridad || t.prioridad === prioridad)
      .filter((t) => !categoria || t.categoria === categoria)
      .filter((t) => {
        if (asignadoA === null) return !t.asignadoA;
        if (asignadoA) return t.asignadoA === asignadoA;
        return true;
      })
      .filter((t) => !municipioId || t.municipioId === municipioId)
      .filter(
        (t) =>
          !objetivo ||
          String(t.asunto || '').toLowerCase().includes(objetivo) ||
          String(t.folio || '').toLowerCase().includes(objetivo)
      )
      .sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)))
      .slice(0, Math.min(Number(limite) || 200, 500));
  }

  async ticketPorId(id) {
    const tickets = await this.almacen.leer('tickets', []);
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket) return null;
    const [mensajes, eventos] = await Promise.all([
      this.almacen.leer('ticket_mensajes', []),
      this.almacen.leer('ticket_eventos', [])
    ]);
    return {
      ...ticket,
      mensajes: mensajes
        .filter((m) => m.ticketId === id)
        .sort((a, b) => String(a.creadoEn).localeCompare(String(b.creadoEn))),
      eventos: eventos
        .filter((e) => e.ticketId === id)
        .sort((a, b) => String(a.creadoEn).localeCompare(String(b.creadoEn)))
    };
  }

  async actualizarTicket(id, cambios = {}) {
    return this.almacen.transaccion('tickets', [], (lista) => {
      const indice = lista.findIndex((t) => t.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async crearTicketMensaje(mensaje) {
    return this.almacen.transaccion('ticket_mensajes', [], (lista) => ({
      datos: [...lista, mensaje],
      resultado: mensaje
    }));
  }

  async crearTicketEvento(evento) {
    return this.almacen.transaccion('ticket_eventos', [], (lista) => ({
      datos: [...lista, evento],
      resultado: evento
    }));
  }

  async reglasTickets() {
    return this.almacen.leer('reglas_tickets', []);
  }

  async crearReglaTicket(regla) {
    return this.almacen.transaccion('reglas_tickets', [], (lista) => ({
      datos: [...lista, regla],
      resultado: regla
    }));
  }

  async eliminarReglaTicket(id) {
    return this.almacen.transaccion('reglas_tickets', [], (lista) => {
      const filtradas = lista.filter((r) => r.id !== id);
      return { datos: filtradas, resultado: filtradas.length !== lista.length };
    });
  }

  /* -------------------------------- denuncias ------------------------------ */

  /**
   * Denuncias con filtros opcionales.
   * `propias` se resuelve aquí igual que en las incidencias: el recorte por
   * `userKey` deja ver las denuncias del denunciante y el recorte por
   * `objetivoUserKey` las que ha recibido una cuenta.
   */
  async denunciasDe(filtros = {}) {
    const { incidenciaId, comentarioId, municipioId, autorUserKey, objetivoUserKey, estado, orden = 'reciente' } = filtros;
    let lista = await this.almacen.leer('denuncias', []);

    if (incidenciaId) lista = lista.filter((d) => d.incidenciaId === incidenciaId);
    if (comentarioId) lista = lista.filter((d) => d.comentarioId === comentarioId);
    if (municipioId) lista = lista.filter((d) => d.municipioId === municipioId);
    if (autorUserKey) lista = lista.filter((d) => d.autorUserKey === autorUserKey);
    if (objetivoUserKey) lista = lista.filter((d) => d.objetivoUserKey === objetivoUserKey);
    if (estado) lista = lista.filter((d) => d.estado === estado);

    return this.#ordenarPorFecha(lista, orden);
  }

  async denunciaPorId(id) {
    const lista = await this.almacen.leer('denuncias', []);
    return lista.find((d) => d.id === id) || null;
  }

  async crearDenuncia(denuncia) {
    return this.almacen.transaccion('denuncias', [], (lista) => ({
      datos: [...lista, denuncia],
      resultado: denuncia
    }));
  }

  async actualizarDenuncia(id, denuncia) {
    return this.almacen.transaccion('denuncias', [], (lista) => {
      const indice = lista.findIndex((d) => d.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = denuncia;
      return { datos: copia, resultado: denuncia };
    });
  }

  async borrarDenuncias() {
    return this.almacen.transaccion('denuncias', [], (lista) => ({
      datos: [],
      resultado: lista.length
    }));
  }

  /* ------------------- solicitudes públicas e informes --------------------- */

  async crearSolicitudInforme(solicitud) {
    return this.almacen.transaccion('solicitudes_informe', [], (lista) => ({
      datos: [...lista, solicitud],
      resultado: solicitud
    }));
  }

  async solicitudInformePorFolio(folio) {
    const lista = await this.almacen.leer('solicitudes_informe', []);
    const objetivo = String(folio || '').trim().toUpperCase();
    return lista.find((s) => String(s.folio).toUpperCase() === objetivo) || null;
  }

  async solicitudInformePorToken(token) {
    if (!token) return null;
    const lista = await this.almacen.leer('solicitudes_informe', []);
    return lista.find((s) => s.tokenVerificacion === token) || null;
  }

  async solicitudInformePorId(id) {
    const lista = await this.almacen.leer('solicitudes_informe', []);
    return lista.find((s) => s.id === id) || null;
  }

  async actualizarSolicitudInforme(id, cambios = {}) {
    return this.almacen.transaccion('solicitudes_informe', [], (lista) => {
      const indice = lista.findIndex((s) => s.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...lista[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async solicitudesInforme(filtros = {}) {
    const lista = await this.almacen.leer('solicitudes_informe', []);
    return lista
      .filter((s) => filtros.incluirSimulados || s.simulado !== true)
      .filter((s) => !filtros.estado || s.estado === filtros.estado)
      .filter((s) => !filtros.correo || s.correo === filtros.correo)
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn))
      .slice(0, Number(filtros.limite) || 500)
      .map((s) => s);
  }

  async bloqueoVigente({ correo, ipHash, ahora = new Date() } = {}) {
    const lista = await this.almacen.leer('bloqueos_publicos', []);
    const email = String(correo || '').trim().toLowerCase();
    return (
      lista.find((b) => {
        if (b.activo === false) return false;
        if (b.hasta && new Date(b.hasta).getTime() <= ahora.getTime()) return false;
        return (email && String(b.correo || '').toLowerCase() === email) || (ipHash && b.ipHash === ipHash);
      }) || null
    );
  }

  async crearBloqueo(bloqueo) {
    return this.almacen.transaccion('bloqueos_publicos', [], (lista) => ({
      datos: [...lista, bloqueo],
      resultado: bloqueo
    }));
  }

  async listarBloqueos({ soloActivos = false } = {}) {
    const lista = await this.almacen.leer('bloqueos_publicos', []);
    return (soloActivos ? lista.filter((b) => b.activo !== false) : lista).sort(
      (a, b) => new Date(b.creadoEn) - new Date(a.creadoEn)
    );
  }

  async desactivarBloqueo(id, datos = {}) {
    return this.almacen.transaccion('bloqueos_publicos', [], (lista) => {
      const indice = lista.findIndex((b) => b.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = {
        ...lista[indice],
        activo: false,
        desactivadoPor: datos.por || null,
        desactivadoEn: new Date().toISOString()
      };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async registrarEnvioCorreo(envio) {
    return this.almacen.transaccion('envios_correo', [], (lista) => ({
      datos: [...lista.slice(-9999), envio],
      resultado: envio
    }));
  }

  async enviosCorreo({ limite = 200 } = {}) {
    const lista = await this.almacen.leer('envios_correo', []);
    return lista.slice(-Math.min(Number(limite) || 200, 1000)).reverse();
  }

  /* --------------------- contacto, sugerencias y mensajes ------------------ */

  async crearMensajeContacto(mensaje) {
    return this.almacen.transaccion('mensajes_contacto', [], (lista) => ({
      datos: [...lista, mensaje],
      resultado: mensaje
    }));
  }

  async mensajesContacto({ municipios = null, estado = null, limite = 200 } = {}) {
    const lista = await this.almacen.leer('mensajes_contacto', []);
    const permitidos = Array.isArray(municipios) ? new Set(municipios) : null;
    return lista
      .filter((m) => !permitidos || permitidos.has(m.municipioId))
      .filter((m) => !estado || m.estado === estado)
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn))
      .slice(0, Math.min(Number(limite) || 200, 500));
  }

  async mensajeContactoPorId(id) {
    const lista = await this.almacen.leer('mensajes_contacto', []);
    return lista.find((m) => m.id === id) || null;
  }

  async actualizarMensajeContacto(id, cambios = {}) {
    return this.almacen.transaccion('mensajes_contacto', [], (lista) => {
      const indice = lista.findIndex((m) => m.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...lista[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async crearSugerencia(sugerencia) {
    return this.almacen.transaccion('sugerencias', [], (lista) => ({
      datos: [...lista, sugerencia],
      resultado: sugerencia
    }));
  }

  async sugerencias({ estado = null, municipios = null, incluirSimulados = false, limite = 200 } = {}) {
    const lista = await this.almacen.leer('sugerencias', []);
    const permitidos = Array.isArray(municipios) ? new Set(municipios) : null;
    return lista
      .filter((s) => incluirSimulados || s.simulado !== true)
      .filter((s) => !estado || s.estado === estado)
      .filter((s) => !permitidos || permitidos.has(s.municipioId))
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn))
      .slice(0, Math.min(Number(limite) || 200, 500));
  }

  async sugerenciaPorFolio(folio) {
    const lista = await this.almacen.leer('sugerencias', []);
    const objetivo = String(folio || '').trim().toUpperCase();
    return lista.find((s) => String(s.folio).toUpperCase() === objetivo) || null;
  }

  async actualizarSugerencia(id, cambios = {}) {
    return this.almacen.transaccion('sugerencias', [], (lista) => {
      const indice = lista.findIndex((s) => s.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...lista[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async crearMensajeDirecto(mensaje) {
    return this.almacen.transaccion('mensajes_directos', [], (lista) => ({
      datos: [...lista, mensaje],
      resultado: mensaje
    }));
  }

  async mensajeDirectoPorId(id) {
    const lista = await this.almacen.leer('mensajes_directos', []);
    return lista.find((m) => m.id === id) || null;
  }

  async mensajesDirectos({
    usuario = null,
    esAdmin = false,
    municipios = [],
    estados = [],
    hilo = null,
    limite = 300
  } = {}) {
    const lista = await this.almacen.leer('mensajes_directos', []);
    const permitidos = new Set(municipios || []);
    const estadosPermitidos = new Set(estados || []);
    return lista
      .filter((m) => {
        if (hilo) return m.hilo === hilo;
        if (esAdmin) return true;
        if (!usuario) return false;
        return (
          m.paraUsuario === usuario ||
          m.deUsuario === usuario ||
          (!m.paraUsuario && m.paraMunicipio && permitidos.has(m.paraMunicipio)) ||
          (!m.paraUsuario && m.paraEstado && estadosPermitidos.has(m.paraEstado))
        );
      })
      .sort((a, b) => new Date(a.creadoEn) - new Date(b.creadoEn))
      .slice(-Math.min(Number(limite) || 300, 1000));
  }

  async marcarMensajeLeido(id, usuario) {
    return this.almacen.transaccion('mensajes_directos', [], (lista) => {
      const indice = lista.findIndex((m) => m.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const mensaje = lista[indice];
      if (mensaje.paraUsuario && mensaje.paraUsuario !== usuario) {
        return { datos: lista, resultado: null };
      }
      const copia = lista.slice();
      copia[indice] = { ...mensaje, leido: true, leidoPor: usuario };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  /* ------------------------------ adjuntos --------------------------------- */

  async crearAdjunto(adjunto) {
    return this.almacen.transaccion('adjuntos', [], (lista) => ({
      datos: [...lista, adjunto],
      resultado: adjunto
    }));
  }

  async adjuntoPorId(id) {
    const lista = await this.almacen.leer('adjuntos', []);
    return lista.find((item) => item.id === id) || null;
  }

  async adjuntosDeContextos(tipo, ids = []) {
    if (!tipo || !ids.length) return [];
    const lista = await this.almacen.leer('adjuntos', []);
    const buscados = new Set(ids);
    return lista.filter(
      (item) =>
        item.contextoTipo === tipo &&
        item.estado === 'vinculado' &&
        buscados.has(item.contextoId)
    );
  }

  async adjuntosDeContexto(tipo, id) {
    return this.adjuntosDeContextos(tipo, id ? [id] : []);
  }

  async vincularAdjunto(id, { contextoTipo, contextoId }) {
    return this.almacen.transaccion('adjuntos', [], (lista) => {
      const indice = lista.findIndex((item) => item.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = {
        ...copia[indice],
        contextoTipo,
        contextoId,
        estado: 'vinculado',
        vinculadoEn: new Date().toISOString()
      };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async adjuntosPendientes({ usuarioId = null, userKey = null, proposito = null } = {}) {
    const lista = await this.almacen.leer('adjuntos', []);
    return lista.filter(
      (item) =>
        item.estado === 'pendiente' &&
        (usuarioId ? item.subidoPorUsuarioId === usuarioId : !userKey || item.subidoPorUserKey === userKey) &&
        (!proposito || item.proposito === proposito)
    );
  }

  async eliminarAdjunto(id) {
    return this.almacen.transaccion('adjuntos', [], (lista) => {
      const filtrados = lista.filter((item) => item.id !== id);
      return { datos: filtrados, resultado: filtrados.length !== lista.length };
    });
  }

  async comentarioIncidenciaPorId(id) {
    const incidencias = await this.almacen.leer('incidencias', []);
    for (const incidencia of incidencias) {
      const comentario = (incidencia.comentarios || []).find((item) => item.id === id);
      if (comentario) {
        return {
          id: comentario.id,
          incidenciaId: incidencia.id,
          autor: comentario.autor,
          texto: comentario.texto,
          userKey: comentario.userKey || null,
          oculto: comentario.oculto === true,
          eliminadoEn: comentario.eliminadoEn || null
        };
      }
    }
    return null;
  }

  /* ------------------ suscripciones y campañas de correo ------------------- */

  async crearSuscripcion(suscripcion) {
    return this.almacen.transaccion('suscripciones_correo', [], (lista) => ({
      datos: [...lista, suscripcion],
      resultado: suscripcion
    }));
  }

  async suscripcionPorCorreo(correo) {
    const lista = await this.almacen.leer('suscripciones_correo', []);
    const objetivo = String(correo || '').trim().toLowerCase();
    return lista.find((s) => String(s.correo || '').toLowerCase() === objetivo) || null;
  }

  async suscripcionPorToken(token) {
    if (!token) return null;
    const lista = await this.almacen.leer('suscripciones_correo', []);
    return lista.find((s) => s.token === token) || null;
  }

  async actualizarSuscripcion(id, cambios = {}) {
    return this.almacen.transaccion('suscripciones_correo', [], (lista) => {
      const indice = lista.findIndex((s) => s.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = {
        ...lista[indice],
        ...cambios,
        id,
        actualizadoEn: new Date().toISOString()
      };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async suscripcionesCorreo({ estado = null, municipioId = null, limite = 500 } = {}) {
    const lista = await this.almacen.leer('suscripciones_correo', []);
    return lista
      .filter((s) => !estado || s.estado === estado)
      .filter((s) => !municipioId || s.municipioId === municipioId)
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn))
      .slice(0, Math.min(Number(limite) || 500, 2000));
  }

  async crearCampana(campana) {
    return this.almacen.transaccion('campanas_correo', [], (lista) => ({
      datos: [...lista, campana],
      resultado: campana
    }));
  }

  async campanaPorId(id) {
    const lista = await this.almacen.leer('campanas_correo', []);
    return lista.find((c) => c.id === id) || null;
  }

  async campanasCorreo({ limite = 100 } = {}) {
    const lista = await this.almacen.leer('campanas_correo', []);
    return lista
      .slice()
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn))
      .slice(0, Math.min(Number(limite) || 100, 500));
  }

  async actualizarCampana(id, cambios = {}) {
    return this.almacen.transaccion('campanas_correo', [], (lista) => {
      const indice = lista.findIndex((c) => c.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...lista[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async guardarDestinatariosCampana(campanaId, destinatarios = []) {
    return this.almacen.transaccion('campana_destinatarios', [], (lista) => {
      const resto = lista.filter((d) => d.campanaId !== campanaId);
      return {
        datos: [...resto, ...destinatarios],
        resultado: destinatarios.length
      };
    });
  }

  async destinatariosCampana(campanaId) {
    const lista = await this.almacen.leer('campana_destinatarios', []);
    return lista.filter((d) => d.campanaId === campanaId);
  }

  async actualizarDestinatarioCampana(id, cambios = {}) {
    return this.almacen.transaccion('campana_destinatarios', [], (lista) => {
      const indice = lista.findIndex((d) => d.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...lista[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  /* ------------------------- configuración clave-valor --------------------- */

  async configuracion(clave) {
    const datos = await this.almacen.leer('configuracion', {});
    const fila = datos?.[clave];
    if (!fila) return null;
    let valor = fila.valor;
    try {
      valor = typeof valor === 'string' ? JSON.parse(valor) : valor;
    } catch {
      // Compatibilidad con valores antiguos guardados como texto plano.
    }
    return { clave, ...fila, valor };
  }

  async configuraciones() {
    const datos = await this.almacen.leer('configuracion', {});
    return Object.entries(datos || {}).map(([clave, fila]) => {
      let valor = fila.valor;
      try {
        valor = typeof valor === 'string' ? JSON.parse(valor) : valor;
      } catch {
        // Valor de texto plano.
      }
      return { clave, ...fila, valor };
    });
  }

  async guardarConfiguracion(clave, valor, actor = null) {
    const ahora = new Date().toISOString();
    return this.almacen.transaccion('configuracion', {}, (datos) => {
      const copia = { ...(datos || {}) };
      copia[clave] = {
        valor: JSON.stringify(valor),
        actualizadoPor: actor || null,
        actualizadoEn: ahora
      };
      return { datos: copia, resultado: { clave, ...copia[clave], valor } };
    });
  }

  /* ----------------------------- firmas ------------------------------------ */

  async crearRecoleccionFirma(recoleccion) {
    return this.almacen.transaccion('recolecciones_firmas', [], (lista) => ({
      datos: [...lista, recoleccion],
      resultado: recoleccion
    }));
  }

  async recoleccionFirmaPorId(id) {
    const lista = await this.almacen.leer('recolecciones_firmas', []);
    return lista.find((r) => r.id === id) || null;
  }

  async recoleccionFirmaPorIncidencia(incidenciaId) {
    const lista = await this.almacen.leer('recolecciones_firmas', []);
    return (
      lista.find((r) => r.tipo === 'incidencia' && r.incidenciaId === incidenciaId) || null
    );
  }

  async recoleccionesFirmas({ municipios = null, estado = null, incidenciaId = null, limite = 200 } = {}) {
    const lista = await this.almacen.leer('recolecciones_firmas', []);
    return lista
      .filter((r) => !municipios || municipios.includes(r.municipioId))
      .filter((r) => !estado || r.estado === estado)
      .filter((r) => !incidenciaId || r.incidenciaId === incidenciaId)
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn))
      .slice(0, Math.min(Number(limite) || 200, 1000));
  }

  async actualizarRecoleccionFirma(id, cambios = {}) {
    return this.almacen.transaccion('recolecciones_firmas', [], (lista) => {
      const indice = lista.findIndex((r) => r.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async crearFirmaIncidencia(firma) {
    return this.almacen.transaccion('recoleccion_firmas', [], (lista) => {
      const existente = lista.find(
        (f) => f.recoleccionId === firma.recoleccionId && f.userKey === firma.userKey
      );
      if (existente) return { datos: lista, resultado: existente };
      return { datos: [...lista, firma], resultado: firma };
    });
  }

  async firmaDeUsuario(recoleccionId, userKey) {
    const lista = await this.almacen.leer('recoleccion_firmas', []);
    return (
      lista.find((f) => f.recoleccionId === recoleccionId && f.userKey === userKey) || null
    );
  }

  async firmasDeRecoleccion(recoleccionId) {
    const lista = await this.almacen.leer('recoleccion_firmas', []);
    return lista
      .filter((f) => f.recoleccionId === recoleccionId)
      .sort((a, b) => new Date(a.creadoEn) - new Date(b.creadoEn));
  }

  async eliminarFirmaIncidencia(recoleccionId, userKey) {
    return this.almacen.transaccion('recoleccion_firmas', [], (lista) => {
      const filtradas = lista.filter(
        (f) => !(f.recoleccionId === recoleccionId && f.userKey === userKey)
      );
      return { datos: filtradas, resultado: filtradas.length !== lista.length };
    });
  }

  async contarFirmasDeUsuario(userKey) {
    const lista = await this.almacen.leer('recoleccion_firmas', []);
    return lista.filter((f) => f.userKey === userKey).length;
  }

  async crearEnvioFirma(envio) {
    return this.almacen.transaccion('recoleccion_firmas_envios', [], (lista) => ({
      datos: [...lista, envio],
      resultado: envio
    }));
  }

  async enviosDeRecoleccion(recoleccionId) {
    const lista = await this.almacen.leer('recoleccion_firmas_envios', []);
    return lista
      .filter((e) => e.recoleccionId === recoleccionId)
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn));
  }

  /* ------------------------- comentarios con reglas ----------------------- */

  async #comentariosDeIncidencia(incidenciaId) {
    const incidencia = await this.incidenciaPorId(incidenciaId);
    return Array.isArray(incidencia?.comentarios) ? incidencia.comentarios : [];
  }

  async comentariosDeIncidencia(
    incidenciaId,
    { incluirOcultos = false, incluirEliminados = false, pagina = 1, limite = 50 } = {}
  ) {
    const lista = await this.#comentariosDeIncidencia(incidenciaId);
    const filtrados = lista
      .filter((c) => incluirOcultos || c.oculto !== true)
      .filter((c) => incluirEliminados || !c.eliminadoEn)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const tamano = Math.min(Math.max(Number(limite) || 50, 1), 200);
    const salto = (Math.max(Number(pagina) || 1, 1) - 1) * tamano;
    return {
      comentarios: filtrados.slice(salto, salto + tamano),
      total: filtrados.length,
      pagina: Math.max(Number(pagina) || 1, 1),
      limite: tamano
    };
  }

  async crearComentarioIncidencia(incidenciaId, comentario) {
    return this.almacen.transaccion('incidencias', [], (lista) => {
      const indice = lista.findIndex((i) => i.id === incidenciaId);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      const comentarios = Array.isArray(copia[indice].comentarios)
        ? [...copia[indice].comentarios, comentario]
        : [comentario];
      copia[indice] = { ...copia[indice], comentarios, actualizado: new Date().toISOString() };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async actualizarComentarioIncidencia(incidenciaId, comentarioId, cambios = {}) {
    return this.almacen.transaccion('incidencias', [], (lista) => {
      const indice = lista.findIndex((i) => i.id === incidenciaId);
      if (indice === -1) return { datos: lista, resultado: null };
      const comentarios = (lista[indice].comentarios || []).map((c) =>
        c.id === comentarioId ? { ...c, ...cambios, id: comentarioId } : c
      );
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], comentarios };
      return {
        datos: copia,
        resultado: comentarios.find((c) => c.id === comentarioId) || null
      };
    });
  }

  async restriccionComentariosVigente({ usuarioId = null, userKey = null } = {}) {
    const lista = await this.almacen.leer('restricciones_comentarios', []);
    const ahora = Date.now();
    return (
      lista.find(
        (r) =>
          r.activo !== false &&
          ((usuarioId && r.usuarioId === usuarioId) || (userKey && r.userKey === userKey)) &&
          (!r.hasta || new Date(r.hasta).getTime() > ahora)
      ) || null
    );
  }

  async crearRestriccionComentarios(restriccion) {
    return this.almacen.transaccion('restricciones_comentarios', [], (lista) => ({
      datos: [...lista, restriccion],
      resultado: restriccion
    }));
  }

  async desactivarRestriccionComentarios(id) {
    return this.almacen.transaccion('restricciones_comentarios', [], (lista) => {
      const indice = lista.findIndex((r) => r.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], activo: false, desactivadoEn: new Date().toISOString() };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async contarComentariosRecientes(userKey, desde) {
    const incidencias = await this.almacen.leer('incidencias', []);
    const limite = new Date(desde).getTime();
    let total = 0;
    for (const incidencia of incidencias) {
      for (const comentario of incidencia.comentarios || []) {
        if (
          comentario.userKey === userKey &&
          !comentario.eliminadoEn &&
          new Date(comentario.fecha).getTime() >= limite
        ) {
          total += 1;
        }
      }
    }
    return total;
  }

  /* ------------------------------ legal ----------------------------------- */

  async documentoLegal(clave) {
    const datos = await this.almacen.leer('documentos_legales', {});
    return datos?.[clave] ? { clave, ...datos[clave] } : null;
  }

  async documentosLegales() {
    const datos = await this.almacen.leer('documentos_legales', {});
    return Object.entries(datos || {}).map(([clave, fila]) => ({ clave, ...fila }));
  }

  async guardarDocumentoLegal(clave, cambios = {}) {
    return this.almacen.transaccion('documentos_legales', {}, (datos) => {
      const copia = { ...(datos || {}) };
      copia[clave] = { ...(copia[clave] || {}), ...cambios };
      return { datos: copia, resultado: { clave, ...copia[clave] } };
    });
  }

  async historialLegal(clave) {
    const lista = await this.almacen.leer('documentos_legales_historial', []);
    return lista
      .filter((v) => v.clave === clave)
      .sort((a, b) => Number(b.version) - Number(a.version));
  }

  async crearVersionLegal(version) {
    return this.almacen.transaccion('documentos_legales_historial', [], (lista) => ({
      datos: [...lista, version],
      resultado: version
    }));
  }

  async versionLegal(clave, version) {
    const lista = await this.historialLegal(clave);
    return lista.find((v) => Number(v.version) === Number(version)) || null;
  }

  async ultimaAceptacionLegal(userKey) {
    const lista = await this.almacen.leer('aceptaciones_legales', []);
    return (
      lista
        .filter((aceptacion) => aceptacion.userKey === userKey)
        .sort((a, b) => String(b.aceptadoEn).localeCompare(String(a.aceptadoEn)))[0] || null
    );
  }

  async registrarAceptacionLegal(registro) {
    return this.almacen.transaccion('aceptaciones_legales', [], (lista) => ({
      datos: [...lista, registro],
      resultado: registro
    }));
  }

  /* -------------------- contacto directo a funcionarios ------------------- */

  async crearContactoFuncionario(contacto, destinatarios = []) {
    return this.almacen.transaccion('contactos_funcionarios', [], (lista) => {
      const copia = [...lista, contacto];
      return { datos: copia, resultado: contacto };
    }).then(async (creado) => {
      if (destinatarios.length) {
        await this.almacen.transaccion('contacto_funcionario_destinatarios', [], (lista) => ({
          datos: [...lista, ...destinatarios],
          resultado: destinatarios.length
        }));
      }
      return creado;
    });
  }

  async contactosFuncionarios({
    municipios = null,
    usuarioId = null,
    autorId = null,
    estado = null,
    texto = '',
    incluirSimulados = false,
    limite = 200
  } = {}) {
    const lista = await this.almacen.leer('contactos_funcionarios', []);
    let destinatarios = [];
    if (usuarioId) {
      destinatarios = await this.almacen.leer('contacto_funcionario_destinatarios', []);
    }
    const idsComoDestinatario = new Set(
      destinatarios.filter((d) => d.usuarioId === usuarioId).map((d) => d.contactoId)
    );
    const busqueda = String(texto || '').toLowerCase();
    return lista
      .filter((c) => incluirSimulados || c.simulado !== true)
      .filter((c) => !municipios || municipios.includes(c.municipioId))
      .filter((c) => !usuarioId || idsComoDestinatario.has(c.id))
      .filter((c) => !autorId || c.deUsuarioId === autorId)
      .filter((c) => !estado || c.estado === estado)
      .filter(
        (c) =>
          !busqueda ||
          String(c.folio || '').toLowerCase().includes(busqueda) ||
          String(c.asunto || '').toLowerCase().includes(busqueda) ||
          String(c.mensaje || '').toLowerCase().includes(busqueda)
      )
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn))
      .slice(0, Math.min(Number(limite) || 200, 500));
  }

  async contactoFuncionarioPorId(id) {
    const lista = await this.almacen.leer('contactos_funcionarios', []);
    const contacto = lista.find((c) => c.id === id);
    if (!contacto) return null;
    return {
      ...contacto,
      destinatarios: await this.contactoFuncionarioDestinatarios(id),
      mensajes: await this.mensajesContactoFuncionario(id)
    };
  }

  async actualizarContactoFuncionario(id, cambios = {}) {
    return this.almacen.transaccion('contactos_funcionarios', [], (lista) => {
      const indice = lista.findIndex((c) => c.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async contactoFuncionarioDestinatarios(contactoId) {
    const lista = await this.almacen.leer('contacto_funcionario_destinatarios', []);
    return lista.filter((d) => d.contactoId === contactoId);
  }

  async marcarContactoFuncionarioLeido(contactoId, usuarioId) {
    return this.almacen.transaccion('contacto_funcionario_destinatarios', [], (lista) => {
      const copia = lista.map((d) =>
        d.contactoId === contactoId && d.usuarioId === usuarioId && !d.leidoEn
          ? { ...d, leidoEn: new Date().toISOString() }
          : d
      );
      return { datos: copia, resultado: true };
    });
  }

  async crearMensajeContactoFuncionario(mensaje) {
    return this.almacen.transaccion('contacto_funcionario_mensajes', [], (lista) => ({
      datos: [...lista, mensaje],
      resultado: mensaje
    }));
  }

  async mensajesContactoFuncionario(contactoId) {
    const lista = await this.almacen.leer('contacto_funcionario_mensajes', []);
    return lista
      .filter((m) => m.contactoId === contactoId)
      .sort((a, b) => new Date(a.creadoEn) - new Date(b.creadoEn));
  }

  async mensajeContactoFuncionarioPorId(id) {
    const lista = await this.almacen.leer('contacto_funcionario_mensajes', []);
    return lista.find((m) => m.id === id) || null;
  }

  async crearSolicitudFuncionario(solicitud) {
    return this.almacen.transaccion('solicitudes_funcionario', [], (lista) => ({
      datos: [...lista, solicitud],
      resultado: solicitud
    }));
  }

  async solicitudesFuncionario({ estado = null, limite = 200 } = {}) {
    const lista = await this.almacen.leer('solicitudes_funcionario', []);
    return lista
      .filter((s) => !estado || s.estado === estado)
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn))
      .slice(0, Math.min(Number(limite) || 200, 500));
  }

  async actualizarSolicitudFuncionario(id, cambios = {}) {
    return this.almacen.transaccion('solicitudes_funcionario', [], (lista) => {
      const indice = lista.findIndex((s) => s.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  /* ---------------------- historial de notificaciones --------------------- */

  async notificacionesHistorial(
    userKey,
    { pagina = 1, limite = 30, evento = null, desde = null, hasta = null, texto = '', incluirArchivadas = true } = {}
  ) {
    const lista = await this.todasLasNotificaciones();
    const desdeMs = desde ? new Date(desde).getTime() : null;
    const hastaMs = hasta ? new Date(hasta).getTime() : null;
    const busqueda = String(texto || '').trim().toLowerCase();
    const filtradas = lista
      .filter((n) => !n.paraUsuario || n.paraUsuario === userKey)
      .filter((n) => incluirArchivadas || !n.archivadaEn)
      .filter((n) => !n.eliminadaEn)
      .filter((n) => !evento || n.evento === evento)
      .filter(
        (n) =>
          !busqueda ||
          String(n.titulo || '').toLowerCase().includes(busqueda) ||
          String(n.mensaje || '').toLowerCase().includes(busqueda)
      )
      .filter((n) => {
        const ms = new Date(n.fecha).getTime();
        return (!desdeMs || ms >= desdeMs) && (!hastaMs || ms <= hastaMs);
      })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const tamano = Math.min(Math.max(Number(limite) || 30, 1), 100);
    const salto = (Math.max(Number(pagina) || 1, 1) - 1) * tamano;
    return {
      notificaciones: filtradas.slice(salto, salto + tamano),
      total: filtradas.length,
      pagina: Math.max(Number(pagina) || 1, 1),
      limite: tamano
    };
  }

  async archivarNotificacion(id) {
    return this.almacen.transaccion('notificaciones', [], (lista) => {
      const indice = lista.findIndex((n) => n.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], archivadaEn: new Date().toISOString() };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async restaurarNotificacion(id) {
    return this.almacen.transaccion('notificaciones', [], (lista) => {
      const indice = lista.findIndex((n) => n.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], archivadaEn: null };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async archivarNotificaciones(userKey) {
    return this.almacen.transaccion('notificaciones', [], (lista) => {
      const ahora = new Date().toISOString();
      let total = 0;
      const copia = lista.map((n) => {
        if (n.paraUsuario && n.paraUsuario !== userKey) return n;
        if (n.archivadaEn) return n;
        total += 1;
        return { ...n, archivadaEn: ahora };
      });
      return { datos: copia, resultado: total };
    });
  }

  /* ------------------------------- folios --------------------------------- */

  async incidenciaPorFolio(folio) {
    const lista = await this.almacen.leer('incidencias', []);
    const objetivo = String(folio || '').trim().toUpperCase();
    return lista.find((i) => String(i.folio || '').toUpperCase() === objetivo) || null;
  }

  /* ------------------------------ respaldos -------------------------------- */

  async crearRespaldo(respaldo) {
    return this.almacen.transaccion('respaldos', [], (lista) => ({
      datos: [...lista, respaldo],
      resultado: respaldo
    }));
  }

  async respaldos({ texto = '', tipo = null, estado = null, desde = null, hasta = null, pagina = 1, limite = 30 } = {}) {
    const lista = await this.almacen.leer('respaldos', []);
    const busqueda = String(texto || '').toLowerCase();
    const desdeMs = desde ? new Date(desde).getTime() : null;
    const hastaMs = hasta ? new Date(hasta).getTime() : null;
    const filtrados = lista
      .filter((r) => !tipo || r.tipo === tipo)
      .filter((r) => !estado || r.estado === estado)
      .filter(
        (r) =>
          !busqueda ||
          String(r.nombre || '').toLowerCase().includes(busqueda) ||
          String(r.archivo || '').toLowerCase().includes(busqueda) ||
          String(r.notas || '').toLowerCase().includes(busqueda)
      )
      .filter((r) => {
        const ms = new Date(r.creadoEn).getTime();
        return (!desdeMs || ms >= desdeMs) && (!hastaMs || ms <= hastaMs);
      })
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn));
    const tamano = Math.min(Math.max(Number(limite) || 30, 1), 100);
    const salto = (Math.max(Number(pagina) || 1, 1) - 1) * tamano;
    return {
      respaldos: filtrados.slice(salto, salto + tamano),
      total: filtrados.length,
      pagina: Math.max(Number(pagina) || 1, 1),
      limite: tamano
    };
  }

  async respaldoPorId(id) {
    const lista = await this.almacen.leer('respaldos', []);
    return lista.find((r) => r.id === id) || null;
  }

  async actualizarRespaldo(id, cambios = {}) {
    return this.almacen.transaccion('respaldos', [], (lista) => {
      const indice = lista.findIndex((r) => r.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async crearEventoRespaldo(evento) {
    return this.almacen.transaccion('respaldos_eventos', [], (lista) => ({
      datos: [...lista, evento],
      resultado: evento
    }));
  }

  async eventosRespaldo(respaldoId) {
    const lista = await this.almacen.leer('respaldos_eventos', []);
    return lista
      .filter((e) => e.respaldoId === respaldoId)
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn));
  }

  /* ------------------------------ publicidad ------------------------------- */

  async crearPublicacionRed(publicacion) {
    return this.almacen.transaccion('publicaciones_redes', [], (lista) => ({
      datos: [...lista, publicacion],
      resultado: publicacion
    }));
  }

  async publicacionesRed({
    red = null,
    municipioId = null,
    estado = null,
    texto = '',
    pagina = 1,
    limite = 30
  } = {}) {
    const lista = await this.almacen.leer('publicaciones_redes', []);
    const busqueda = String(texto || '').trim().toLowerCase();
    const filtradas = lista
      .filter((p) => !red || p.red === red)
      .filter((p) => !municipioId || p.municipioId === municipioId)
      .filter((p) => !estado || p.estado === estado)
      .filter(
        (p) =>
          !busqueda ||
          String(p.titulo || '').toLowerCase().includes(busqueda) ||
          String(p.texto || '').toLowerCase().includes(busqueda) ||
          String(p.hashtags || '').toLowerCase().includes(busqueda)
      )
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn));
    const tamano = Math.min(Math.max(Number(limite) || 30, 1), 100);
    const salto = (Math.max(Number(pagina) || 1, 1) - 1) * tamano;
    return {
      publicaciones: filtradas.slice(salto, salto + tamano),
      total: filtradas.length,
      pagina: Math.max(Number(pagina) || 1, 1),
      limite: tamano
    };
  }

  async publicacionRedPorId(id) {
    const lista = await this.almacen.leer('publicaciones_redes', []);
    return lista.find((p) => p.id === id) || null;
  }

  async actualizarPublicacionRed(id, cambios = {}) {
    return this.almacen.transaccion('publicaciones_redes', [], (lista) => {
      const indice = lista.findIndex((p) => p.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async eliminarPublicacionRed(id) {
    return this.almacen.transaccion('publicaciones_redes', [], (lista) => {
      const filtradas = lista.filter((p) => p.id !== id);
      return { datos: filtradas, resultado: filtradas.length !== lista.length };
    });
  }

  /* ------------------------------ códigos QR ------------------------------- */

  async crearCodigoQr(codigo) {
    return this.almacen.transaccion('codigos_qr', [], (lista) => ({
      datos: [...lista, codigo],
      resultado: codigo
    }));
  }

  async codigoQrPorCodigo(codigo) {
    const lista = await this.almacen.leer('codigos_qr', []);
    return lista.find((item) => item.codigo === codigo) || null;
  }

  async codigoQrPorPublicacion(publicacionId) {
    const lista = await this.almacen.leer('codigos_qr', []);
    return lista.find((item) => item.publicacionId === publicacionId) || null;
  }

  async actualizarCodigoQr(id, cambios = {}) {
    return this.almacen.transaccion('codigos_qr', [], (lista) => {
      const indice = lista.findIndex((item) => item.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async registrarEscaneoQr(escaneo) {
    return this.almacen.transaccion('qr_escaneos', [], (lista) => ({
      datos: [...lista, escaneo],
      resultado: escaneo
    }));
  }

  async escaneosQr({ publicacionId = null, codigo = null, desde = null, hasta = null } = {}) {
    const lista = await this.almacen.leer('qr_escaneos', []);
    return lista
      .filter((item) => {
        if (publicacionId && item.publicacionId !== publicacionId) return false;
        if (codigo && item.codigo !== codigo) return false;
        if (desde && new Date(item.escaneadoEn) < new Date(desde)) return false;
        if (hasta && new Date(item.escaneadoEn) > new Date(hasta)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.escaneadoEn) - new Date(a.escaneadoEn));
  }

  async escaneoQrReciente({ codigo, userKey = null, ventanaMs = 30 * 60 * 1000 }) {
    const limite = Date.now() - ventanaMs;
    const lista = await this.almacen.leer('qr_escaneos', []);
    return (
      lista.find(
        (item) =>
          item.codigo === codigo &&
          (!userKey || item.userKey === userKey) &&
          new Date(item.escaneadoEn).getTime() >= limite
      ) || null
    );
  }

  /* ----------------------- correos institucionales -------------------------- */

  async crearCorreoInstitucional(correo) {
    return this.almacen.transaccion('correos_institucionales', [], (lista) => ({
      datos: [...lista, correo],
      resultado: correo
    }));
  }

  async correosInstitucionales({
    estado = null,
    municipioId = null,
    verificado = null,
    texto = '',
    pagina = 1,
    limite = 50
  } = {}) {
    const lista = await this.almacen.leer('correos_institucionales', []);
    const busqueda = String(texto || '').trim().toLowerCase();
    const filtrados = lista
      .filter((c) => !estado || c.estado === estado)
      .filter((c) => !municipioId || c.municipioId === municipioId)
      .filter((c) => verificado === null || verificado === undefined || c.verificado === verificado)
      .filter(
        (c) =>
          !busqueda ||
          String(c.correo || '').toLowerCase().includes(busqueda) ||
          String(c.estado || '').toLowerCase().includes(busqueda) ||
          String(c.dependencia || '').toLowerCase().includes(busqueda) ||
          String(c.cargo || '').toLowerCase().includes(busqueda)
      )
      .sort((a, b) => new Date(b.actualizadoEn) - new Date(a.actualizadoEn));
    const tamano = Math.min(Math.max(Number(limite) || 50, 1), 200);
    const salto = (Math.max(Number(pagina) || 1, 1) - 1) * tamano;
    return {
      correos: filtrados.slice(salto, salto + tamano),
      total: filtrados.length,
      pagina: Math.max(Number(pagina) || 1, 1),
      limite: tamano
    };
  }

  async correoInstitucionalPorId(id) {
    const lista = await this.almacen.leer('correos_institucionales', []);
    return lista.find((c) => c.id === id) || null;
  }

  async actualizarCorreoInstitucional(id, cambios = {}) {
    return this.almacen.transaccion('correos_institucionales', [], (lista) => {
      const indice = lista.findIndex((c) => c.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async eliminarCorreoInstitucional(id) {
    return this.almacen.transaccion('correos_institucionales', [], (lista) => {
      const filtradas = lista.filter((c) => c.id !== id);
      return { datos: filtradas, resultado: filtradas.length !== lista.length };
    });
  }

  /* ------------------------------- simulador -------------------------------- */

  async crearSesionSimulacion(sesion) {
    return this.almacen.transaccion('simulacion_sesiones', [], (lista) => ({
      datos: [...lista, sesion],
      resultado: sesion
    }));
  }

  async sesionesSimulacion({ adminId = null, estado = null, limite = 30 } = {}) {
    const lista = await this.almacen.leer('simulacion_sesiones', []);
    return lista
      .filter((s) => !adminId || s.adminId === adminId)
      .filter((s) => !estado || s.estado === estado)
      .sort((a, b) => new Date(b.creadaEn) - new Date(a.creadaEn))
      .slice(0, Math.min(Number(limite) || 30, 100));
  }

  async sesionSimulacionPorId(id) {
    const lista = await this.almacen.leer('simulacion_sesiones', []);
    return lista.find((s) => s.id === id) || null;
  }

  async actualizarSesionSimulacion(id, cambios = {}) {
    return this.almacen.transaccion('simulacion_sesiones', [], (lista) => {
      const indice = lista.findIndex((s) => s.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async crearOperacionSimulacion(operacion) {
    return this.almacen.transaccion('simulacion_operaciones', [], (lista) => ({
      datos: [...lista, operacion],
      resultado: operacion
    }));
  }

  async operacionesSimulacion(sesionId) {
    const lista = await this.almacen.leer('simulacion_operaciones', []);
    return lista
      .filter((o) => o.sesionId === sesionId)
      .sort((a, b) => Number(a.orden) - Number(b.orden));
  }

  async limpiarOperacionesSimulacion(sesionId) {
    return this.almacen.transaccion('simulacion_operaciones', [], (lista) => {
      const filtradas = lista.filter((o) => o.sesionId !== sesionId);
      return { datos: filtradas, resultado: lista.length - filtradas.length };
    });
  }

  /* ---------------------- fichas de información municipal ------------------ */

  async fichaMunicipio(municipioId) {
    const lista = await this.almacen.leer('municipios_informacion', []);
    return lista.find((f) => String(f.municipioId) === String(municipioId)) || null;
  }

  async fichasMunicipios() {
    return this.almacen.leer('municipios_informacion', []);
  }

  async guardarFichaMunicipio(ficha) {
    return this.almacen.transaccion('municipios_informacion', [], (lista) => {
      const indice = lista.findIndex((f) => f.municipioId === ficha.municipioId);
      const copia = lista.slice();
      if (indice === -1) copia.push(ficha);
      else copia[indice] = { ...copia[indice], ...ficha, id: copia[indice].id };
      return { datos: copia, resultado: indice === -1 ? ficha : copia[indice] };
    });
  }

  async actualizarFichaMunicipio(id, cambios = {}) {
    return this.almacen.transaccion('municipios_informacion', [], (lista) => {
      const indice = lista.findIndex((f) => f.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  /* ----------------------------- roles especiales -------------------------- */

  async rolesPersonalizados() {
    const lista = await this.almacen.leer('roles_personalizados', []);
    return lista.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  }

  async rolPersonalizadoPorId(id) {
    const lista = await this.rolesPersonalizados();
    return lista.find((r) => r.id === id) || null;
  }

  async crearRolPersonalizado(rol) {
    return this.almacen.transaccion('roles_personalizados', [], (lista) => ({
      datos: [...lista, rol],
      resultado: rol
    }));
  }

  async actualizarRolPersonalizado(id, cambios = {}) {
    return this.almacen.transaccion('roles_personalizados', [], (lista) => {
      const indice = lista.findIndex((r) => r.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
  }

  async eliminarRolPersonalizado(id) {
    const resultado = await this.almacen.transaccion('roles_personalizados', [], (lista) => {
      const filtrados = lista.filter((r) => r.id !== id);
      return { datos: filtrados, resultado: filtrados.length !== lista.length };
    });
    await this.almacen.transaccion('usuarios', [], (lista) => ({
      datos: lista.map((u) =>
        u.rolPersonalizadoId === id ? { ...u, rolPersonalizadoId: null } : u
      ),
      resultado: null
    }));
    return resultado;
  }

  /* -------------------------- solicitudes de permisos ---------------------- */

  async crearSolicitudPermiso(solicitud) {
    return this.almacen.transaccion('solicitudes_permisos', [], (lista) => ({
      datos: [...lista, solicitud],
      resultado: solicitud
    }));
  }

  async solicitudesPermiso({ usuarioId = null, estado = null, limite = 100 } = {}) {
    const lista = await this.almacen.leer('solicitudes_permisos', []);
    return lista
      .filter((s) => !usuarioId || s.usuarioId === usuarioId)
      .filter((s) => !estado || s.estado === estado)
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn))
      .slice(0, Math.min(Number(limite) || 100, 500));
  }

  async solicitudPermisoPorId(id) {
    const lista = await this.almacen.leer('solicitudes_permisos', []);
    return lista.find((s) => s.id === id) || null;
  }

  async actualizarSolicitudPermiso(id, cambios = {}) {
    return this.almacen.transaccion('solicitudes_permisos', [], (lista) => {
      const indice = lista.findIndex((s) => s.id === id);
      if (indice === -1) return { datos: lista, resultado: null };
      const copia = lista.slice();
      copia[indice] = { ...copia[indice], ...cambios, id };
      return { datos: copia, resultado: copia[indice] };
    });
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
