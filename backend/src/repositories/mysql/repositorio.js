/**
 * DRIVER MYSQL — implementación del contrato de repositorio con Knex.
 *
 * Expone exactamente los mismos métodos que el driver JSON
 * (../json/repositorio.js), así que los servicios no cambian al pasar de
 * archivos a MySQL/MariaDB: basta STORAGE_DRIVER=mysql.
 *
 * Diferencias de forma respecto al JSON:
 *  - historial, comentarios y evidencia son tablas hijas (antes iban dentro
 *    del documento);
 *  - las fechas son DATETIME en UTC y se exponen como cadenas ISO;
 *  - el color derivado no se guarda (igual que en el driver JSON).
 */
import knexFactory from 'knex';
import { config } from '../../config/index.js';
import { nuevoId } from '../../utils/ids.js';

const TABLAS = [
  'municipios',
  'zonas',
  'tipos',
  'usuarios',
  'incidencias',
  'incidencia_evidencias',
  'incidencia_historial',
  'incidencia_comentarios',
  'notificaciones',
  'denuncias'
];

const aFecha = (iso) => (iso ? new Date(iso) : null);
const desdeFecha = (valor) => (valor ? new Date(valor).toISOString() : null);
const aNumero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

export class RepositorioMysql {
  constructor({ client = config.db.client, connection = config.db.connection } = {}) {
    this.driver = 'mysql';
    this.knex = knexFactory({
      client,
      connection: { ...connection, timezone: 'Z', dateStrings: false },
      pool: { min: 0, max: 10 }
    });
  }

  /** Comprueba la conexión y que las migraciones estén aplicadas. */
  async inicializar() {
    try {
      await this.knex.raw('select 1 as ok');
    } catch (e) {
      throw new Error(
        `No se pudo conectar a MySQL (${config.db.connection.host}:${config.db.connection.port}): ${e.message}`
      );
    }

    const faltantes = [];
    for (const tabla of TABLAS) {
      if (!(await this.knex.schema.hasTable(tabla))) faltantes.push(tabla);
    }
    if (faltantes.length) {
      throw new Error(
        `Faltan tablas en la base de datos: ${faltantes.join(', ')}. ` +
          'Ejecuta "npm --prefix backend run migrate" y luego "npm run seed".'
      );
    }
  }

  /**
   * Comprobación ligera de salud (`GET /api/salud` y healthcheck del contenedor).
   * Solo lanza si la base de datos no responde; no mira las tablas.
   */
  async ping() {
    await this.knex.raw('select 1 as ok');
    return true;
  }

  async cerrar() {
    await this.knex.destroy();
  }

  /* ------------------------------ municipios ------------------------------ */

  #aMunicipio(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      nombre: fila.nombre,
      estado: fila.estado,
      clave: fila.clave,
      poblacion: Number(fila.poblacion) || 0,
      cabecera: fila.cabecera || null,
      center: [Number(fila.center_lat), Number(fila.center_lng)],
      zoom: Number(fila.zoom),
      poligono: typeof fila.poligono === 'string' ? JSON.parse(fila.poligono) : fila.poligono
    };
  }

  async todosMunicipios() {
    const filas = await this.knex('municipios').select('*').orderBy('nombre', 'asc');
    return filas.map((f) => this.#aMunicipio(f));
  }

  async municipioPorId(id) {
    const fila = await this.knex('municipios').where({ id }).first();
    return this.#aMunicipio(fila);
  }

  async municipioPorClave(clave) {
    const fila = await this.knex('municipios')
      .whereRaw('UPPER(clave) = ?', [String(clave || '').trim().toUpperCase()])
      .first();
    return this.#aMunicipio(fila);
  }

  /* --------------------------------- zonas -------------------------------- */

  #aZona(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      municipioId: fila.municipio_id,
      nombre: fila.nombre,
      tipo: fila.tipo,
      ambito: fila.ambito || null,
      clave: fila.clave || null,
      poblacion: Number(fila.poblacion) || 0,
      color: fila.color,
      poligono: typeof fila.poligono === 'string' ? JSON.parse(fila.poligono) : fila.poligono
    };
  }

  async todasLasZonas() {
    const filas = await this.knex('zonas').select('*');
    return filas.map((f) => this.#aZona(f));
  }

  async zonasPorMunicipio(municipioId) {
    const filas = await this.knex('zonas').where({ municipio_id: municipioId }).select('*');
    return filas.map((f) => this.#aZona(f));
  }

  /* --------------------------------- tipos -------------------------------- */

  #aTipo(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      nombre: fila.nombre,
      icono: fila.icono,
      // Aviso del concepto (solo lo traen los delicados, como «Sitio peligroso»).
      aviso: fila.aviso || '',
      custom: Boolean(fila.custom)
    };
  }

  async todosLosTipos() {
    const filas = await this.knex('tipos').select('*');
    return filas.map((f) => this.#aTipo(f));
  }

  async tipoPorId(id) {
    const fila = await this.knex('tipos').where({ id }).first();
    return this.#aTipo(fila);
  }

  async crearTipo(tipo) {
    await this.knex('tipos').insert({
      id: tipo.id,
      nombre: tipo.nombre,
      icono: tipo.icono,
      aviso: tipo.aviso || null,
      custom: tipo.custom === true
    });
    return tipo;
  }

  async eliminarTipo(id) {
    const borrados = await this.knex('tipos').where({ id }).del();
    return borrados > 0;
  }

  /* ------------------------------- usuarios ------------------------------- */

  #aUsuario(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      username: fila.username,
      nombre: fila.nombre,
      correo: fila.correo || null,
      rol: fila.rol,
      municipioId: fila.municipio_id,
      activo: Boolean(fila.activo),
      pseudonimo: Boolean(fila.pseudonimo),
      passwordHash: fila.password_hash,
      // Cuenta segura: verificación del correo, tokens de un solo uso, versión
      // de la sesión y bloqueo por intentos fallidos.
      correoVerificado: Boolean(fila.correo_verificado),
      tokenVerificacionHash: fila.token_verificacion_hash || null,
      tokenVerificacionExpira: desdeFecha(fila.token_verificacion_expira),
      resetTokenHash: fila.reset_token_hash || null,
      resetExpira: desdeFecha(fila.reset_expira),
      tokenVersion: aNumero(fila.token_version) || 1,
      intentosFallidos: aNumero(fila.intentos_fallidos) || 0,
      bloqueadoHasta: desdeFecha(fila.bloqueado_hasta),
      advertencias: aNumero(fila.advertencias) || 0,
      suspendido: Boolean(fila.suspendido),
      suspendidoHasta: desdeFecha(fila.suspendido_hasta),
      suspendidoMotivo: fila.suspendido_motivo || '',
      suspendidoPor: fila.suspendido_por || null
    };
  }

  async todosLosUsuarios() {
    const filas = await this.knex('usuarios').select('*');
    return filas.map((f) => this.#aUsuario(f));
  }

  async usuarioPorUsername(username) {
    const fila = await this.knex('usuarios')
      .whereRaw('LOWER(username) = ?', [String(username || '').trim().toLowerCase()])
      .first();
    return this.#aUsuario(fila);
  }

  /** Las cuentas ciudadanas entran con su correo (siempre en minúsculas). */
  async usuarioPorCorreo(correo) {
    const objetivo = String(correo || '').trim().toLowerCase();
    if (!objetivo) return null;
    const fila = await this.knex('usuarios').whereRaw('LOWER(correo) = ?', [objetivo]).first();
    return this.#aUsuario(fila);
  }

  async usuarioPorId(id) {
    const fila = await this.knex('usuarios').where({ id }).first();
    return this.#aUsuario(fila);
  }

  /** Cuenta a la que pertenece un token de verificación (se busca por su hash). */
  async usuarioPorTokenVerificacion(hash) {
    const buscado = String(hash || '');
    if (!buscado) return null;
    const fila = await this.knex('usuarios').where({ token_verificacion_hash: buscado }).first();
    return this.#aUsuario(fila);
  }

  /** Cuenta a la que pertenece un token de restablecimiento de contraseña. */
  async usuarioPorTokenRestablecimiento(hash) {
    const buscado = String(hash || '');
    if (!buscado) return null;
    const fila = await this.knex('usuarios').where({ reset_token_hash: buscado }).first();
    return this.#aUsuario(fila);
  }

  async crearUsuario(usuario) {
    await this.knex('usuarios').insert(this.#aFilaUsuario(usuario));
    return usuario;
  }

  /** Parche parcial: solo se escriben las columnas presentes en `cambios`. */
  async actualizarUsuario(id, cambios = {}) {
    const fila = this.#aFilaUsuario(cambios, { parcial: true });
    if (Object.keys(fila).length) await this.knex('usuarios').where({ id }).update(fila);
    return this.usuarioPorId(id);
  }

  /**
   * Borra la cuenta.
   * Sus reportes NO se van con ella: el servicio los anonimiza antes, porque el
   * ayuntamiento conserva el expediente aunque el vecino se dé de baja.
   */
  async eliminarUsuario(id) {
    const borrados = await this.knex('usuarios').where({ id }).del();
    return borrados > 0;
  }

  /** Traduce el objeto de dominio a columnas (y viceversa con `parcial`). */
  #aFilaUsuario(usuario, { parcial = false } = {}) {
    const fila = {};
    const tiene = (campo) => Object.prototype.hasOwnProperty.call(usuario, campo);
    const pon = (columna, valor, campo = columna) => {
      if (!parcial || tiene(campo)) fila[columna] = valor;
    };
    pon('id', usuario.id);
    pon('username', usuario.username);
    pon('nombre', usuario.nombre);
    pon('correo', usuario.correo ?? null);
    pon('rol', usuario.rol);
    pon('municipio_id', usuario.municipioId ?? null, 'municipioId');
    pon('activo', usuario.activo !== false);
    pon('pseudonimo', usuario.pseudonimo === true);
    pon('password_hash', usuario.passwordHash, 'passwordHash');
    pon('correo_verificado', usuario.correoVerificado === true, 'correoVerificado');
    pon('token_verificacion_hash', usuario.tokenVerificacionHash ?? null, 'tokenVerificacionHash');
    pon('token_verificacion_expira', aFecha(usuario.tokenVerificacionExpira), 'tokenVerificacionExpira');
    pon('reset_token_hash', usuario.resetTokenHash ?? null, 'resetTokenHash');
    pon('reset_expira', aFecha(usuario.resetExpira), 'resetExpira');
    pon('token_version', Number(usuario.tokenVersion) || 1, 'tokenVersion');
    pon('intentos_fallidos', aNumero(usuario.intentosFallidos) || 0, 'intentosFallidos');
    pon('bloqueado_hasta', aFecha(usuario.bloqueadoHasta), 'bloqueadoHasta');
    pon('advertencias', aNumero(usuario.advertencias) || 0);
    pon('suspendido', usuario.suspendido === true);
    pon('suspendido_hasta', aFecha(usuario.suspendidoHasta), 'suspendidoHasta');
    pon('suspendido_motivo', usuario.suspendidoMotivo ?? null, 'suspendidoMotivo');
    pon('suspendido_por', usuario.suspendidoPor ?? null, 'suspendidoPor');
    return fila;
  }

  /* ------------------------------ incidencias ----------------------------- */

  #aFilaIncidencia(inc) {
    return {
      id: inc.id,
      tipo_id: inc.tipoId,
      icono_custom: inc.iconoCustom || '',
      titulo: inc.titulo,
      descripcion: inc.descripcion,
      indicaciones: inc.indicaciones || '',
      lat: inc.lat,
      lng: inc.lng,
      fecha: aFecha(inc.fecha),
      actualizado: aFecha(inc.actualizado || inc.fecha),
      estado: inc.estado,
      es_anonimo: inc.esAnonimo === true,
      autor: inc.autor,
      autor_nombre: inc.autorNombre,
      user_key: inc.userKey,
      municipio_id: inc.municipioId,
      zona_id: inc.zonaId ?? null,
      zona_nombre: inc.zonaNombre ?? null,
      peligrosa: inc.peligrosa === true,
      peligrosa_por: inc.peligrosaPor ?? null,
      peligrosa_fecha: aFecha(inc.peligrosaFecha),
      peligrosa_motivo: inc.peligrosaMotivo ?? null,
      oculta: inc.oculta === true,
      oculta_por: inc.ocultaPor ?? null,
      oculta_fecha: aFecha(inc.ocultaFecha),
      oculta_motivo: inc.ocultaMotivo ?? null,
      fecha_resolucion: aFecha(inc.fechaResolucion),
      solucion: inc.solucion ?? null
    };
  }

  #aEvidencia(fila) {
    return {
      id: fila.id,
      nombre: fila.nombre,
      tipo: fila.tipo,
      tamano: aNumero(fila.tamano) || 0,
      url: fila.url,
      duracion: aNumero(fila.duracion)
    };
  }

  /** Carga las tablas hijas de un conjunto de incidencias y las agrupa. */
  async #hijosDe(ids) {
    const mapa = {
      evidencias: new Map(),
      evidenciasSolucion: new Map(),
      historial: new Map(),
      comentarios: new Map()
    };
    if (!ids.length) return mapa;

    const [evidencias, historial, comentarios] = await Promise.all([
      this.knex('incidencia_evidencias').whereIn('incidencia_id', ids),
      this.knex('incidencia_historial').whereIn('incidencia_id', ids).orderBy('fecha', 'asc'),
      this.knex('incidencia_comentarios').whereIn('incidencia_id', ids).orderBy('fecha', 'asc')
    ]);

    evidencias.forEach((fila) => {
      const destino = fila.clase === 'solucion' ? mapa.evidenciasSolucion : mapa.evidencias;
      if (!destino.has(fila.incidencia_id)) destino.set(fila.incidencia_id, []);
      destino.get(fila.incidencia_id).push(this.#aEvidencia(fila));
    });

    historial.forEach((fila) => {
      if (!mapa.historial.has(fila.incidencia_id)) mapa.historial.set(fila.incidencia_id, []);
      mapa.historial.get(fila.incidencia_id).push({
        fecha: desdeFecha(fila.fecha),
        estado: fila.estado,
        accion: fila.accion,
        por: fila.por
      });
    });

    comentarios.forEach((fila) => {
      if (!mapa.comentarios.has(fila.incidencia_id)) mapa.comentarios.set(fila.incidencia_id, []);
      mapa.comentarios.get(fila.incidencia_id).push({
        id: fila.id,
        fecha: desdeFecha(fila.fecha),
        autor: fila.autor,
        texto: fila.texto,
        userKey: fila.user_key || null,
        oculto: Boolean(fila.oculto),
        ocultoPor: fila.oculto_por || null,
        ocultoFecha: desdeFecha(fila.oculto_fecha),
        ocultoMotivo: fila.oculto_motivo || ''
      });
    });

    return mapa;
  }

  #desdeFila(fila, hijos) {
    return {
      id: fila.id,
      tipoId: fila.tipo_id,
      iconoCustom: fila.icono_custom || '',
      titulo: fila.titulo,
      descripcion: fila.descripcion,
      indicaciones: fila.indicaciones || '',
      lat: Number(fila.lat),
      lng: Number(fila.lng),
      fecha: desdeFecha(fila.fecha),
      actualizado: desdeFecha(fila.actualizado),
      estado: fila.estado,
      esAnonimo: Boolean(fila.es_anonimo),
      autor: fila.autor,
      autorNombre: fila.autor_nombre,
      userKey: fila.user_key,
      municipioId: fila.municipio_id,
      zonaId: fila.zona_id,
      zonaNombre: fila.zona_nombre,
      peligrosa: Boolean(fila.peligrosa),
      peligrosaPor: fila.peligrosa_por || null,
      peligrosaFecha: desdeFecha(fila.peligrosa_fecha),
      peligrosaMotivo: fila.peligrosa_motivo || '',
      oculta: Boolean(fila.oculta),
      ocultaPor: fila.oculta_por || null,
      ocultaFecha: desdeFecha(fila.oculta_fecha),
      ocultaMotivo: fila.oculta_motivo || '',
      evidencia: hijos.evidencias.get(fila.id) || [],
      historial: hijos.historial.get(fila.id) || [],
      comentarios: hijos.comentarios.get(fila.id) || [],
      fechaResolucion: desdeFecha(fila.fecha_resolucion),
      solucion: fila.solucion,
      evidenciaSolucion: hijos.evidenciasSolucion.get(fila.id) || []
    };
  }

  async #hidratar(filas) {
    const hijos = await this.#hijosDe(filas.map((f) => f.id));
    return filas.map((fila) => this.#desdeFila(fila, hijos));
  }

  async buscarIncidencias(filtros = {}) {
    const {
      municipioId,
      userKey,
      texto,
      estado,
      tipoId,
      zonaId,
      orden = 'reciente',
      ocultas = 'excluir',
      ocultasDe = null
    } = filtros;
    const consulta = this.knex('incidencias').select('*');

    if (municipioId) consulta.where('municipio_id', municipioId);
    if (userKey) consulta.where('user_key', userKey);
    if (estado && estado !== 'todos') consulta.where('estado', estado);
    if (tipoId && tipoId !== 'todos') consulta.where('tipo_id', tipoId);
    if (zonaId && zonaId !== 'todos') consulta.where('zona_id', zonaId);
    if (texto) {
      consulta.where((b) => b.where('titulo', 'like', `%${texto}%`).orWhere('descripcion', 'like', `%${texto}%`));
    }

    // El público no ve lo retirado por moderación; el personal sí, y el autor
    // sigue viendo lo suyo con la marca de oculta.
    if (ocultas === 'excluir') consulta.where('oculta', false);
    else if (ocultas === 'propias' && ocultasDe) {
      consulta.where((b) => b.where('oculta', false).orWhere('user_key', ocultasDe));
    }

    // `prioridad` se resuelve en el servicio (depende del color derivado).
    consulta.orderBy('fecha', orden === 'antigua' ? 'asc' : 'desc');

    return this.#hidratar(await consulta);
  }

  async todasLasIncidencias() {
    const filas = await this.knex('incidencias').select('*').orderBy('fecha', 'desc');
    return this.#hidratar(filas);
  }

  async incidenciaPorId(id) {
    const fila = await this.knex('incidencias').where({ id }).first();
    if (!fila) return null;
    const [incidencia] = await this.#hidratar([fila]);
    return incidencia;
  }

  /** Inserta la incidencia y sus hijos dentro de una transacción. */
  async #insertarEnTransaccion(trx, incidencia) {
    await trx('incidencias').insert(this.#aFilaIncidencia(incidencia));
    await this.#insertarHijos(trx, incidencia.id, incidencia);
  }

  async crearIncidencia(incidencia) {
    await this.knex.transaction((trx) => this.#insertarEnTransaccion(trx, incidencia));
    return incidencia;
  }

  /**
   * Actualiza la incidencia y reemplaza sus hijos.
   * El objeto que llega ya contiene el historial y los comentarios completos
   * (igual que en el driver JSON), así que se reescriben tal cual.
   */
  async actualizarIncidencia(id, incidencia) {
    const existente = await this.knex('incidencias').where({ id }).first();
    if (!existente) return null;

    await this.knex.transaction(async (trx) => {
      await trx('incidencias').where({ id }).update(this.#aFilaIncidencia({ ...incidencia, id }));
      await trx('incidencia_evidencias').where({ incidencia_id: id }).del();
      await trx('incidencia_historial').where({ incidencia_id: id }).del();
      await trx('incidencia_comentarios').where({ incidencia_id: id }).del();
      await this.#insertarHijos(trx, id, incidencia);
    });

    return incidencia;
  }

  async #insertarHijos(trx, id, incidencia) {
    const base = { ...incidencia, id };
    const evidencias = [
      ...(base.evidencia || []).map((e) => ({ ...e, clase: 'reporte' })),
      ...(base.evidenciaSolucion || []).map((e) => ({ ...e, clase: 'solucion' }))
    ];
    if (evidencias.length) {
      await trx('incidencia_evidencias').insert(
        evidencias.map((e) => ({
          id: e.id || nuevoId(),
          incidencia_id: id,
          clase: e.clase,
          nombre: e.nombre || 'archivo',
          tipo: e.tipo || 'application/octet-stream',
          tamano: Number(e.tamano) || 0,
          url: e.url,
          duracion: e.duracion === null || e.duracion === undefined ? null : Number(e.duracion)
        }))
      );
    }
    if (base.historial?.length) {
      await trx('incidencia_historial').insert(
        base.historial.map((h) => ({
          incidencia_id: id,
          fecha: aFecha(h.fecha),
          estado: h.estado,
          accion: h.accion,
          por: h.por || '—'
        }))
      );
    }
    if (base.comentarios?.length) {
      await trx('incidencia_comentarios').insert(
        base.comentarios.map((c) => ({
          id: c.id || nuevoId(),
          incidencia_id: id,
          fecha: aFecha(c.fecha),
          autor: c.autor,
          texto: c.texto,
          user_key: c.userKey ?? null,
          oculto: c.oculto === true,
          oculto_por: c.ocultoPor ?? null,
          oculto_fecha: aFecha(c.ocultoFecha),
          oculto_motivo: c.ocultoMotivo ?? null
        }))
      );
    }
  }

  async eliminarIncidencia(id) {
    // Las tablas hijas tienen ON DELETE CASCADE.
    const borrados = await this.knex('incidencias').where({ id }).del();
    return borrados > 0;
  }

  async insertarIncidencias(incidencias) {
    let insertadas = 0;
    for (const incidencia of incidencias) {
      const existente = await this.knex('incidencias').where({ id: incidencia.id }).first();
      if (existente) continue;
      await this.crearIncidencia(incidencia);
      insertadas++;
    }
    return insertadas;
  }

  async borrarIncidencias() {
    const total = Number((await this.knex('incidencias').count({ n: '*' }).first())?.n || 0);
    await this.knex('incidencias').del();
    return total;
  }

  /* ----------------------------- notificaciones --------------------------- */

  #aNotificacion(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      fecha: desdeFecha(fila.fecha),
      leida: Boolean(fila.leida),
      tipo: fila.tipo,
      titulo: fila.titulo,
      mensaje: fila.mensaje,
      incidenciaId: fila.incidencia_id,
      paraUsuario: fila.para_usuario
    };
  }

  async notificacionesDe(userKey) {
    const filas = await this.knex('notificaciones')
      .where((b) => b.whereNull('para_usuario').orWhere('para_usuario', userKey))
      .orderBy('fecha', 'desc');
    return filas.map((f) => this.#aNotificacion(f));
  }

  async todasLasNotificaciones() {
    const filas = await this.knex('notificaciones').select('*').orderBy('fecha', 'desc');
    return filas.map((f) => this.#aNotificacion(f));
  }

  async crearNotificacion(notificacion) {
    await this.knex('notificaciones').insert({
      id: notificacion.id,
      fecha: aFecha(notificacion.fecha),
      leida: notificacion.leida === true,
      tipo: notificacion.tipo,
      titulo: notificacion.titulo,
      mensaje: notificacion.mensaje,
      incidencia_id: notificacion.incidenciaId ?? null,
      para_usuario: notificacion.paraUsuario ?? null
    });
    return notificacion;
  }

  async marcarNotificacionLeida(id) {
    const actualizados = await this.knex('notificaciones').where({ id }).update({ leida: true });
    return actualizados > 0;
  }

  async marcarNotificacionesLeidas(userKey) {
    const actualizados = await this.knex('notificaciones')
      .where({ leida: false })
      .where((b) => b.whereNull('para_usuario').orWhere('para_usuario', userKey))
      .update({ leida: true });
    return actualizados;
  }

  async eliminarNotificacion(id) {
    const borrados = await this.knex('notificaciones').where({ id }).del();
    return borrados > 0;
  }

  async borrarNotificaciones() {
    const total = Number((await this.knex('notificaciones').count({ n: '*' }).first())?.n || 0);
    await this.knex('notificaciones').del();
    return total;
  }

  /* -------------------------------- denuncias ------------------------------ */

  #aDenuncia(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      fecha: desdeFecha(fila.fecha),
      objetivo: fila.objetivo,
      incidenciaId: fila.incidencia_id,
      comentarioId: fila.comentario_id || null,
      municipioId: fila.municipio_id || null,
      objetivoTitulo: fila.objetivo_titulo || '',
      objetivoResumen: fila.objetivo_resumen || '',
      objetivoAutor: fila.objetivo_autor || null,
      objetivoUserKey: fila.objetivo_user_key || null,
      autorUserKey: fila.autor_user_key || null,
      autorNombre: fila.autor_nombre,
      motivo: fila.motivo,
      detalle: fila.detalle || '',
      estado: fila.estado,
      accion: fila.accion || null,
      resolucion: fila.resolucion || '',
      moderadoPor: fila.moderado_por || null,
      moderadoFecha: desdeFecha(fila.moderado_fecha)
    };
  }

  #aFilaDenuncia(d) {
    return {
      id: d.id,
      fecha: aFecha(d.fecha),
      objetivo: d.objetivo,
      incidencia_id: d.incidenciaId,
      comentario_id: d.comentarioId ?? null,
      municipio_id: d.municipioId ?? null,
      objetivo_titulo: d.objetivoTitulo || '',
      objetivo_resumen: d.objetivoResumen || '',
      objetivo_autor: d.objetivoAutor ?? null,
      objetivo_user_key: d.objetivoUserKey ?? null,
      autor_user_key: d.autorUserKey ?? null,
      autor_nombre: d.autorNombre,
      motivo: d.motivo,
      detalle: d.detalle || '',
      estado: d.estado,
      accion: d.accion ?? null,
      resolucion: d.resolucion || null,
      moderado_por: d.moderadoPor ?? null,
      moderado_fecha: aFecha(d.moderadoFecha)
    };
  }

  async denunciasDe(filtros = {}) {
    const {
      incidenciaId,
      comentarioId,
      municipioId,
      autorUserKey,
      objetivoUserKey,
      estado,
      orden = 'reciente'
    } = filtros;
    const consulta = this.knex('denuncias').select('*');

    if (incidenciaId) consulta.where('incidencia_id', incidenciaId);
    if (comentarioId) consulta.where('comentario_id', comentarioId);
    if (municipioId) consulta.where('municipio_id', municipioId);
    if (autorUserKey) consulta.where('autor_user_key', autorUserKey);
    if (objetivoUserKey) consulta.where('objetivo_user_key', objetivoUserKey);
    if (estado) consulta.where('estado', estado);

    consulta.orderBy('fecha', orden === 'antigua' ? 'asc' : 'desc');
    const filas = await consulta;
    return filas.map((f) => this.#aDenuncia(f));
  }

  async denunciaPorId(id) {
    return this.#aDenuncia(await this.knex('denuncias').where({ id }).first());
  }

  async crearDenuncia(denuncia) {
    await this.knex('denuncias').insert(this.#aFilaDenuncia(denuncia));
    return denuncia;
  }

  async actualizarDenuncia(id, denuncia) {
    const actualizados = await this.knex('denuncias')
      .where({ id })
      .update(this.#aFilaDenuncia({ ...denuncia, id }));
    if (!actualizados) return null;
    return denuncia;
  }

  /** Se usa al dar de baja una cuenta: sus denuncias se van con ella. */
  async eliminarDenuncia(id) {
    const borrados = await this.knex('denuncias').where({ id }).del();
    return borrados > 0;
  }

  async borrarDenuncias() {
    const total = Number((await this.knex('denuncias').count({ n: '*' }).first())?.n || 0);
    await this.knex('denuncias').del();
    return total;
  }
}
