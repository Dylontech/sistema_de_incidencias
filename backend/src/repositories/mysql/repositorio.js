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
import { ROLES_PERSONAL } from '../../config/constantes.js';
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
  'denuncias',
  // Añadidas en las migraciones 016-022: si faltan, el arranque lo dice en
  // lugar de fallar más tarde con "Table ... doesn't exist".
  'preferencias_notificacion',
  'preferencia_municipios',
  'claves_acceso',
  'clave_acceso_municipios',
  'clave_acceso_estados',
  'clave_notificacion_municipios',
  'clave_acceso_usos',
  'sesiones_usuario',
  'auditoria',
  'solicitudes_acceso',
  'tickets',
  'ticket_mensajes',
  'recolecciones_firmas',
  'recoleccion_firmas',
  'recoleccion_firmas_envios',
  'restricciones_comentarios',
  'documentos_legales',
  'documentos_legales_historial',
  'aceptaciones_legales',
  'contactos_funcionarios',
  'contacto_funcionario_destinatarios',
  'contacto_funcionario_mensajes',
  'solicitudes_funcionario',
  'respaldos',
  'respaldos_eventos',
  'correos_institucionales',
  'publicaciones_redes',
  'codigos_qr',
  'qr_escaneos',
  'adjuntos',
  'simulacion_sesiones',
  'simulacion_operaciones',
  'municipios_informacion',
  'roles_personalizados',
  'solicitudes_permisos',
  'roles',
  'solicitudes_password',
  'solicitudes_baja',
  'solicitudes_usuario'
];

/**
 * Columnas que las migraciones añaden a tablas ya existentes. Sin ellas el
 * proceso arranca y falla después con "Unknown column ... in 'field list'"
 * (por ejemplo al guardar usuarios.permisos).
 */
const COLUMNAS = {
  usuarios: [
    'permisos',
    'comentarios_restringidos',
    'rol_personalizado_id',
    'rol_propio_id',
    'password_cifrada',
    'telefono'
  ],
  incidencias: ['clave_idempotencia', 'folio', 'meta_firmas'],
  solicitudes_informe: ['municipios', 'estados', 'tipos_todos'],
  notificaciones: ['archivada_en', 'simulado'],
  claves_acceso: [
    'correo_contacto',
    'correo_institucional_id',
    'notificaciones_activas',
    'permisos'
  ],
  sesiones_usuario: ['clave_id'],
  solicitudes_permisos: ['estados'],
  solicitudes_password: ['solicitado_por_id', 'solicitado_por'],
  publicaciones_redes: [
    'color_primario',
    'color_secundario',
    'estructura',
    'cta',
    'cuerpo',
    'actualizado_en',
    'formato',
    'ancho',
    'alto',
    'diseno',
    'fuente',
    'kicker',
    'pie',
    'mostrar_qr',
    'qr_config',
    'qr_codigo',
    'layout',
    'miniatura_url',
    'publicado_en'
  ]
};

const aFecha = (iso) => (iso ? new Date(iso) : null);
const desdeFecha = (valor) => (valor ? new Date(valor).toISOString() : null);
const aNumero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/** Lista de permisos de una clave; `null` significa «sin recorte». */
const aListaPermisos = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;
  try {
    const datos = typeof valor === 'string' ? JSON.parse(valor) : valor;
    if (!Array.isArray(datos)) return null;
    return [...new Set(datos.filter(Boolean).map(String))];
  } catch {
    return null;
  }
};

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

    const columnasFaltantes = [];
    for (const [tabla, columnas] of Object.entries(COLUMNAS)) {
      if (faltantes.includes(tabla)) continue; // sin tabla, el aviso ya es suficiente
      for (const columna of columnas) {
        if (!(await this.knex.schema.hasColumn(tabla, columna))) {
          columnasFaltantes.push(`${tabla}.${columna}`);
        }
      }
    }

    if (faltantes.length || columnasFaltantes.length) {
      const partes = [];
      if (faltantes.length) partes.push(`Faltan tablas en la base de datos: ${faltantes.join(', ')}.`);
      if (columnasFaltantes.length) {
        partes.push(`Faltan columnas en la base de datos: ${columnasFaltantes.join(', ')}.`);
      }
      throw new Error(
        `${partes.join(' ')} ` +
          'Ejecuta "npm --prefix backend run migrate" (no hace falta volver a sembrar: ' +
          '"npm run seed" borra incidencias y usuarios).'
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

  async municipiosLigeros() {
    return this.knex('municipios')
      .select('id', 'nombre', 'estado')
      .orderBy('nombre', 'asc');
  }

  async municipioPorId(id) {
    const fila = await this.knex('municipios').where({ id }).first();
    return this.#aMunicipio(fila);
  }

  /** Conteos por municipio para la pestaña Municipios del panel. */
  async resumenPorMunicipio() {
    const [incidencias, tickets, sugerencias, personal] = await Promise.all([
      this.knex('incidencias')
        .whereNot('estado', 'resuelta')
        .whereNotNull('municipio_id')
        .select('municipio_id')
        .count({ n: '*' })
        .groupBy('municipio_id'),
      this.knex('tickets')
        .whereNot('estado', 'cerrado')
        .whereNotNull('municipio_id')
        .select('municipio_id')
        .count({ n: '*' })
        .groupBy('municipio_id'),
      this.knex('sugerencias')
        .whereIn('estado', ['nueva', 'en_revision'])
        .whereNotNull('municipio_id')
        .select('municipio_id')
        .count({ n: '*' })
        .groupBy('municipio_id'),
      this.knex('usuario_municipios as um')
        .join('usuarios as u', 'u.id', 'um.usuario_id')
        .whereIn('u.rol', ROLES_PERSONAL)
        .where('u.activo', true)
        .select('um.municipio_id')
        .count({ n: '*' })
        .groupBy('um.municipio_id')
    ]);

    const mapa = new Map();
    const sumar = (filas, campo) => {
      for (const fila of filas) {
        const id = fila.municipio_id;
        if (!mapa.has(id)) {
          mapa.set(id, {
            municipioId: id,
            incidenciasAbiertas: 0,
            ticketsAbiertos: 0,
            sugerenciasPendientes: 0,
            personal: 0
          });
        }
        mapa.get(id)[campo] = Number(fila.n) || 0;
      }
    };
    sumar(incidencias, 'incidenciasAbiertas');
    sumar(tickets, 'ticketsAbiertos');
    sumar(sugerencias, 'sugerenciasPendientes');
    sumar(personal, 'personal');
    return [...mapa.values()];
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
      telefono: fila.telefono || null,
      rol: fila.rol,
      municipioId: fila.municipio_id,
      activo: Boolean(fila.activo),
      pseudonimo: Boolean(fila.pseudonimo),
      puedeEscribir: Boolean(fila.puede_escribir),
      permisos: (() => {
        try {
          return fila.permisos ? JSON.parse(fila.permisos) : {};
        } catch {
          return {};
        }
      })(),
      rolPersonalizadoId: fila.rol_personalizado_id || null,
      rolPersonalizado: null,
      rolPropioId: fila.rol_propio_id || null,
      rolPropio: null,
      rolConfig: null,
      passwordHash: fila.password_hash,
      advertencias: aNumero(fila.advertencias) || 0,
      suspendido: Boolean(fila.suspendido),
      suspendidoHasta: desdeFecha(fila.suspendido_hasta),
      suspendidoMotivo: fila.suspendido_motivo || '',
      suspendidoPor: fila.suspendido_por || null,
      comentariosRestringidos: Boolean(fila.comentarios_restringidos),
      comentariosRestringidosHasta: desdeFecha(fila.comentarios_restringidos_hasta),
      comentariosRestringidosMotivo: fila.comentarios_restringidos_motivo || '',
      comentariosRestringidosPor: fila.comentarios_restringidos_por || null,
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  async todosLosUsuarios() {
    const filas = await this.knex('usuarios').select('*');
    return this.#hidratarRoles(filas.map((f) => this.#aUsuario(f)));
  }

  /**
   * Añade a las cuentas su rol especial, su rol propio y la matriz del rol
   * integrado (`rolConfig`), que es la que manda sobre `PERMISOS_POR_ROL`.
   */
  async #hidratarRoles(usuarios) {
    if (!usuarios.length) return usuarios;
    const idsEspeciales = [...new Set(usuarios.map((u) => u.rolPersonalizadoId).filter(Boolean))];
    const idsPropios = [...new Set(usuarios.map((u) => u.rolPropioId).filter(Boolean))];
    const claves = [...new Set(usuarios.map((u) => u.rol).filter(Boolean))];
    const [filasEspeciales, filasRoles] = await Promise.all([
      idsEspeciales.length
        ? this.knex('roles_personalizados').whereIn('id', idsEspeciales)
        : [],
      claves.length || idsPropios.length
        ? this.knex('roles')
            .whereIn('clave', claves)
            .orWhereIn('id', idsPropios.length ? idsPropios : [''])
        : []
    ]);
    const porIdEspecial = new Map(
      filasEspeciales.map((f) => [f.id, this.#aRolPersonalizado(f)])
    );
    const roles = filasRoles.map((f) => this.#aRol(f));
    const rolPorId = new Map(roles.map((r) => [r.id, r]));
    const rolPorClave = new Map(
      roles.filter((r) => r.tipo === 'integrado').map((r) => [r.clave, r])
    );
    return usuarios.map((u) => ({
      ...u,
      rolPersonalizado: u.rolPersonalizadoId
        ? porIdEspecial.get(u.rolPersonalizadoId) || null
        : null,
      rolPropio: u.rolPropioId ? rolPorId.get(u.rolPropioId) || null : null,
      rolConfig: rolPorClave.get(u.rol) || null
    }));
  }

  /** Personal activo por rol (evita cargar ciudadanos en el aviso de incidencias). */
  async usuariosPorRoles(roles = []) {
    if (!roles.length) return [];
    const filas = await this.knex('usuarios')
      .whereIn('rol', roles)
      .where('activo', true)
      .select('*');
    return this.#hidratarRoles(filas.map((f) => this.#aUsuario(f)));
  }

  /** Cuentas concretas por `username`/`userKey` (autores y responsables). */
  async usuariosPorKeys(keys = []) {
    const limpios = [...new Set((keys || []).filter(Boolean).map(String))];
    if (!limpios.length) return [];
    const filas = await this.knex('usuarios').whereIn('username', limpios).select('*');
    return this.#hidratarRoles(filas.map((f) => this.#aUsuario(f)));
  }

  async usuarioPorUsername(username) {
    const fila = await this.knex('usuarios')
      .whereRaw('LOWER(username) = ?', [String(username || '').trim().toLowerCase()])
      .first();
    if (!fila) return null;
    return (await this.#hidratarRoles([this.#aUsuario(fila)]))[0];
  }

  /** Las cuentas ciudadanas entran con su correo (siempre en minúsculas). */
  async usuarioPorCorreo(correo) {
    const objetivo = String(correo || '').trim().toLowerCase();
    if (!objetivo) return null;
    const fila = await this.knex('usuarios').whereRaw('LOWER(correo) = ?', [objetivo]).first();
    if (!fila) return null;
    return (await this.#hidratarRoles([this.#aUsuario(fila)]))[0];
  }

  /**
   * Ciudadanos cuyo nombre coincide. La columna usa `utf8mb4_unicode_ci`, así
   * que la comparación no distingue mayúsculas ni acentos. Devuelve todos los
   * candidatos porque las bases antiguas pueden tener nombres repetidos.
   */
  async usuariosPorNombre(nombre) {
    const objetivo = String(nombre || '').trim();
    if (!objetivo) return [];
    const filas = await this.knex('usuarios')
      .where({ rol: 'ciudadano' })
      .whereRaw('LOWER(nombre) = ?', [objetivo.toLowerCase()])
      .select('*');
    return this.#hidratarRoles(filas.map((f) => this.#aUsuario(f)));
  }

  async usuarioPorId(id) {
    const fila = await this.knex('usuarios').where({ id }).first();
    if (!fila) return null;
    return (await this.#hidratarRoles([this.#aUsuario(fila)]))[0];
  }

  /** Contraseña cifrada (AES-256-GCM) para el revelado auditado. */
  async passwordCifradaDeUsuario(id) {
    const fila = await this.knex('usuarios').where({ id }).select('password_cifrada').first();
    return fila?.password_cifrada || null;
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

  /* --------------------------- alcance territorial ------------------------- */

  async alcanceDeUsuario(id) {
    const [municipios, estados] = await Promise.all([
      this.knex('usuario_municipios').where({ usuario_id: id }).pluck('municipio_id'),
      this.knex('usuario_estados').where({ usuario_id: id }).pluck('estado')
    ]);
    return { municipios, estados };
  }

  /** Versión por lote para el listado del panel. */
  async alcancesDeUsuarios(ids = []) {
    const mapa = {};
    for (const id of ids) mapa[id] = { municipios: [], estados: [] };
    if (!ids.length) return mapa;

    const [municipios, estados] = await Promise.all([
      this.knex('usuario_municipios').whereIn('usuario_id', ids),
      this.knex('usuario_estados').whereIn('usuario_id', ids)
    ]);
    for (const fila of municipios) {
      mapa[fila.usuario_id]?.municipios.push(fila.municipio_id);
    }
    for (const fila of estados) {
      mapa[fila.usuario_id]?.estados.push(fila.estado);
    }
    return mapa;
  }

  async guardarAlcanceUsuario(id, { municipios = [], estados = [] } = {}) {
    const limpiosMunicipios = [...new Set(municipios.filter(Boolean).map(String))];
    const limpiosEstados = [...new Set(estados.filter(Boolean).map(String))];

    await this.knex.transaction(async (trx) => {
      await trx('usuario_municipios').where({ usuario_id: id }).del();
      await trx('usuario_estados').where({ usuario_id: id }).del();

      if (limpiosMunicipios.length) {
        await trx('usuario_municipios').insert(
          limpiosMunicipios.map((municipioId) => ({ usuario_id: id, municipio_id: municipioId }))
        );
      }
      if (limpiosEstados.length) {
        await trx('usuario_estados').insert(
          limpiosEstados.map((estado) => ({ usuario_id: id, estado }))
        );
      }
    });

    return { municipios: limpiosMunicipios, estados: limpiosEstados };
  }

  /* ---------------------- preferencias de notificación --------------------- */

  async preferenciasDe(usuarioId) {
    const fila = await this.knex('preferencias_notificacion')
      .where({ usuario_id: usuarioId })
      .first();
    const municipios = await this.knex('preferencia_municipios')
      .where({ usuario_id: usuarioId })
      .pluck('municipio_id');

    return {
      modo: fila?.modo || 'asignados',
      porCorreo: Boolean(fila?.por_correo),
      municipios,
      existe: Boolean(fila)
    };
  }

  async preferenciasDeVarios(ids = []) {
    const mapa = {};
    for (const id of ids) {
      mapa[id] = { modo: 'asignados', porCorreo: false, municipios: [], existe: false };
    }
    if (!ids.length) return mapa;

    const [preferencias, municipios] = await Promise.all([
      this.knex('preferencias_notificacion').whereIn('usuario_id', ids),
      this.knex('preferencia_municipios').whereIn('usuario_id', ids)
    ]);

    for (const fila of preferencias) {
      mapa[fila.usuario_id] = {
        modo: fila.modo || 'asignados',
        porCorreo: Boolean(fila.por_correo),
        municipios: [],
        existe: true
      };
    }
    for (const fila of municipios) {
      mapa[fila.usuario_id]?.municipios.push(fila.municipio_id);
    }
    return mapa;
  }

  async guardarPreferencias(
    usuarioId,
    { modo = 'asignados', porCorreo = false, municipios = [] } = {}
  ) {
    const limpios = [...new Set(municipios.filter(Boolean).map(String))];

    await this.knex.transaction(async (trx) => {
      const existe = await trx('preferencias_notificacion')
        .where({ usuario_id: usuarioId })
        .first();

      const fila = { modo, por_correo: porCorreo === true };
      if (existe) {
        await trx('preferencias_notificacion').where({ usuario_id: usuarioId }).update(fila);
      } else {
        await trx('preferencias_notificacion').insert({ usuario_id: usuarioId, ...fila });
      }

      await trx('preferencia_municipios').where({ usuario_id: usuarioId }).del();
      if (limpios.length) {
        await trx('preferencia_municipios').insert(
          limpios.map((municipioId) => ({ usuario_id: usuarioId, municipio_id: municipioId }))
        );
      }
    });

    return { modo, porCorreo: porCorreo === true, municipios: limpios, existe: true };
  }

  /* ----------------------------- claves de acceso -------------------------- */

  #aClave(fila, municipios = [], estados = []) {
    if (!fila) return null;
    return {
      id: fila.id,
      codigo: fila.codigo,
      nombre: fila.nombre || '',
      rolSugerido: fila.rol_sugerido || null,
      activa: Boolean(fila.activa),
      usosMaximos: fila.usos_maximos === null ? null : Number(fila.usos_maximos),
      usos: Number(fila.usos || 0),
      expiraEn: desdeFecha(fila.expira_en),
      creadoPor: fila.creado_por || null,
      creadoEn: desdeFecha(fila.creado_en),
      revocadaEn: desdeFecha(fila.revocada_en),
      correoContacto: fila.correo_contacto || null,
      correoInstitucionalId: fila.correo_institucional_id || null,
      notificacionesActivas:
        fila.notificaciones_activas === undefined || fila.notificaciones_activas === null
          ? true
          : Boolean(Number(fila.notificaciones_activas)),
      permisos: aListaPermisos(fila.permisos),
      municipios,
      estados
    };
  }

  /** Hidrata una clave con sus municipios, estados y permisos. */
  async #claveConTerritorio(fila) {
    if (!fila) return null;
    const [municipios, estados] = await Promise.all([
      this.knex('clave_acceso_municipios').where({ clave_id: fila.id }).pluck('municipio_id'),
      this.knex('clave_acceso_estados').where({ clave_id: fila.id }).pluck('estado')
    ]);
    return this.#aClave(fila, municipios, estados);
  }

  async todasLasClaves() {
    const filas = await this.knex('claves_acceso').orderBy('creado_en', 'desc');
    const ids = filas.map((f) => f.id);
    const [municipios, estados] = await Promise.all([
      ids.length
        ? this.knex('clave_acceso_municipios').whereIn('clave_id', ids)
        : [],
      ids.length
        ? this.knex('clave_acceso_estados').whereIn('clave_id', ids)
        : []
    ]);
    const mapaMunicipios = new Map();
    for (const fila of municipios) {
      if (!mapaMunicipios.has(fila.clave_id)) mapaMunicipios.set(fila.clave_id, []);
      mapaMunicipios.get(fila.clave_id).push(fila.municipio_id);
    }
    const mapaEstados = new Map();
    for (const fila of estados) {
      if (!mapaEstados.has(fila.clave_id)) mapaEstados.set(fila.clave_id, []);
      mapaEstados.get(fila.clave_id).push(fila.estado);
    }
    return filas.map((f) =>
      this.#aClave(f, mapaMunicipios.get(f.id) || [], mapaEstados.get(f.id) || [])
    );
  }

  async claveAccesoPorCodigo(codigo) {
    const fila = await this.knex('claves_acceso')
      .whereRaw('UPPER(codigo) = ?', [String(codigo || '').trim().toUpperCase()])
      .first();
    return this.#claveConTerritorio(fila);
  }

  async claveAccesoPorId(id) {
    const fila = await this.knex('claves_acceso').where({ id: String(id || '') }).first();
    return this.#claveConTerritorio(fila);
  }

  async crearClaveAcceso(clave) {
    await this.knex.transaction(async (trx) => {
      await trx('claves_acceso').insert({
        id: clave.id,
        codigo: clave.codigo,
        nombre: clave.nombre || '',
        rol_sugerido: clave.rolSugerido || null,
        activa: clave.activa !== false,
        usos_maximos: clave.usosMaximos ?? null,
        usos: 0,
        expira_en: aFecha(clave.expiraEn),
        creado_por: clave.creadoPor || null,
        correo_contacto: clave.correoContacto || null,
        correo_institucional_id: clave.correoInstitucionalId || null,
        notificaciones_activas: clave.notificacionesActivas !== false,
        permisos: Array.isArray(clave.permisos) ? JSON.stringify(clave.permisos) : null
      });
      if ((clave.municipios || []).length) {
        await trx('clave_acceso_municipios').insert(
          clave.municipios.map((municipioId) => ({ clave_id: clave.id, municipio_id: municipioId }))
        );
      }
      if ((clave.estados || []).length) {
        await trx('clave_acceso_estados').insert(
          clave.estados.map((estado) => ({ clave_id: clave.id, estado }))
        );
      }
    });
    return {
      ...clave,
      municipios: clave.municipios || [],
      estados: clave.estados || [],
      notificacionesActivas: clave.notificacionesActivas !== false,
      usos: 0
    };
  }

  async revocarClaveAcceso(id) {
    await this.knex('claves_acceso')
      .where({ id })
      .update({ activa: false, revocada_en: this.knex.fn.now() });
    const fila = await this.knex('claves_acceso').where({ id }).first();
    if (!fila) return null;
    const [municipios, estados] = await Promise.all([
      this.knex('clave_acceso_municipios').where({ clave_id: id }).pluck('municipio_id'),
      this.knex('clave_acceso_estados').where({ clave_id: id }).pluck('estado')
    ]);
    return this.#aClave(fila, municipios, estados);
  }

  /** Elimina la clave y sus asignaciones; las sesiones se cierran aparte. */
  async eliminarClaveAcceso(id) {
    const fila = await this.knex('claves_acceso').where({ id }).first();
    if (!fila) return null;
    const [municipios, estados] = await Promise.all([
      this.knex('clave_acceso_municipios').where({ clave_id: id }).pluck('municipio_id'),
      this.knex('clave_acceso_estados').where({ clave_id: id }).pluck('estado')
    ]);
    await this.knex('clave_notificacion_municipios').where({ clave_id: id }).del();
    await this.knex('claves_acceso').where({ id }).del();
    return this.#aClave(fila, municipios, estados);
  }

  async usuariosDeClaves(ids = []) {
    const mapa = {};
    const limpios = [...new Set((ids || []).filter(Boolean).map(String))];
    if (!limpios.length) return mapa;
    const filas = await this.knex('clave_acceso_usos as cu')
      .leftJoin('usuarios as u', 'u.id', 'cu.usuario_id')
      .whereIn('cu.clave_id', limpios)
      .select('cu.clave_id', 'cu.usuario_id', 'u.username', 'u.nombre');
    const vistos = new Set();
    for (const fila of filas) {
      const clave = fila.clave_id;
      const identidad = String(fila.usuario_id || fila.username || '');
      if (!identidad) continue;
      const llave = `${clave}:${identidad}`;
      if (vistos.has(llave)) continue;
      vistos.add(llave);
      if (!mapa[clave]) mapa[clave] = [];
      mapa[clave].push({
        id: fila.usuario_id || null,
        username: fila.username || null,
        nombre: fila.nombre || null
      });
    }
    return mapa;
  }

  /** Configuración de avisos de varias claves: { [claveId]: { activo, municipios } }. */
  async notificacionesDeClaves(ids = []) {
    const limpios = [...new Set((ids || []).filter(Boolean).map(String))];
    const mapa = {};
    if (!limpios.length) return mapa;
    const [claves, filas] = await Promise.all([
      this.knex('claves_acceso')
        .whereIn('id', limpios)
        .select('id', 'notificaciones_activas'),
      this.knex('clave_notificacion_municipios')
        .whereIn('clave_id', limpios)
        .select('clave_id', 'municipio_id')
    ]);
    const municipios = new Map();
    for (const fila of filas) {
      if (!municipios.has(fila.clave_id)) municipios.set(fila.clave_id, []);
      municipios.get(fila.clave_id).push(fila.municipio_id);
    }
    for (const clave of claves) {
      mapa[clave.id] = {
        activo:
          clave.notificaciones_activas === undefined || clave.notificaciones_activas === null
            ? true
            : Boolean(Number(clave.notificaciones_activas)),
        municipios: municipios.get(clave.id) || []
      };
    }
    return mapa;
  }

  /** Guarda el permiso de avisos y, si se indica, reemplaza su alcance. */
  async guardarNotificacionesClave(id, { activo = true, municipios } = {}) {
    await this.knex.transaction(async (trx) => {
      await trx('claves_acceso')
        .where({ id })
        .update({ notificaciones_activas: activo !== false });
      if (Array.isArray(municipios)) {
        await trx('clave_notificacion_municipios').where({ clave_id: id }).del();
        if (municipios.length) {
          await trx('clave_notificacion_municipios').insert(
            [...new Set(municipios.map(String))].map((municipioId) => ({
              clave_id: id,
              municipio_id: municipioId
            }))
          );
        }
      }
    });
    return (await this.notificacionesDeClaves([id]))[id] || { activo: true, municipios: [] };
  }

  /** clave_id de la sesión abierta más reciente de cada usuario. */
  async clavesDeSesionesActivas(usuarioIds = []) {
    const limpios = [...new Set((usuarioIds || []).filter(Boolean).map(String))];
    if (!limpios.length) return {};
    const filas = await this.knex('sesiones_usuario')
      .whereIn('usuario_id', limpios)
      .whereNotNull('clave_id')
      .whereNull('cerrada_en')
      .orderBy('ultima_actividad', 'desc')
      .select('usuario_id', 'clave_id');
    const mapa = {};
    for (const fila of filas) {
      if (!mapa[fila.usuario_id]) mapa[fila.usuario_id] = fila.clave_id;
    }
    return mapa;
  }

  async actualizarClaveAcceso(id, cambios = {}) {
    const fila = {};
    if ('correoContacto' in cambios) fila.correo_contacto = cambios.correoContacto ?? null;
    if ('correoInstitucionalId' in cambios) {
      fila.correo_institucional_id = cambios.correoInstitucionalId ?? null;
    }
    if ('nombre' in cambios) fila.nombre = cambios.nombre;
    if ('permisos' in cambios) {
      fila.permisos = Array.isArray(cambios.permisos) ? JSON.stringify(cambios.permisos) : null;
    }
    if (Object.keys(fila).length) await this.knex('claves_acceso').where({ id }).update(fila);
    const actual = await this.knex('claves_acceso').where({ id }).first();
    return this.#claveConTerritorio(actual);
  }

  async registrarUsoClave(id, { usuarioId = null, ipHash = null } = {}) {
    await this.knex.transaction(async (trx) => {
      await trx('claves_acceso').where({ id }).increment('usos', 1);
      await trx('clave_acceso_usos').insert({
        id: `uso_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        clave_id: id,
        usuario_id: usuarioId,
        ip_hash: ipHash
      });
    });
  }

  /* ------------------------------- sesiones ------------------------------- */

  #aSesion(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      usuarioId: fila.usuario_id || null,
      userKey: fila.user_key || null,
      rol: fila.rol || null,
      municipioId: fila.municipio_id || null,
      claveId: fila.clave_id || null,
      claveCodigo: fila.clave_codigo || null,
      claveNombre: fila.clave_nombre || null,
      ipHash: fila.ip_hash || null,
      userAgent: fila.user_agent || null,
      inicio: desdeFecha(fila.inicio),
      ultimaActividad: desdeFecha(fila.ultima_actividad),
      cerradaEn: desdeFecha(fila.cerrada_en),
      motivoCierre: fila.motivo_cierre || null
    };
  }

  async registrarSesion(sesion) {
    const existe = await this.knex('sesiones_usuario').where({ id: sesion.id }).first();
    if (existe) {
      const cambios = {
        rol: sesion.rol || null,
        municipio_id: sesion.municipioId || null,
        ultima_actividad: this.knex.fn.now()
      };
      if (sesion.claveId) cambios.clave_id = sesion.claveId;
      if (sesion.usuarioId) cambios.usuario_id = sesion.usuarioId;
      await this.knex('sesiones_usuario').where({ id: sesion.id }).update(cambios);
      return;
    }

    await this.knex('sesiones_usuario').insert({
      id: sesion.id,
      usuario_id: sesion.usuarioId || null,
      user_key: sesion.userKey || null,
      rol: sesion.rol || null,
      municipio_id: sesion.municipioId || null,
      clave_id: sesion.claveId || null,
      ip_hash: sesion.ipHash || null,
      user_agent: sesion.userAgent || null
    });
  }

  async sesionPorId(id) {
    const fila = await this.knex('sesiones_usuario').where({ id }).first();
    return this.#aSesion(fila);
  }

  async cerrarSesion(id, motivo = 'cierre') {
    await this.knex('sesiones_usuario')
      .where({ id })
      .update({ cerrada_en: this.knex.fn.now(), motivo_cierre: motivo });
  }

  /** Cierra todas las sesiones abiertas con una clave y devuelve las afectadas. */
  async cerrarSesionesPorClave(claveId, motivo = 'clave eliminada') {
    const filas = await this.knex('sesiones_usuario')
      .where({ clave_id: claveId })
      .whereNull('cerrada_en')
      .select('id', 'usuario_id', 'user_key', 'clave_id');
    if (filas.length) {
      await this.knex('sesiones_usuario')
        .whereIn('id', filas.map((f) => f.id))
        .update({ cerrada_en: this.knex.fn.now(), motivo_cierre: motivo });
    }
    return filas.map((f) => ({
      id: f.id,
      usuarioId: f.usuario_id || null,
      userKey: f.user_key || null,
      claveId: f.clave_id || null
    }));
  }

  async listarSesiones({ limite = 200, claveId = null } = {}) {
    const consulta = this.knex('sesiones_usuario as s')
      .leftJoin('claves_acceso as c', 'c.id', 's.clave_id')
      .whereNull('s.cerrada_en')
      .select('s.*', 'c.codigo as clave_codigo', 'c.nombre as clave_nombre')
      .orderBy('s.ultima_actividad', 'desc')
      .limit(Math.min(Number(limite) || 200, 500));
    if (claveId) consulta.where('s.clave_id', claveId);
    const filas = await consulta;
    return filas.map((f) => this.#aSesion(f));
  }

  /* ------------------------------- auditoría ------------------------------- */

  async registrarAuditoria(registro) {
    await this.knex('auditoria').insert({
      id: registro.id,
      usuario_id: registro.usuarioId || null,
      username: registro.username || null,
      user_key: registro.userKey || null,
      rol: registro.rol || null,
      clave_id: registro.claveId || null,
      metodo: registro.metodo,
      ruta: registro.ruta,
      estado_http: registro.estadoHttp ?? null,
      accion: registro.accion || null,
      entidad: registro.entidad || null,
      entidad_id: registro.entidadId || null,
      detalle: registro.detalle || null,
      ip_hash: registro.ipHash || null,
      user_agent: registro.userAgent || null
    });
    return registro;
  }

  async listarAuditoria({
    limite = 200,
    username = null,
    accion = null,
    desde = null,
    hasta = null
  } = {}) {
    const consulta = this.knex('auditoria as a')
      .leftJoin('claves_acceso as c', 'a.clave_id', 'c.id')
      .select('a.*', 'c.codigo as clave_codigo', 'c.nombre as clave_nombre')
      .orderBy('a.creado_en', 'desc')
      .limit(Math.min(Number(limite) || 200, 500));
    if (username) {
      consulta.whereRaw('LOWER(a.username) LIKE ?', [`%${String(username).toLowerCase()}%`]);
    }
    if (accion) {
      consulta.whereRaw('LOWER(a.accion) LIKE ?', [`%${String(accion).toLowerCase()}%`]);
    }
    if (desde) {
      const valor = /^\d{4}-\d{2}-\d{2}$/.test(String(desde))
        ? `${desde} 00:00:00`
        : desde;
      consulta.where('a.creado_en', '>=', valor);
    }
    if (hasta) {
      const valor = /^\d{4}-\d{2}-\d{2}$/.test(String(hasta))
        ? `${hasta} 23:59:59`
        : hasta;
      consulta.where('a.creado_en', '<=', valor);
    }
    const filas = await consulta;
    return filas.map((f) => ({
      id: f.id,
      usuarioId: f.usuario_id || null,
      username: f.username || null,
      userKey: f.user_key || null,
      rol: f.rol || null,
      claveId: f.clave_id || null,
      claveCodigo: f.clave_codigo || null,
      claveNombre: f.clave_nombre || null,
      metodo: f.metodo,
      ruta: f.ruta,
      estadoHttp: f.estado_http === null ? null : Number(f.estado_http),
      accion: f.accion || null,
      entidad: f.entidad || null,
      entidadId: f.entidad_id || null,
      detalle: f.detalle || null,
      ipHash: f.ip_hash || null,
      userAgent: f.user_agent || null,
      creadoEn: desdeFecha(f.creado_en)
    }));
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
    pon('telefono', usuario.telefono ?? null);
    pon('rol', usuario.rol);
    pon('municipio_id', usuario.municipioId ?? null, 'municipioId');
    pon('activo', usuario.activo !== false);
    pon('pseudonimo', usuario.pseudonimo === true);
    pon('puede_escribir', usuario.puedeEscribir === true, 'puedeEscribir');
    pon(
      'permisos',
      usuario.permisos ? JSON.stringify(usuario.permisos) : null,
      'permisos'
    );
    pon('rol_personalizado_id', usuario.rolPersonalizadoId ?? null, 'rolPersonalizadoId');
    pon('rol_propio_id', usuario.rolPropioId ?? null, 'rolPropioId');
    pon('password_hash', usuario.passwordHash, 'passwordHash');
    pon('password_cifrada', usuario.passwordCifrada ?? null, 'passwordCifrada');
    pon('advertencias', aNumero(usuario.advertencias) || 0);
    pon('suspendido', usuario.suspendido === true);
    pon('suspendido_hasta', aFecha(usuario.suspendidoHasta), 'suspendidoHasta');
    pon('suspendido_motivo', usuario.suspendidoMotivo ?? null, 'suspendidoMotivo');
    pon('suspendido_por', usuario.suspendidoPor ?? null, 'suspendidoPor');
    pon(
      'comentarios_restringidos',
      usuario.comentariosRestringidos === true,
      'comentariosRestringidos'
    );
    pon(
      'comentarios_restringidos_hasta',
      aFecha(usuario.comentariosRestringidosHasta),
      'comentariosRestringidosHasta'
    );
    pon(
      'comentarios_restringidos_motivo',
      usuario.comentariosRestringidosMotivo ?? null,
      'comentariosRestringidosMotivo'
    );
    pon(
      'comentarios_restringidos_por',
      usuario.comentariosRestringidosPor ?? null,
      'comentariosRestringidosPor'
    );
    pon('simulado', usuario.simulado === true, 'simulado');
    pon('simulacion_id', usuario.simulacionId ?? null, 'simulacionId');
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
      clave_idempotencia: inc.claveIdempotencia || null,
      folio: inc.folio ?? null,
      meta_firmas: inc.metaFirmas ?? null,
      municipio_id: inc.municipioId,
      estado_entidad: inc.estadoEntidad ?? null,
      ambito: inc.ambito || 'urbano',
      jurisdiccion: inc.jurisdiccion ?? null,
      via_nombre: inc.viaNombre || '',
      via_clave: inc.viaClave || '',
      kilometro: inc.kilometro ?? null,
      sentido: inc.sentido || '',
      tramo: inc.tramo || '',
      dependencia: inc.dependencia || '',
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
        ocultoMotivo: fila.oculto_motivo || '',
        eliminadoEn: desdeFecha(fila.eliminado_en),
        editadoEn: desdeFecha(fila.editado_en),
        simulado: Boolean(fila.simulado),
        simulacionId: fila.simulacion_id || null
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
      claveIdempotencia: fila.clave_idempotencia || null,
      folio: fila.folio || null,
      metaFirmas: fila.meta_firmas === null || fila.meta_firmas === undefined ? null : Number(fila.meta_firmas),
      municipioId: fila.municipio_id,
      estadoEntidad: fila.estado_entidad || null,
      ambito: fila.ambito || 'urbano',
      jurisdiccion: fila.jurisdiccion || null,
      viaNombre: fila.via_nombre || '',
      viaClave: fila.via_clave || '',
      kilometro: fila.kilometro === null || fila.kilometro === undefined ? null : Number(fila.kilometro),
      sentido: fila.sentido || '',
      tramo: fila.tramo || '',
      dependencia: fila.dependencia || '',
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
      evidenciaSolucion: hijos.evidenciasSolucion.get(fila.id) || [],
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  async #hidratar(filas) {
    const hijos = await this.#hijosDe(filas.map((f) => f.id));
    return filas.map((fila) => this.#desdeFila(fila, hijos));
  }

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
    const consulta = this.knex('incidencias').select('*');
    if (!incluirSimulados) consulta.where('simulado', false);

    if (municipioId) consulta.where('municipio_id', municipioId);
    if (Array.isArray(municipios) && municipios.length) {
      consulta.whereIn('municipio_id', municipios);
    }
    if (estadoEntidad) consulta.where('estado_entidad', estadoEntidad);
    if (Array.isArray(estados) && estados.length) consulta.whereIn('estado_entidad', estados);
    if (ambito && ambito !== 'todos') consulta.where('ambito', ambito);
    if (userKey) consulta.where('user_key', userKey);
    if (estado && estado !== 'todos') consulta.where('estado', estado);
    if (tipoId && tipoId !== 'todos') consulta.where('tipo_id', tipoId);
    if (zonaId && zonaId !== 'todos') consulta.where('zona_id', zonaId);
    if (desde) consulta.where('fecha', '>=', aFecha(desde));
    if (hasta) consulta.where('fecha', '<=', aFecha(hasta));
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

  /**
   * Versión ligera para el mapa: sin evidencias, historial ni comentarios.
   * El detalle completo se pide aparte solo cuando se abre una incidencia.
   */
  async puntosIncidencias(filtros = {}) {
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
      ocultas = 'excluir',
      ocultasDe = null,
      incluirSimulados = false,
      bbox = null,
      limite = 3000
    } = filtros;

    const consulta = this.knex('incidencias').select(
      'id',
      'tipo_id',
      'icono_custom',
      'titulo',
      'descripcion',
      'lat',
      'lng',
      'fecha',
      'estado',
      'municipio_id',
      'estado_entidad',
      'ambito',
      'via_nombre',
      'kilometro',
      'zona_nombre',
      'peligrosa',
      'autor_nombre',
      'es_anonimo',
      'user_key'
    );
    if (!incluirSimulados) consulta.where('simulado', false);

    if (municipioId) consulta.where('municipio_id', municipioId);
    if (Array.isArray(municipios) && municipios.length) {
      consulta.whereIn('municipio_id', municipios);
    }
    if (estadoEntidad) consulta.where('estado_entidad', estadoEntidad);
    if (Array.isArray(estados) && estados.length) consulta.whereIn('estado_entidad', estados);
    if (ambito && ambito !== 'todos') consulta.where('ambito', ambito);
    if (userKey) consulta.where('user_key', userKey);
    if (estado && estado !== 'todos') consulta.where('estado', estado);
    if (tipoId && tipoId !== 'todos') consulta.where('tipo_id', tipoId);
    if (zonaId && zonaId !== 'todos') consulta.where('zona_id', zonaId);
    if (desde) consulta.where('fecha', '>=', aFecha(desde));
    if (hasta) consulta.where('fecha', '<=', aFecha(hasta));
    if (texto) {
      consulta.where((b) =>
        b.where('titulo', 'like', `%${texto}%`).orWhere('descripcion', 'like', `%${texto}%`)
      );
    }
    if (ocultas === 'excluir') consulta.where('oculta', false);
    else if (ocultas === 'propias' && ocultasDe) {
      consulta.where((b) => b.where('oculta', false).orWhere('user_key', ocultasDe));
    }

    if (Array.isArray(bbox) && bbox.length === 4) {
      const [minLng, minLat, maxLng, maxLat] = bbox.map(Number);
      consulta.whereBetween('lat', [minLat, maxLat]).whereBetween('lng', [minLng, maxLng]);
    }

    const tope = Math.min(Number(limite) || 3000, 5000);
    const filas = await consulta.orderBy('fecha', 'desc').limit(tope);

    return filas.map((fila) => ({
      id: fila.id,
      tipoId: fila.tipo_id,
      iconoCustom: fila.icono_custom || '',
      titulo: fila.titulo,
      resumen: String(fila.descripcion || '').slice(0, 160),
      lat: Number(fila.lat),
      lng: Number(fila.lng),
      fecha: desdeFecha(fila.fecha),
      estado: fila.estado,
      municipioId: fila.municipio_id,
      estadoEntidad: fila.estado_entidad || null,
      ambito: fila.ambito || 'urbano',
      viaNombre: fila.via_nombre || '',
      kilometro: fila.kilometro === null || fila.kilometro === undefined ? null : Number(fila.kilometro),
      zonaNombre: fila.zona_nombre || null,
      peligrosa: Boolean(fila.peligrosa),
      autorNombre: fila.es_anonimo ? 'Anónimo' : fila.autor_nombre,
      esAnonimo: Boolean(fila.es_anonimo),
      userKey: fila.user_key
    }));
  }

  async incidenciaPorIdempotencia(userKey, clave) {
    if (!userKey || !clave) return null;
    const fila = await this.knex('incidencias')
      .where({ user_key: userKey, clave_idempotencia: clave })
      .first();
    if (!fila) return null;
    const [incidencia] = await this.#hidratar([fila]);
    return incidencia || null;
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
      leidaEn: desdeFecha(fila.leida_en),
      tipo: fila.tipo,
      evento: fila.evento || fila.tipo,
      severidad: fila.severidad || 'info',
      titulo: fila.titulo,
      mensaje: fila.mensaje,
      incidenciaId: fila.incidencia_id,
      entidadTipo: fila.entidad_tipo || null,
      entidadId: fila.entidad_id || null,
      municipioId: fila.municipio_id || null,
      url: fila.url || null,
      claveDedupe: fila.clave_dedupe || null,
      paraUsuario: fila.para_usuario,
      archivadaEn: desdeFecha(fila.archivada_en),
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  async notificacionesDe(userKey, { limite = 200, incluirArchivadas = false } = {}) {
    const consulta = this.knex('notificaciones')
      .where((b) => b.whereNull('para_usuario').orWhere('para_usuario', userKey))
      .whereNull('eliminada_en');
    if (!incluirArchivadas) consulta.whereNull('archivada_en');
    const filas = await consulta
      .orderBy('fecha', 'desc')
      .limit(Math.min(Number(limite) || 200, 500));
    return filas.map((f) => this.#aNotificacion(f));
  }

  async notificacionPorId(id) {
    const fila = await this.knex('notificaciones').where({ id }).first();
    return this.#aNotificacion(fila);
  }

  async notificacionPorDedupe(userKey, clave) {
    if (!clave) return null;
    const fila = await this.knex('notificaciones')
      .where({ para_usuario: userKey, clave_dedupe: String(clave) })
      .first();
    return this.#aNotificacion(fila);
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
      leida_en: notificacion.leidaEn ? aFecha(notificacion.leidaEn) : null,
      tipo: notificacion.tipo,
      evento: notificacion.evento || notificacion.tipo,
      severidad: notificacion.severidad || 'info',
      titulo: notificacion.titulo,
      mensaje: notificacion.mensaje,
      incidencia_id: notificacion.incidenciaId ?? null,
      entidad_tipo: notificacion.entidadTipo ?? null,
      entidad_id: notificacion.entidadId ?? null,
      municipio_id: notificacion.municipioId ?? null,
      url: notificacion.url ?? null,
      clave_dedupe: notificacion.claveDedupe ?? null,
      para_usuario: notificacion.paraUsuario ?? null
    });
    return notificacion;
  }

  async marcarNotificacionLeida(id) {
    const actualizados = await this.knex('notificaciones')
      .where({ id })
      .update({ leida: true, leida_en: this.knex.fn.now() });
    return actualizados > 0;
  }

  async marcarNotificacionesLeidas(userKey) {
    const actualizados = await this.knex('notificaciones')
      .where({ leida: false })
      .where((b) => b.whereNull('para_usuario').orWhere('para_usuario', userKey))
      .update({ leida: true, leida_en: this.knex.fn.now() });
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

  /* --------------------- preferencias por evento y reglas ------------------ */

  async preferenciasEventosDe(usuarioId) {
    const filas = await this.knex('preferencia_eventos').where({ usuario_id: usuarioId });
    return Object.fromEntries(filas.map((f) => [f.evento, f.canal]));
  }

  async guardarPreferenciaEvento(usuarioId, evento, canal) {
    const existente = await this.knex('preferencia_eventos')
      .where({ usuario_id: usuarioId, evento })
      .first();
    if (existente) {
      await this.knex('preferencia_eventos')
        .where({ usuario_id: usuarioId, evento })
        .update({ canal, actualizado_en: this.knex.fn.now() });
    } else {
      await this.knex('preferencia_eventos').insert({ usuario_id: usuarioId, evento, canal });
    }
    return { usuarioId, evento, canal };
  }

  async configuracionNotificacion(evento) {
    const fila = await this.knex('configuracion_notificaciones').where({ evento }).first();
    return this.#aConfiguracion(fila);
  }

  async configuracionesNotificacion() {
    const filas = await this.knex('configuracion_notificaciones').select('*');
    return filas.map((f) => this.#aConfiguracion(f));
  }

  #aConfiguracion(fila) {
    if (!fila) return null;
    const leerLista = (valor) => {
      if (!valor) return [];
      try {
        const lista = JSON.parse(valor);
        return Array.isArray(lista) ? lista : [];
      } catch {
        return [];
      }
    };
    return {
      evento: fila.evento,
      activo: Boolean(fila.activo),
      canal: fila.canal || 'app',
      severidad: fila.severidad || 'info',
      alcance: fila.alcance || 'asignados',
      roles: leerLista(fila.roles),
      municipios: leerLista(fila.municipios),
      estados: leerLista(fila.estados),
      actualizadoPor: fila.actualizado_por || null,
      actualizadoEn: desdeFecha(fila.actualizado_en)
    };
  }

  async guardarConfiguracionNotificacion(evento, datos = {}) {
    const fila = {
      evento,
      activo: datos.activo !== false,
      canal: datos.canal || 'app',
      severidad: datos.severidad || 'info',
      alcance: datos.alcance || 'asignados',
      roles: JSON.stringify(datos.roles || []),
      municipios: JSON.stringify(datos.municipios || []),
      estados: JSON.stringify(datos.estados || []),
      actualizado_por: datos.actualizadoPor || null
    };
    const existente = await this.knex('configuracion_notificaciones').where({ evento }).first();
    if (existente) {
      await this.knex('configuracion_notificaciones')
        .where({ evento })
        .update({ ...fila, actualizado_en: this.knex.fn.now() });
    } else {
      await this.knex('configuracion_notificaciones').insert(fila);
    }
    return this.configuracionNotificacion(evento);
  }


  /* --------------------------- solicitudes de acceso ----------------------- */

  #aSolicitudAcceso(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      folio: fila.folio,
      nombre: fila.nombre,
      correo: fila.correo,
      telefono: fila.telefono || null,
      usuarioSugerido: fila.usuario_sugerido || null,
      rolSolicitado: fila.rol_solicitado,
      municipios: fila.municipios ? JSON.parse(fila.municipios) : [],
      estados: fila.estados ? JSON.parse(fila.estados) : [],
      justificacion: fila.justificacion || '',
      estado: fila.estado,
      revisadoPor: fila.revisado_por || null,
      revisadoEn: desdeFecha(fila.revisado_en),
      motivoRechazo: fila.motivo_rechazo || null,
      ipHash: fila.ip_hash || null,
      creadoEn: desdeFecha(fila.creado_en)
    };
  }

  async crearSolicitudAcceso(solicitud) {
    await this.knex('solicitudes_acceso').insert({
      id: solicitud.id,
      folio: solicitud.folio,
      nombre: solicitud.nombre,
      correo: solicitud.correo,
      telefono: solicitud.telefono || null,
      usuario_sugerido: solicitud.usuarioSugerido || null,
      rol_solicitado: solicitud.rolSolicitado,
      municipios: JSON.stringify(solicitud.municipios || []),
      estados: JSON.stringify(solicitud.estados || []),
      justificacion: solicitud.justificacion || '',
      estado: solicitud.estado || 'pendiente',
      ip_hash: solicitud.ipHash || null
    });
    return solicitud;
  }

  async solicitudesAcceso({ estado = null } = {}) {
    const consulta = this.knex('solicitudes_acceso').select('*').orderBy('creado_en', 'desc');
    if (estado) consulta.where({ estado });
    const filas = await consulta.limit(200);
    return filas.map((f) => this.#aSolicitudAcceso(f));
  }

  async solicitudAccesoPorId(id) {
    const fila = await this.knex('solicitudes_acceso').where({ id }).first();
    return this.#aSolicitudAcceso(fila);
  }

  async solicitudAccesoAbiertaPorCorreo(correo) {
    const fila = await this.knex('solicitudes_acceso')
      .whereRaw('LOWER(correo) = ?', [String(correo || '').trim().toLowerCase()])
      .where({ estado: 'pendiente' })
      .first();
    return this.#aSolicitudAcceso(fila);
  }

  async actualizarSolicitudAcceso(id, cambios = {}) {
    const fila = {};
    if (cambios.estado !== undefined) fila.estado = cambios.estado;
    if (cambios.revisadoPor !== undefined) fila.revisado_por = cambios.revisadoPor;
    if (cambios.revisadoEn !== undefined) fila.revisado_en = aFecha(cambios.revisadoEn);
    if (cambios.motivoRechazo !== undefined) fila.motivo_rechazo = cambios.motivoRechazo;
    await this.knex('solicitudes_acceso').where({ id }).update(fila);
    return this.solicitudAccesoPorId(id);
  }

  /* -------------------------------- tickets -------------------------------- */

  #aTicket(fila, mensajes = [], eventos = []) {
    if (!fila) return null;
    return {
      id: fila.id,
      folio: fila.folio,
      autorUserKey: fila.autor_user_key,
      autorRol: fila.autor_rol || null,
      municipioId: fila.municipio_id || null,
      asunto: fila.asunto,
      categoria: fila.categoria,
      prioridad: fila.prioridad,
      estado: fila.estado,
      asignadoA: fila.asignado_a || null,
      asignadoEn: desdeFecha(fila.asignado_en),
      asignadoPor: fila.asignado_por || null,
      grupo: fila.grupo || null,
      reabiertoEn: desdeFecha(fila.reabierto_en),
      cuerpo: fila.cuerpo,
      creadoEn: desdeFecha(fila.creado_en),
      actualizadoEn: desdeFecha(fila.actualizado_en),
      cerradoEn: desdeFecha(fila.cerrado_en),
      mensajes,
      eventos
    };
  }

  async crearTicket(ticket) {
    await this.knex('tickets').insert({
      id: ticket.id,
      folio: ticket.folio,
      autor_user_key: ticket.autorUserKey,
      autor_rol: ticket.autorRol || null,
      municipio_id: ticket.municipioId || null,
      asunto: ticket.asunto,
      categoria: ticket.categoria,
      prioridad: ticket.prioridad,
      estado: ticket.estado,
      asignado_a: ticket.asignadoA || null,
      asignado_en: ticket.asignadoEn ? aFecha(ticket.asignadoEn) : null,
      asignado_por: ticket.asignadoPor || null,
      grupo: ticket.grupo || null,
      cuerpo: ticket.cuerpo
    });
    return ticket;
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
    EstadoEntidad = null,
    texto = null,
    incluirSimulados = false,
    limite = 200
  } = {}) {
    const consulta = this.knex('tickets').select('*').orderBy('creado_en', 'desc');
    if (!incluirSimulados) consulta.where('simulado', false);
    if (!todos) consulta.where('autor_user_key', userKey);
    if (estado) consulta.where('estado', estado);
    if (prioridad) consulta.where('prioridad', prioridad);
    if (categoria) consulta.where('categoria', categoria);
    if (asignadoA === null) consulta.whereNull('asignado_a');
    else if (asignadoA) consulta.where('asignado_a', asignadoA);
    if (municipioId) consulta.where('municipio_id', municipioId);
    if (texto) {
      const patron = `%${String(texto).toLowerCase()}%`;
      consulta.where((b) =>
        b.whereRaw('LOWER(asunto) LIKE ?', [patron]).orWhereRaw('LOWER(folio) LIKE ?', [patron])
      );
    }
    const filas = await consulta.limit(Math.min(Number(limite) || 200, 500));
    return filas.map((f) => this.#aTicket(f));
  }

  async ticketPorId(id) {
    const fila = await this.knex('tickets').where({ id }).first();
    if (!fila) return null;
    const [mensajes, eventos] = await Promise.all([
      this.knex('ticket_mensajes').where({ ticket_id: id }).orderBy('creado_en', 'asc'),
      this.knex('ticket_eventos').where({ ticket_id: id }).orderBy('creado_en', 'asc')
    ]);
    return this.#aTicket(
      fila,
      mensajes.map((m) => ({
        id: m.id,
        ticketId: m.ticket_id,
        autorUserKey: m.autor_user_key,
        autorRol: m.autor_rol,
        cuerpo: m.cuerpo,
        interno: Boolean(m.interno),
        creadoEn: desdeFecha(m.creado_en)
      })),
      eventos.map((e) => this.#aTicketEvento(e))
    );
  }

  #aTicketEvento(fila) {
    return {
      id: fila.id,
      ticketId: fila.ticket_id,
      tipo: fila.tipo,
      de: fila.de || null,
      a: fila.a || null,
      actor: fila.actor || null,
      nota: fila.nota || '',
      creadoEn: desdeFecha(fila.creado_en)
    };
  }

  async actualizarTicket(id, cambios = {}) {
    const fila = {};
    if (cambios.estado !== undefined) fila.estado = cambios.estado;
    if (cambios.prioridad !== undefined) fila.prioridad = cambios.prioridad;
    if (cambios.categoria !== undefined) fila.categoria = cambios.categoria;
    if (cambios.asignadoA !== undefined) fila.asignado_a = cambios.asignadoA;
    if (cambios.asignadoEn !== undefined) fila.asignado_en = aFecha(cambios.asignadoEn);
    if (cambios.asignadoPor !== undefined) fila.asignado_por = cambios.asignadoPor;
    if (cambios.grupo !== undefined) fila.grupo = cambios.grupo;
    if (cambios.reabiertoEn !== undefined) fila.reabierto_en = aFecha(cambios.reabiertoEn);
    if (cambios.cerradoEn !== undefined) fila.cerrado_en = aFecha(cambios.cerradoEn);
    fila.actualizado_en = this.knex.fn.now();
    await this.knex('tickets').where({ id }).update(fila);
    return this.ticketPorId(id);
  }

  async crearTicketMensaje(mensaje) {
    await this.knex('ticket_mensajes').insert({
      id: mensaje.id,
      ticket_id: mensaje.ticketId,
      autor_user_key: mensaje.autorUserKey,
      autor_rol: mensaje.autorRol || null,
      cuerpo: mensaje.cuerpo,
      interno: mensaje.interno === true
    });
    return mensaje;
  }

  async crearTicketEvento(evento) {
    await this.knex('ticket_eventos').insert({
      id: evento.id,
      ticket_id: evento.ticketId,
      tipo: evento.tipo,
      de: evento.de || null,
      a: evento.a || null,
      actor: evento.actor || null,
      nota: evento.nota || null
    });
    return evento;
  }

  async reglasTickets() {
    const filas = await this.knex('reglas_tickets').select('*').orderBy('creado_en', 'asc');
    return filas.map((f) => ({
      id: f.id,
      municipioId: f.municipio_id || null,
      estado: f.estado || null,
      prioridad: f.prioridad || null,
      asignarA: f.asignar_a || null,
      asignarRol: f.asignar_rol || null,
      activo: Boolean(f.activo),
      creadoEn: desdeFecha(f.creado_en)
    }));
  }

  async crearReglaTicket(regla) {
    await this.knex('reglas_tickets').insert({
      id: regla.id,
      municipio_id: regla.municipioId || null,
      estado: regla.estado || null,
      prioridad: regla.prioridad || null,
      asignar_a: regla.asignarA || null,
      asignar_rol: regla.asignarRol || null,
      activo: regla.activo !== false
    });
    return regla;
  }

  async eliminarReglaTicket(id) {
    const borrados = await this.knex('reglas_tickets').where({ id }).del();
    return borrados > 0;
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

  async borrarDenuncias() {
    const total = Number((await this.knex('denuncias').count({ n: '*' }).first())?.n || 0);
    await this.knex('denuncias').del();
    return total;
  }

  /* ------------------- solicitudes públicas e informes --------------------- */

  #aFilaSolicitud(s) {
    return {
      id: s.id,
      folio: s.folio,
      nombre: s.nombre,
      correo: s.correo,
      telefono: s.telefono ?? null,
      municipio_id: s.municipioId ?? null,
      estado_entidad: s.estadoEntidad ?? null,
      municipios: JSON.stringify(s.municipios || (s.municipioId ? [s.municipioId] : [])),
      estados: JSON.stringify(s.estados || (s.estadoEntidad ? [s.estadoEntidad] : [])),
      ambito: s.ambito || 'todos',
      ambitos: JSON.stringify(s.ambitos || (s.ambito && s.ambito !== 'todos' ? [s.ambito] : [])),
      tipos_todos: s.tiposTodos === true,
      desde: aFecha(s.desde),
      hasta: aFecha(s.hasta),
      tipos: JSON.stringify(s.tipos || []),
      archivo: s.archivo ?? null,
      generado_en: aFecha(s.generadoEn),
      enviado_en: aFecha(s.enviadoEn),
      formato: s.formato || 'pdf',
      mensaje: s.mensaje ?? null,
      estado: s.estado || 'pendiente_verificacion',
      token_verificacion: s.tokenVerificacion ?? null,
      verificado_en: aFecha(s.verificadoEn),
      intentos: Number(s.intentos) || 0,
      error: s.error ?? null,
      ip_hash: s.ipHash ?? null,
      user_agent: s.userAgent ?? null,
      acepta_terminos: s.aceptaTerminos === true,
      creado_en: aFecha(s.creadoEn) || new Date(),
      procesado_en: aFecha(s.procesadoEn)
    };
  }

  #desdeSolicitud(fila) {
    const lista = (valor) => {
      try {
        const datos = valor ? JSON.parse(valor) : [];
        return Array.isArray(datos) ? datos : [];
      } catch {
        return [];
      }
    };
    const tipos = lista(fila.tipos);
    const municipios = lista(fila.municipios);
    const estados = lista(fila.estados);
    const ambitos = lista(fila.ambitos);
    return {
      id: fila.id,
      folio: fila.folio,
      nombre: fila.nombre,
      correo: fila.correo,
      telefono: fila.telefono || null,
      municipioId: fila.municipio_id,
      municipios: municipios.length ? municipios : fila.municipio_id ? [fila.municipio_id] : [],
      estadoEntidad: fila.estado_entidad,
      estados: estados.length ? estados : fila.estado_entidad ? [fila.estado_entidad] : [],
      ambito: fila.ambito,
      ambitos,
      tiposTodos: Boolean(fila.tipos_todos),
      desde: desdeFecha(fila.desde),
      hasta: desdeFecha(fila.hasta),
      tipos,
      archivo: fila.archivo || null,
      generadoEn: desdeFecha(fila.generado_en),
      enviadoEn: desdeFecha(fila.enviado_en),
      formato: fila.formato,
      mensaje: fila.mensaje || '',
      estado: fila.estado,
      tokenVerificacion: fila.token_verificacion,
      verificadoEn: desdeFecha(fila.verificado_en),
      intentos: Number(fila.intentos) || 0,
      error: fila.error || '',
      ipHash: fila.ip_hash,
      userAgent: fila.user_agent,
      aceptaTerminos: Boolean(fila.acepta_terminos),
      creadoEn: desdeFecha(fila.creado_en),
      procesadoEn: desdeFecha(fila.procesado_en)
    };
  }

  async crearSolicitudInforme(solicitud) {
    await this.knex('solicitudes_informe').insert(this.#aFilaSolicitud(solicitud));
    return solicitud;
  }

  async solicitudInformePorFolio(folio) {
    const fila = await this.knex('solicitudes_informe')
      .whereRaw('UPPER(folio) = ?', [String(folio || '').trim().toUpperCase()])
      .first();
    return fila ? this.#desdeSolicitud(fila) : null;
  }

  async solicitudInformePorToken(token) {
    if (!token) return null;
    const fila = await this.knex('solicitudes_informe')
      .where({ token_verificacion: token })
      .first();
    return fila ? this.#desdeSolicitud(fila) : null;
  }

  async solicitudInformePorId(id) {
    const fila = await this.knex('solicitudes_informe').where({ id }).first();
    return fila ? this.#desdeSolicitud(fila) : null;
  }

  async actualizarSolicitudInforme(id, cambios = {}) {
    const fila = {};
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('intentos' in cambios) fila.intentos = Number(cambios.intentos) || 0;
    if ('error' in cambios) fila.error = cambios.error ?? null;
    if ('verificadoEn' in cambios) fila.verificado_en = aFecha(cambios.verificadoEn);
    if ('procesadoEn' in cambios) fila.procesado_en = aFecha(cambios.procesadoEn);
    if ('tokenVerificacion' in cambios) {
      fila.token_verificacion = cambios.tokenVerificacion ?? null;
    }
    if ('archivo' in cambios) fila.archivo = cambios.archivo ?? null;
    if ('generadoEn' in cambios) fila.generado_en = aFecha(cambios.generadoEn);
    if ('enviadoEn' in cambios) fila.enviado_en = aFecha(cambios.enviadoEn);
    if ('formato' in cambios) fila.formato = cambios.formato;
    if (Object.keys(fila).length) {
      await this.knex('solicitudes_informe').where({ id }).update(fila);
    }
    return this.solicitudInformePorId(id);
  }

  async solicitudesInforme(filtros = {}) {
    const consulta = this.knex('solicitudes_informe').select('*');
    if (!filtros.incluirSimulados) consulta.where('simulado', false);
    if (filtros.estado) consulta.where('estado', filtros.estado);
    if (filtros.correo) consulta.where('correo', filtros.correo);
    const filas = await consulta
      .orderBy('creado_en', 'desc')
      .limit(Math.min(Number(filtros.limite) || 500, 1000));
    return filas.map((f) => this.#desdeSolicitud(f));
  }

  async bloqueoVigente({ correo, ipHash, ahora = new Date() } = {}) {
    const email = String(correo || '').trim().toLowerCase();
    if (!email && !ipHash) return null;
    const consulta = this.knex('bloqueos_publicos').where({ activo: true });
    consulta.andWhere((b) => {
      if (email) b.whereRaw('LOWER(correo) = ?', [email]);
      if (ipHash) b.orWhere('ip_hash', ipHash);
    });
    consulta.andWhere((b) => b.whereNull('hasta').orWhere('hasta', '>', aFecha(ahora)));
    const fila = await consulta.first();
    return fila
      ? {
          id: fila.id,
          correo: fila.correo,
          ipHash: fila.ip_hash,
          motivo: fila.motivo,
          activo: Boolean(fila.activo),
          hasta: desdeFecha(fila.hasta),
          creadoPor: fila.creado_por,
          creadoEn: desdeFecha(fila.creado_en)
        }
      : null;
  }

  async crearBloqueo(bloqueo) {
    await this.knex('bloqueos_publicos').insert({
      id: bloqueo.id,
      correo: bloqueo.correo ?? null,
      ip_hash: bloqueo.ipHash ?? null,
      motivo: bloqueo.motivo,
      activo: bloqueo.activo !== false,
      hasta: aFecha(bloqueo.hasta),
      creado_por: bloqueo.creadoPor ?? null,
      creado_en: aFecha(bloqueo.creadoEn) || new Date()
    });
    return bloqueo;
  }

  async listarBloqueos({ soloActivos = false } = {}) {
    const consulta = this.knex('bloqueos_publicos').select('*');
    if (soloActivos) consulta.where({ activo: true });
    const filas = await consulta.orderBy('creado_en', 'desc').limit(500);
    return filas.map((fila) => ({
      id: fila.id,
      correo: fila.correo,
      ipHash: fila.ip_hash,
      motivo: fila.motivo,
      activo: Boolean(fila.activo),
      hasta: desdeFecha(fila.hasta),
      creadoPor: fila.creado_por,
      creadoEn: desdeFecha(fila.creado_en)
    }));
  }

  async desactivarBloqueo(id, datos = {}) {
    const fila = await this.knex('bloqueos_publicos').where({ id }).first();
    if (!fila) return null;
    await this.knex('bloqueos_publicos').where({ id }).update({ activo: false });
    return {
      ...fila,
      activo: false,
      desactivadoPor: datos.por || null
    };
  }

  async registrarEnvioCorreo(envio) {
    await this.knex('envios_correo').insert({
      id: envio.id,
      para: envio.para,
      asunto: envio.asunto,
      tipo: envio.tipo || 'general',
      estado: envio.estado,
      error: envio.error ?? null,
      creado_en: aFecha(envio.creadoEn) || new Date()
    });
    return envio;
  }

  async enviosCorreo({ limite = 200 } = {}) {
    const filas = await this.knex('envios_correo')
      .select('*')
      .orderBy('creado_en', 'desc')
      .limit(Math.min(Number(limite) || 200, 1000));
    return filas.map((f) => ({
      id: f.id,
      para: f.para,
      asunto: f.asunto,
      tipo: f.tipo,
      estado: f.estado,
      error: f.error || '',
      creadoEn: desdeFecha(f.creado_en)
    }));
  }

  /* --------------------- contacto, sugerencias y mensajes ------------------ */

  #desdeContacto(fila) {
    return {
      id: fila.id,
      folio: fila.folio,
      municipioId: fila.municipio_id,
      nombre: fila.nombre,
      correo: fila.correo,
      telefono: fila.telefono || '',
      asunto: fila.asunto,
      mensaje: fila.mensaje,
      estado: fila.estado,
      respuesta: fila.respuesta || '',
      respondidoPor: fila.respondido_por,
      respondidoEn: desdeFecha(fila.respondido_en),
      creadoEn: desdeFecha(fila.creado_en)
    };
  }

  async crearMensajeContacto(mensaje) {
    await this.knex('mensajes_contacto').insert({
      id: mensaje.id,
      folio: mensaje.folio,
      municipio_id: mensaje.municipioId ?? null,
      nombre: mensaje.nombre,
      correo: mensaje.correo,
      telefono: mensaje.telefono ?? null,
      asunto: mensaje.asunto,
      mensaje: mensaje.mensaje,
      estado: mensaje.estado || 'nuevo',
      respuesta: mensaje.respuesta ?? null,
      respondido_por: mensaje.respondidoPor ?? null,
      respondido_en: aFecha(mensaje.respondidoEn),
      ip_hash: mensaje.ipHash ?? null,
      creado_en: aFecha(mensaje.creadoEn) || new Date()
    });
    return mensaje;
  }

  async mensajesContacto({ municipios = null, estado = null, limite = 200 } = {}) {
    const consulta = this.knex('mensajes_contacto').select('*');
    if (Array.isArray(municipios) && municipios.length) {
      consulta.whereIn('municipio_id', municipios);
    }
    if (estado) consulta.where('estado', estado);
    const filas = await consulta
      .orderBy('creado_en', 'desc')
      .limit(Math.min(Number(limite) || 200, 500));
    return filas.map((f) => this.#desdeContacto(f));
  }

  async mensajeContactoPorId(id) {
    const fila = await this.knex('mensajes_contacto').where({ id }).first();
    return fila ? this.#desdeContacto(fila) : null;
  }

  async actualizarMensajeContacto(id, cambios = {}) {
    const fila = {};
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('respuesta' in cambios) fila.respuesta = cambios.respuesta ?? null;
    if ('respondidoPor' in cambios) fila.respondido_por = cambios.respondidoPor ?? null;
    if ('respondidoEn' in cambios) fila.respondido_en = aFecha(cambios.respondidoEn);
    if (Object.keys(fila).length) {
      await this.knex('mensajes_contacto').where({ id }).update(fila);
    }
    return this.mensajeContactoPorId(id);
  }

  #desdeSugerencia(fila) {
    return {
      id: fila.id,
      folio: fila.folio,
      tipo: fila.tipo,
      nombre: fila.nombre || '',
      correo: fila.correo || '',
      municipioId: fila.municipio_id || null,
      mensaje: fila.mensaje,
      estado: fila.estado,
      respuesta: fila.respuesta || '',
      respondidoPor: fila.respondido_por,
      respondidoEn: desdeFecha(fila.respondido_en),
      creadoEn: desdeFecha(fila.creado_en)
    };
  }

  async crearSugerencia(sugerencia) {
    await this.knex('sugerencias').insert({
      id: sugerencia.id,
      folio: sugerencia.folio,
      tipo: sugerencia.tipo || 'mejora',
      nombre: sugerencia.nombre ?? null,
      correo: sugerencia.correo ?? null,
      municipio_id: sugerencia.municipioId ?? null,
      mensaje: sugerencia.mensaje,
      estado: sugerencia.estado || 'nueva',
      respuesta: sugerencia.respuesta ?? null,
      respondido_por: sugerencia.respondidoPor ?? null,
      respondido_en: aFecha(sugerencia.respondidoEn),
      ip_hash: sugerencia.ipHash ?? null,
      creado_en: aFecha(sugerencia.creadoEn) || new Date()
    });
    return sugerencia;
  }

  async sugerencias({ estado = null, municipios = null, incluirSimulados = false, limite = 200 } = {}) {
    const consulta = this.knex('sugerencias').select('*');
    if (!incluirSimulados) consulta.where('simulado', false);
    if (estado) consulta.where('estado', estado);
    if (Array.isArray(municipios)) consulta.whereIn('municipio_id', municipios);
    const filas = await consulta
      .orderBy('creado_en', 'desc')
      .limit(Math.min(Number(limite) || 200, 500));
    return filas.map((f) => this.#desdeSugerencia(f));
  }

  async sugerenciaPorFolio(folio) {
    const fila = await this.knex('sugerencias')
      .whereRaw('UPPER(folio) = ?', [String(folio || '').trim().toUpperCase()])
      .first();
    return fila ? this.#desdeSugerencia(fila) : null;
  }

  async actualizarSugerencia(id, cambios = {}) {
    const fila = {};
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('respuesta' in cambios) fila.respuesta = cambios.respuesta ?? null;
    if ('respondidoPor' in cambios) fila.respondido_por = cambios.respondidoPor ?? null;
    if ('respondidoEn' in cambios) fila.respondido_en = aFecha(cambios.respondidoEn);
    if (Object.keys(fila).length) {
      await this.knex('sugerencias').where({ id }).update(fila);
    }
    const actual = await this.knex('sugerencias').where({ id }).first();
    return actual ? this.#desdeSugerencia(actual) : null;
  }

  #desdeMensajeDirecto(fila) {
    return {
      id: fila.id,
      hilo: fila.hilo,
      deUsuario: fila.de_usuario,
      deNombre: fila.de_nombre,
      deRol: fila.de_rol,
      paraUsuario: fila.para_usuario,
      paraMunicipio: fila.para_municipio,
      paraEstado: fila.para_estado,
      asunto: fila.asunto,
      cuerpo: fila.cuerpo,
      leido: Boolean(fila.leido),
      creadoEn: desdeFecha(fila.creado_en)
    };
  }

  async crearMensajeDirecto(mensaje) {
    await this.knex('mensajes_directos').insert({
      id: mensaje.id,
      hilo: mensaje.hilo,
      de_usuario: mensaje.deUsuario,
      de_nombre: mensaje.deNombre,
      de_rol: mensaje.deRol,
      para_usuario: mensaje.paraUsuario ?? null,
      para_municipio: mensaje.paraMunicipio ?? null,
      para_estado: mensaje.paraEstado ?? null,
      asunto: mensaje.asunto,
      cuerpo: mensaje.cuerpo,
      leido: mensaje.leido === true,
      creado_en: aFecha(mensaje.creadoEn) || new Date()
    });
    return mensaje;
  }

  async mensajeDirectoPorId(id) {
    const fila = await this.knex('mensajes_directos').where({ id }).first();
    return fila ? this.#desdeMensajeDirecto(fila) : null;
  }

  async mensajesDirectos({
    usuario = null,
    esAdmin = false,
    municipios = [],
    estados = [],
    hilo = null,
    limite = 300
  } = {}) {
    const consulta = this.knex('mensajes_directos').select('*');

    if (hilo) {
      consulta.where({ hilo });
    } else if (!esAdmin) {
      consulta.where((b) => {
        if (usuario) {
          b.where('para_usuario', usuario).orWhere('de_usuario', usuario);
        }
        if (municipios.length) {
          b.orWhere((c) => c.whereNull('para_usuario').whereIn('para_municipio', municipios));
        }
        if (estados.length) {
          b.orWhere((c) => c.whereNull('para_usuario').whereIn('para_estado', estados));
        }
      });
    }

    const filas = await consulta
      .orderBy('creado_en', 'asc')
      .limit(Math.min(Number(limite) || 300, 1000));
    return filas.map((f) => this.#desdeMensajeDirecto(f));
  }

  async marcarMensajeLeido(id, usuario) {
    const fila = await this.knex('mensajes_directos').where({ id }).first();
    if (!fila) return null;
    if (fila.para_usuario && fila.para_usuario !== usuario) return null;
    await this.knex('mensajes_directos').where({ id }).update({ leido: true });
    return this.#desdeMensajeDirecto({ ...fila, leido: true });
  }

  /* ------------------------------ adjuntos --------------------------------- */

  #desdeAdjunto(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      archivo: fila.archivo,
      nombreOriginal: fila.nombre_original,
      tipo: fila.tipo,
      tamano: Number(fila.tamano) || 0,
      hashSha256: fila.hash_sha256 || null,
      proposito: fila.proposito,
      subidoPorUsuarioId: fila.subido_por_usuario_id || null,
      subidoPorUserKey: fila.subido_por_user_key || null,
      contextoTipo: fila.contexto_tipo || null,
      contextoId: fila.contexto_id || null,
      estado: fila.estado,
      creadoEn: desdeFecha(fila.creado_en),
      vinculadoEn: desdeFecha(fila.vinculado_en),
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  async crearAdjunto(adjunto) {
    await this.knex('adjuntos').insert({
      id: adjunto.id,
      archivo: adjunto.archivo,
      nombre_original: adjunto.nombreOriginal,
      tipo: adjunto.tipo,
      tamano: adjunto.tamano,
      hash_sha256: adjunto.hashSha256 ?? null,
      proposito: adjunto.proposito,
      subido_por_usuario_id: adjunto.subidoPorUsuarioId ?? null,
      subido_por_user_key: adjunto.subidoPorUserKey ?? null,
      contexto_tipo: adjunto.contextoTipo ?? null,
      contexto_id: adjunto.contextoId ?? null,
      estado: adjunto.estado || 'pendiente',
      creado_en: aFecha(adjunto.creadoEn) || new Date(),
      vinculado_en: aFecha(adjunto.vinculadoEn) || null,
      simulado: adjunto.simulado === true,
      simulacion_id: adjunto.simulacionId ?? null
    });
    return adjunto;
  }

  async adjuntoPorId(id) {
    const fila = await this.knex('adjuntos').where({ id }).first();
    return this.#desdeAdjunto(fila);
  }

  async adjuntosDeContextos(tipo, ids = []) {
    if (!tipo || !ids.length) return [];
    const filas = await this.knex('adjuntos')
      .where({ contexto_tipo: tipo, estado: 'vinculado' })
      .whereIn('contexto_id', ids);
    return filas.map((fila) => this.#desdeAdjunto(fila));
  }

  async adjuntosDeContexto(tipo, id) {
    return this.adjuntosDeContextos(tipo, id ? [id] : []);
  }

  async vincularAdjunto(id, { contextoTipo, contextoId }) {
    await this.knex('adjuntos').where({ id }).update({
      contexto_tipo: contextoTipo,
      contexto_id: contextoId,
      estado: 'vinculado',
      vinculado_en: new Date()
    });
    return this.adjuntoPorId(id);
  }

  async adjuntosPendientes({ usuarioId = null, userKey = null, proposito = null } = {}) {
    const consulta = this.knex('adjuntos').where({ estado: 'pendiente' });
    if (usuarioId) consulta.andWhere({ subido_por_usuario_id: usuarioId });
    else if (userKey) consulta.andWhere({ subido_por_user_key: userKey });
    if (proposito) consulta.andWhere({ proposito });
    const filas = await consulta;
    return filas.map((fila) => this.#desdeAdjunto(fila));
  }

  async eliminarAdjunto(id) {
    return (await this.knex('adjuntos').where({ id }).del()) > 0;
  }

  async comentarioIncidenciaPorId(id) {
    const fila = await this.knex('incidencia_comentarios').where({ id }).first();
    if (!fila) return null;
    return {
      id: fila.id,
      incidenciaId: fila.incidencia_id,
      fecha: desdeFecha(fila.fecha),
      autor: fila.autor,
      texto: fila.texto,
      userKey: fila.user_key || null,
      oculto: Boolean(fila.oculto),
      eliminadoEn: desdeFecha(fila.eliminado_en)
    };
  }

  /* ------------------ suscripciones y campañas de correo ------------------- */

  #desdeSuscripcion(fila) {
    return {
      id: fila.id,
      correo: fila.correo,
      nombre: fila.nombre || '',
      municipioId: fila.municipio_id,
      estado: fila.estado,
      token: fila.token,
      origen: fila.origen || '',
      confirmadoEn: desdeFecha(fila.confirmado_en),
      bajaEn: desdeFecha(fila.baja_en),
      creadoEn: desdeFecha(fila.creado_en),
      actualizadoEn: desdeFecha(fila.actualizado_en)
    };
  }

  async crearSuscripcion(suscripcion) {
    const ahora = aFecha(suscripcion.creadoEn) || new Date();
    await this.knex('suscripciones_correo').insert({
      id: suscripcion.id,
      correo: suscripcion.correo,
      nombre: suscripcion.nombre ?? null,
      municipio_id: suscripcion.municipioId ?? null,
      estado: suscripcion.estado || 'pendiente',
      token: suscripcion.token,
      origen: suscripcion.origen ?? null,
      confirmado_en: aFecha(suscripcion.confirmadoEn),
      baja_en: aFecha(suscripcion.bajaEn),
      ip_hash: suscripcion.ipHash ?? null,
      creado_en: ahora,
      actualizado_en: aFecha(suscripcion.actualizadoEn) || ahora
    });
    return suscripcion;
  }

  async suscripcionPorCorreo(correo) {
    const fila = await this.knex('suscripciones_correo')
      .whereRaw('LOWER(correo) = ?', [String(correo || '').trim().toLowerCase()])
      .first();
    return fila ? this.#desdeSuscripcion(fila) : null;
  }

  async suscripcionPorToken(token) {
    if (!token) return null;
    const fila = await this.knex('suscripciones_correo').where({ token: String(token) }).first();
    return fila ? this.#desdeSuscripcion(fila) : null;
  }

  async actualizarSuscripcion(id, cambios = {}) {
    const fila = { actualizado_en: new Date() };
    if ('nombre' in cambios) fila.nombre = cambios.nombre ?? null;
    if ('municipioId' in cambios) fila.municipio_id = cambios.municipioId ?? null;
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('token' in cambios) fila.token = cambios.token;
    if ('confirmadoEn' in cambios) fila.confirmado_en = aFecha(cambios.confirmadoEn);
    if ('bajaEn' in cambios) fila.baja_en = aFecha(cambios.bajaEn);
    await this.knex('suscripciones_correo').where({ id }).update(fila);
    const actual = await this.knex('suscripciones_correo').where({ id }).first();
    return actual ? this.#desdeSuscripcion(actual) : null;
  }

  async suscripcionesCorreo({ estado = null, municipioId = null, limite = 500 } = {}) {
    const consulta = this.knex('suscripciones_correo').select('*');
    if (estado) consulta.where('estado', estado);
    if (municipioId) consulta.where('municipio_id', municipioId);
    const filas = await consulta
      .orderBy('creado_en', 'desc')
      .limit(Math.min(Number(limite) || 500, 2000));
    return filas.map((f) => this.#desdeSuscripcion(f));
  }

  #desdeCampana(fila) {
    let segmento = {};
    try {
      segmento = fila.segmento ? JSON.parse(fila.segmento) : {};
    } catch {
      segmento = {};
    }
    return {
      id: fila.id,
      nombre: fila.nombre,
      asunto: fila.asunto,
      html: fila.html,
      texto: fila.texto || '',
      segmento,
      estado: fila.estado,
      total: Number(fila.total) || 0,
      enviados: Number(fila.enviados) || 0,
      errores: Number(fila.errores) || 0,
      creadoPor: fila.creado_por,
      creadoEn: desdeFecha(fila.creado_en),
      enviadaEn: desdeFecha(fila.enviada_en)
    };
  }

  async crearCampana(campana) {
    await this.knex('campanas_correo').insert({
      id: campana.id,
      nombre: campana.nombre,
      asunto: campana.asunto,
      html: campana.html,
      texto: campana.texto ?? null,
      segmento: JSON.stringify(campana.segmento || {}),
      estado: campana.estado || 'borrador',
      total: campana.total || 0,
      enviados: campana.enviados || 0,
      errores: campana.errores || 0,
      creado_por: campana.creadoPor ?? null,
      creado_en: aFecha(campana.creadoEn) || new Date(),
      enviada_en: aFecha(campana.enviadaEn)
    });
    return campana;
  }

  async campanaPorId(id) {
    const fila = await this.knex('campanas_correo').where({ id }).first();
    return fila ? this.#desdeCampana(fila) : null;
  }

  async campanasCorreo({ limite = 100 } = {}) {
    const filas = await this.knex('campanas_correo')
      .select('*')
      .orderBy('creado_en', 'desc')
      .limit(Math.min(Number(limite) || 100, 500));
    return filas.map((f) => this.#desdeCampana(f));
  }

  async actualizarCampana(id, cambios = {}) {
    const fila = {};
    if ('nombre' in cambios) fila.nombre = cambios.nombre;
    if ('asunto' in cambios) fila.asunto = cambios.asunto;
    if ('html' in cambios) fila.html = cambios.html;
    if ('texto' in cambios) fila.texto = cambios.texto ?? null;
    if ('segmento' in cambios) fila.segmento = JSON.stringify(cambios.segmento || {});
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('total' in cambios) fila.total = Number(cambios.total) || 0;
    if ('enviados' in cambios) fila.enviados = Number(cambios.enviados) || 0;
    if ('errores' in cambios) fila.errores = Number(cambios.errores) || 0;
    if ('enviadaEn' in cambios) fila.enviada_en = aFecha(cambios.enviadaEn);
    if (Object.keys(fila).length) {
      await this.knex('campanas_correo').where({ id }).update(fila);
    }
    return this.campanaPorId(id);
  }

  async guardarDestinatariosCampana(campanaId, destinatarios = []) {
    await this.knex('campana_destinatarios').where({ campana_id: campanaId }).del();
    if (!destinatarios.length) return 0;
    const filas = destinatarios.map((d) => ({
      id: d.id,
      campana_id: campanaId,
      correo: d.correo,
      suscripcion_id: d.suscripcionId ?? null,
      token_baja: d.tokenBaja ?? null,
      estado: d.estado || 'pendiente',
      error: d.error ?? null,
      enviado_en: aFecha(d.enviadoEn),
      creado_en: aFecha(d.creadoEn) || new Date()
    }));
    // Los correos con polígonos no aplican aquí, pero se trocea igual para no
    // acercarse al paquete máximo con listas grandes.
    for (let i = 0; i < filas.length; i += 500) {
      await this.knex('campana_destinatarios').insert(filas.slice(i, i + 500));
    }
    return filas.length;
  }

  async destinatariosCampana(campanaId) {
    const filas = await this.knex('campana_destinatarios')
      .select('*')
      .where({ campana_id: campanaId })
      .orderBy('creado_en', 'asc')
      .limit(5000);
    return filas.map((f) => ({
      id: f.id,
      campanaId: f.campana_id,
      correo: f.correo,
      suscripcionId: f.suscripcion_id,
      tokenBaja: f.token_baja,
      estado: f.estado,
      error: f.error || '',
      enviadoEn: desdeFecha(f.enviado_en),
      creadoEn: desdeFecha(f.creado_en)
    }));
  }

  async actualizarDestinatarioCampana(id, cambios = {}) {
    const fila = {};
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('error' in cambios) fila.error = (cambios.error ?? null)?.slice?.(0, 400) ?? null;
    if ('enviadoEn' in cambios) fila.enviado_en = aFecha(cambios.enviadoEn);
    if (Object.keys(fila).length) {
      await this.knex('campana_destinatarios').where({ id }).update(fila);
    }
    const actual = await this.knex('campana_destinatarios').where({ id }).first();
    if (!actual) return null;
    return {
      id: actual.id,
      campanaId: actual.campana_id,
      correo: actual.correo,
      estado: actual.estado,
      error: actual.error || '',
      enviadoEn: desdeFecha(actual.enviado_en)
    };
  }

  /* ------------------------- configuración clave-valor --------------------- */

  #desdeConfiguracion(fila) {
    let valor = fila.valor;
    try {
      valor = typeof valor === 'string' ? JSON.parse(valor) : valor;
    } catch {
      // Compatibilidad con texto plano.
    }
    return {
      clave: fila.clave,
      valor,
      actualizadoPor: fila.actualizado_por || null,
      actualizadoEn: desdeFecha(fila.actualizado_en)
    };
  }

  async configuracion(clave) {
    const fila = await this.knex('configuracion').where({ clave }).first();
    return fila ? this.#desdeConfiguracion(fila) : null;
  }

  async configuraciones() {
    const filas = await this.knex('configuracion').select('*').orderBy('clave', 'asc');
    return filas.map((f) => this.#desdeConfiguracion(f));
  }

  async guardarConfiguracion(clave, valor, actor = null) {
    const ahora = new Date();
    const existente = await this.knex('configuracion').where({ clave }).first();
    if (existente) {
      await this.knex('configuracion').where({ clave }).update({
        valor: JSON.stringify(valor),
        actualizado_por: actor || null,
        actualizado_en: ahora
      });
    } else {
      await this.knex('configuracion').insert({
        clave,
        valor: JSON.stringify(valor),
        actualizado_por: actor || null,
        creado_en: ahora,
        actualizado_en: ahora
      });
    }
    return this.configuracion(clave);
  }

  /* ----------------------------- firmas ------------------------------------ */

  #desdeRecoleccion(fila) {
    return {
      id: fila.id,
      tipo: fila.tipo,
      incidenciaId: fila.incidencia_id || null,
      municipioId: fila.municipio_id || null,
      titulo: fila.titulo,
      descripcion: fila.descripcion || '',
      meta: Number(fila.meta) || 0,
      estado: fila.estado,
      creadoPorUsuarioId: fila.creado_por_usuario_id || null,
      creadoPorUserKey: fila.creado_por_user_key || null,
      creadoEn: desdeFecha(fila.creado_en),
      metaAlcanzadaEn: desdeFecha(fila.meta_alcanzada_en),
      enviadaEn: desdeFecha(fila.enviada_en),
      enviadaA: fila.enviada_a || null,
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  #desdeFirma(fila) {
    return {
      id: fila.id,
      recoleccionId: fila.recoleccion_id,
      usuarioId: fila.usuario_id || null,
      userKey: fila.user_key,
      nombrePublico: fila.nombre_publico || '',
      creadoEn: desdeFecha(fila.creado_en),
      ipHash: fila.ip_hash || null,
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  async crearRecoleccionFirma(recoleccion) {
    await this.knex('recolecciones_firmas').insert({
      id: recoleccion.id,
      tipo: recoleccion.tipo,
      incidencia_id: recoleccion.incidenciaId ?? null,
      municipio_id: recoleccion.municipioId ?? null,
      titulo: recoleccion.titulo,
      descripcion: recoleccion.descripcion ?? null,
      meta: Number(recoleccion.meta) || 0,
      estado: recoleccion.estado || 'abierta',
      creado_por_usuario_id: recoleccion.creadoPorUsuarioId ?? null,
      creado_por_user_key: recoleccion.creadoPorUserKey ?? null,
      creado_en: aFecha(recoleccion.creadoEn) || new Date(),
      meta_alcanzada_en: aFecha(recoleccion.metaAlcanzadaEn),
      enviada_en: aFecha(recoleccion.enviadaEn),
      enviada_a: recoleccion.enviadaA ?? null,
      simulado: recoleccion.simulado === true,
      simulacion_id: recoleccion.simulacionId ?? null
    });
    return recoleccion;
  }

  async recoleccionFirmaPorId(id) {
    const fila = await this.knex('recolecciones_firmas').where({ id }).first();
    return fila ? this.#desdeRecoleccion(fila) : null;
  }

  async recoleccionFirmaPorIncidencia(incidenciaId) {
    const fila = await this.knex('recolecciones_firmas')
      .where({ tipo: 'incidencia', incidencia_id: incidenciaId })
      .first();
    return fila ? this.#desdeRecoleccion(fila) : null;
  }

  async recoleccionesFirmas({ municipios = null, estado = null, incidenciaId = null, limite = 200 } = {}) {
    const consulta = this.knex('recolecciones_firmas').select('*');
    if (Array.isArray(municipios) && municipios.length) {
      consulta.whereIn('municipio_id', municipios);
    } else if (Array.isArray(municipios) && !municipios.length) {
      return [];
    }
    if (estado) consulta.where('estado', estado);
    if (incidenciaId) consulta.where('incidencia_id', incidenciaId);
    const filas = await consulta
      .orderBy('creado_en', 'desc')
      .limit(Math.min(Number(limite) || 200, 1000));
    return filas.map((f) => this.#desdeRecoleccion(f));
  }

  async actualizarRecoleccionFirma(id, cambios = {}) {
    const fila = {};
    if ('titulo' in cambios) fila.titulo = cambios.titulo;
    if ('descripcion' in cambios) fila.descripcion = cambios.descripcion ?? null;
    if ('meta' in cambios) fila.meta = Number(cambios.meta) || 0;
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('metaAlcanzadaEn' in cambios) fila.meta_alcanzada_en = aFecha(cambios.metaAlcanzadaEn);
    if ('enviadaEn' in cambios) fila.enviada_en = aFecha(cambios.enviadaEn);
    if ('enviadaA' in cambios) fila.enviada_a = cambios.enviadaA ?? null;
    if (Object.keys(fila).length) {
      await this.knex('recolecciones_firmas').where({ id }).update(fila);
    }
    return this.recoleccionFirmaPorId(id);
  }

  async crearFirmaIncidencia(firma) {
    const existente = await this.firmaDeUsuario(firma.recoleccionId, firma.userKey);
    if (existente) return existente;
    await this.knex('recoleccion_firmas').insert({
      id: firma.id,
      recoleccion_id: firma.recoleccionId,
      usuario_id: firma.usuarioId ?? null,
      user_key: firma.userKey,
      nombre_publico: firma.nombrePublico ?? null,
      creado_en: aFecha(firma.creadoEn) || new Date(),
      ip_hash: firma.ipHash ?? null,
      simulado: firma.simulado === true,
      simulacion_id: firma.simulacionId ?? null
    });
    return firma;
  }

  async firmaDeUsuario(recoleccionId, userKey) {
    const fila = await this.knex('recoleccion_firmas')
      .where({ recoleccion_id: recoleccionId, user_key: userKey })
      .first();
    return fila ? this.#desdeFirma(fila) : null;
  }

  async firmasDeRecoleccion(recoleccionId) {
    const filas = await this.knex('recoleccion_firmas')
      .where({ recoleccion_id: recoleccionId })
      .orderBy('creado_en', 'asc');
    return filas.map((f) => this.#desdeFirma(f));
  }

  async eliminarFirmaIncidencia(recoleccionId, userKey) {
    const borradas = await this.knex('recoleccion_firmas')
      .where({ recoleccion_id: recoleccionId, user_key: userKey })
      .del();
    return borradas > 0;
  }

  async contarFirmasDeUsuario(userKey) {
    const fila = await this.knex('recoleccion_firmas')
      .where({ user_key: userKey })
      .count({ total: '*' })
      .first();
    return Number(fila?.total) || 0;
  }

  async crearEnvioFirma(envio) {
    await this.knex('recoleccion_firmas_envios').insert({
      id: envio.id,
      recoleccion_id: envio.recoleccionId,
      tipo: envio.tipo,
      destino: envio.destino ?? null,
      estado: envio.estado || 'pendiente',
      nota: envio.nota ?? null,
      creado_por: envio.creadoPor ?? null,
      creado_en: aFecha(envio.creadoEn) || new Date()
    });
    return envio;
  }

  async enviosDeRecoleccion(recoleccionId) {
    const filas = await this.knex('recoleccion_firmas_envios')
      .where({ recoleccion_id: recoleccionId })
      .orderBy('creado_en', 'desc');
    return filas.map((f) => ({
      id: f.id,
      recoleccionId: f.recoleccion_id,
      tipo: f.tipo,
      destino: f.destino || null,
      estado: f.estado,
      nota: f.nota || '',
      creadoPor: f.creado_por || null,
      creadoEn: desdeFecha(f.creado_en)
    }));
  }

  /* ------------------------- comentarios con reglas ----------------------- */

  #desdeComentario(fila) {
    return {
      id: fila.id,
      fecha: desdeFecha(fila.fecha),
      autor: fila.autor,
      texto: fila.texto,
      userKey: fila.user_key || null,
      oculto: Boolean(fila.oculto),
      ocultoPor: fila.oculto_por || null,
      ocultoFecha: desdeFecha(fila.oculto_fecha),
      ocultoMotivo: fila.oculto_motivo || '',
      eliminadoEn: desdeFecha(fila.eliminado_en),
      editadoEn: desdeFecha(fila.editado_en),
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  async comentariosDeIncidencia(
    incidenciaId,
    { incluirOcultos = false, incluirEliminados = false, pagina = 1, limite = 50 } = {}
  ) {
    const base = this.knex('incidencia_comentarios').where({ incidencia_id: incidenciaId });
    if (!incluirOcultos) base.where('oculto', false);
    if (!incluirEliminados) base.whereNull('eliminado_en');
    const [{ total }] = await base.clone().count({ total: '*' });
    const tamano = Math.min(Math.max(Number(limite) || 50, 1), 200);
    const salto = (Math.max(Number(pagina) || 1, 1) - 1) * tamano;
    const filas = await base
      .clone()
      .orderBy('fecha', 'asc')
      .limit(tamano)
      .offset(salto);
    return {
      comentarios: filas.map((f) => this.#desdeComentario(f)),
      total: Number(total) || 0,
      pagina: Math.max(Number(pagina) || 1, 1),
      limite: tamano
    };
  }

  async crearComentarioIncidencia(incidenciaId, comentario) {
    await this.knex('incidencia_comentarios').insert({
      id: comentario.id,
      incidencia_id: incidenciaId,
      fecha: aFecha(comentario.fecha) || new Date(),
      autor: comentario.autor,
      texto: comentario.texto,
      user_key: comentario.userKey ?? null,
      oculto: comentario.oculto === true,
      oculto_por: comentario.ocultoPor ?? null,
      oculto_fecha: aFecha(comentario.ocultoFecha),
      oculto_motivo: comentario.ocultoMotivo ?? null,
      eliminado_en: aFecha(comentario.eliminadoEn),
      editado_en: aFecha(comentario.editadoEn),
      simulado: comentario.simulado === true,
      simulacion_id: comentario.simulacionId ?? null
    });
    return comentario;
  }

  async actualizarComentarioIncidencia(incidenciaId, comentarioId, cambios = {}) {
    const fila = {};
    if ('texto' in cambios) fila.texto = cambios.texto;
    if ('oculto' in cambios) fila.oculto = cambios.oculto === true;
    if ('ocultoPor' in cambios) fila.oculto_por = cambios.ocultoPor ?? null;
    if ('ocultoFecha' in cambios) fila.oculto_fecha = aFecha(cambios.ocultoFecha);
    if ('ocultoMotivo' in cambios) fila.oculto_motivo = cambios.ocultoMotivo ?? null;
    if ('eliminadoEn' in cambios) fila.eliminado_en = aFecha(cambios.eliminadoEn);
    if ('editadoEn' in cambios) fila.editado_en = aFecha(cambios.editadoEn);
    if (Object.keys(fila).length) {
      await this.knex('incidencia_comentarios')
        .where({ id: comentarioId, incidencia_id: incidenciaId })
        .update(fila);
    }
    const actual = await this.knex('incidencia_comentarios').where({ id: comentarioId }).first();
    return actual ? this.#desdeComentario(actual) : null;
  }

  async restriccionComentariosVigente({ usuarioId = null, userKey = null } = {}) {
    const consulta = this.knex('restricciones_comentarios').where({ activo: true });
    consulta.andWhere((q) => {
      if (usuarioId) q.orWhere('usuario_id', usuarioId);
      if (userKey) q.orWhere('user_key', userKey);
    });
    consulta.andWhere((q) => q.whereNull('hasta').orWhere('hasta', '>', new Date()));
    const fila = await consulta.first();
    return fila
      ? {
          id: fila.id,
          usuarioId: fila.usuario_id || null,
          userKey: fila.user_key || null,
          motivo: fila.motivo,
          hasta: desdeFecha(fila.hasta),
          activo: Boolean(fila.activo),
          creadoPor: fila.creado_por || null,
          creadoEn: desdeFecha(fila.creado_en)
        }
      : null;
  }

  async crearRestriccionComentarios(restriccion) {
    await this.knex('restricciones_comentarios').insert({
      id: restriccion.id,
      usuario_id: restriccion.usuarioId ?? null,
      user_key: restriccion.userKey ?? null,
      motivo: restriccion.motivo,
      hasta: aFecha(restriccion.hasta),
      activo: restriccion.activo !== false,
      creado_por: restriccion.creadoPor ?? null,
      creado_en: aFecha(restriccion.creadoEn) || new Date()
    });
    return restriccion;
  }

  async desactivarRestriccionComentarios(id) {
    await this.knex('restricciones_comentarios').where({ id }).update({ activo: false });
    const fila = await this.knex('restricciones_comentarios').where({ id }).first();
    return fila
      ? {
          id: fila.id,
          usuarioId: fila.usuario_id || null,
          userKey: fila.user_key || null,
          motivo: fila.motivo,
          hasta: desdeFecha(fila.hasta),
          activo: Boolean(fila.activo)
        }
      : null;
  }

  async contarComentariosRecientes(userKey, desde) {
    const fila = await this.knex('incidencia_comentarios')
      .where({ user_key: userKey })
      .whereNull('eliminado_en')
      .andWhere('fecha', '>=', aFecha(desde))
      .count({ total: '*' })
      .first();
    return Number(fila?.total) || 0;
  }

  /* ------------------------------ legal ----------------------------------- */

  #desdeDocumentoLegal(fila) {
    return {
      clave: fila.clave,
      titulo: fila.titulo,
      htmlPublicado: fila.html_publicado || '',
      versionPublicada: Number(fila.version_publicada) || 0,
      publicadoPor: fila.publicado_por || null,
      publicadoEn: desdeFecha(fila.publicado_en),
      htmlBorrador: fila.html_borrador || '',
      actualizadoPor: fila.actualizado_por || null,
      actualizadoEn: desdeFecha(fila.actualizado_en)
    };
  }

  async documentoLegal(clave) {
    const fila = await this.knex('documentos_legales').where({ clave }).first();
    return fila ? this.#desdeDocumentoLegal(fila) : null;
  }

  async documentosLegales() {
    const filas = await this.knex('documentos_legales').select('*').orderBy('clave', 'asc');
    return filas.map((f) => this.#desdeDocumentoLegal(f));
  }

  async guardarDocumentoLegal(clave, cambios = {}) {
    const existente = await this.knex('documentos_legales').where({ clave }).first();
    const fila = {};
    if ('titulo' in cambios) fila.titulo = cambios.titulo;
    if ('htmlPublicado' in cambios) fila.html_publicado = cambios.htmlPublicado;
    if ('versionPublicada' in cambios) fila.version_publicada = Number(cambios.versionPublicada) || 0;
    if ('publicadoPor' in cambios) fila.publicado_por = cambios.publicadoPor ?? null;
    if ('publicadoEn' in cambios) fila.publicado_en = aFecha(cambios.publicadoEn);
    if ('htmlBorrador' in cambios) fila.html_borrador = cambios.htmlBorrador;
    if ('actualizadoPor' in cambios) fila.actualizado_por = cambios.actualizadoPor ?? null;
    if ('actualizadoEn' in cambios) fila.actualizado_en = aFecha(cambios.actualizadoEn);
    if (existente) {
      if (Object.keys(fila).length) {
        await this.knex('documentos_legales').where({ clave }).update(fila);
      }
    } else {
      await this.knex('documentos_legales').insert({
        clave,
        titulo: cambios.titulo || clave,
        html_publicado: cambios.htmlPublicado ?? null,
        version_publicada: Number(cambios.versionPublicada) || 0,
        publicado_por: cambios.publicadoPor ?? null,
        publicado_en: aFecha(cambios.publicadoEn),
        html_borrador: cambios.htmlBorrador ?? null,
        actualizado_por: cambios.actualizadoPor ?? null,
        actualizado_en: aFecha(cambios.actualizadoEn) || new Date()
      });
    }
    return this.documentoLegal(clave);
  }

  async historialLegal(clave) {
    const filas = await this.knex('documentos_legales_historial')
      .where({ clave })
      .orderBy('version', 'desc');
    return filas.map((f) => ({
      id: f.id,
      clave: f.clave,
      version: Number(f.version),
      titulo: f.titulo,
      html: f.html,
      publicadoPor: f.publicado_por || null,
      publicadoEn: desdeFecha(f.publicado_en)
    }));
  }

  async crearVersionLegal(version) {
    await this.knex('documentos_legales_historial').insert({
      id: version.id,
      clave: version.clave,
      version: Number(version.version),
      titulo: version.titulo,
      html: version.html,
      publicado_por: version.publicadoPor ?? null,
      publicado_en: aFecha(version.publicadoEn) || new Date()
    });
    return version;
  }

  async versionLegal(clave, version) {
    const fila = await this.knex('documentos_legales_historial')
      .where({ clave, version: Number(version) })
      .first();
    return fila
      ? {
          id: fila.id,
          clave: fila.clave,
          version: Number(fila.version),
          titulo: fila.titulo,
          html: fila.html,
          publicadoPor: fila.publicado_por || null,
          publicadoEn: desdeFecha(fila.publicado_en)
        }
      : null;
  }

  #desdeAceptacionLegal(fila) {
    return {
      id: fila.id,
      usuarioId: fila.usuario_id || null,
      userKey: fila.user_key,
      versionTerminos: Number(fila.version_terminos) || 0,
      versionPrivacidad: Number(fila.version_privacidad) || 0,
      aceptadoEn: desdeFecha(fila.aceptado_en),
      ipHash: fila.ip_hash || null,
      userAgent: fila.user_agent || null
    };
  }

  async ultimaAceptacionLegal(userKey) {
    const fila = await this.knex('aceptaciones_legales')
      .where({ user_key: userKey })
      .orderBy('aceptado_en', 'desc')
      .first();
    return fila ? this.#desdeAceptacionLegal(fila) : null;
  }

  async registrarAceptacionLegal(registro) {
    await this.knex('aceptaciones_legales').insert({
      id: registro.id,
      usuario_id: registro.usuarioId ?? null,
      user_key: registro.userKey,
      version_terminos: Number(registro.versionTerminos),
      version_privacidad: Number(registro.versionPrivacidad),
      aceptado_en: aFecha(registro.aceptadoEn) || new Date(),
      ip_hash: registro.ipHash ?? null,
      user_agent: registro.userAgent ?? null
    });
    return registro;
  }

  /* -------------------- contacto directo a funcionarios ------------------- */

  #desdeContactoFuncionario(fila) {
    return {
      id: fila.id,
      folio: fila.folio,
      deUsuarioId: fila.de_usuario_id || null,
      deUserKey: fila.de_user_key || null,
      deNombre: fila.de_nombre,
      estadoEntidad: fila.estado_entidad || null,
      municipioId: fila.municipio_id || null,
      asunto: fila.asunto,
      mensaje: fila.mensaje,
      estado: fila.estado,
      creadoEn: desdeFecha(fila.creado_en),
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  async crearContactoFuncionario(contacto, destinatarios = []) {
    await this.knex.transaction(async (trx) => {
      await trx('contactos_funcionarios').insert({
        id: contacto.id,
        folio: contacto.folio,
        de_usuario_id: contacto.deUsuarioId ?? null,
        de_user_key: contacto.deUserKey ?? null,
        de_nombre: contacto.deNombre,
        estado_entidad: contacto.estadoEntidad ?? null,
        municipio_id: contacto.municipioId ?? null,
        asunto: contacto.asunto,
        mensaje: contacto.mensaje,
        estado: contacto.estado || 'nuevo',
        creado_en: aFecha(contacto.creadoEn) || new Date(),
        simulado: contacto.simulado === true,
        simulacion_id: contacto.simulacionId ?? null
      });
      if (destinatarios.length) {
        await trx('contacto_funcionario_destinatarios').insert(
          destinatarios.map((d) => ({
            contacto_id: contacto.id,
            usuario_id: d.usuarioId,
            leido_en: aFecha(d.leidoEn),
            respondido_en: aFecha(d.respondidoEn)
          }))
        );
      }
    });
    return contacto;
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
    const consulta = this.knex('contactos_funcionarios as c').select('c.*');
    if (!incluirSimulados) consulta.where('c.simulado', false);
    if (usuarioId) {
      consulta
        .join('contacto_funcionario_destinatarios as d', 'd.contacto_id', 'c.id')
        .where('d.usuario_id', usuarioId);
    }
    if (Array.isArray(municipios) && municipios.length) {
      consulta.whereIn('c.municipio_id', municipios);
    } else if (Array.isArray(municipios) && !municipios.length) {
      return [];
    }
    if (autorId) consulta.where('c.de_usuario_id', autorId);
    if (estado) consulta.where('c.estado', estado);
    const busqueda = String(texto || '').trim();
    if (busqueda) {
      const patron = `%${busqueda.toLowerCase()}%`;
      consulta.andWhere((q) =>
        q
          .whereRaw('LOWER(c.folio) LIKE ?', [patron])
          .orWhereRaw('LOWER(c.asunto) LIKE ?', [patron])
          .orWhereRaw('LOWER(c.mensaje) LIKE ?', [patron])
      );
    }
    const filas = await consulta
      .orderBy('c.creado_en', 'desc')
      .limit(Math.min(Number(limite) || 200, 500));
    return filas.map((f) => this.#desdeContactoFuncionario(f));
  }

  async contactoFuncionarioPorId(id) {
    const fila = await this.knex('contactos_funcionarios').where({ id }).first();
    if (!fila) return null;
    const [destinatarios, mensajes] = await Promise.all([
      this.contactoFuncionarioDestinatarios(id),
      this.mensajesContactoFuncionario(id)
    ]);
    return { ...this.#desdeContactoFuncionario(fila), destinatarios, mensajes };
  }

  async actualizarContactoFuncionario(id, cambios = {}) {
    const fila = {};
    if ('estado' in cambios) fila.estado = cambios.estado;
    if (Object.keys(fila).length) {
      await this.knex('contactos_funcionarios').where({ id }).update(fila);
    }
    return this.contactoFuncionarioPorId(id);
  }

  async contactoFuncionarioDestinatarios(contactoId) {
    const filas = await this.knex('contacto_funcionario_destinatarios')
      .where({ contacto_id: contactoId });
    return filas.map((f) => ({
      contactoId: f.contacto_id,
      usuarioId: f.usuario_id,
      leidoEn: desdeFecha(f.leido_en),
      respondidoEn: desdeFecha(f.respondido_en)
    }));
  }

  async marcarContactoFuncionarioLeido(contactoId, usuarioId) {
    await this.knex('contacto_funcionario_destinatarios')
      .where({ contacto_id: contactoId, usuario_id: usuarioId })
      .whereNull('leido_en')
      .update({ leido_en: new Date() });
    return true;
  }

  async crearMensajeContactoFuncionario(mensaje) {
    await this.knex('contacto_funcionario_mensajes').insert({
      id: mensaje.id,
      contacto_id: mensaje.contactoId,
      de_usuario_id: mensaje.deUsuarioId ?? null,
      de_nombre: mensaje.deNombre,
      cuerpo: mensaje.cuerpo,
      interno: mensaje.interno === true,
      creado_en: aFecha(mensaje.creadoEn) || new Date()
    });
    return mensaje;
  }

  async mensajesContactoFuncionario(contactoId) {
    const filas = await this.knex('contacto_funcionario_mensajes')
      .where({ contacto_id: contactoId })
      .orderBy('creado_en', 'asc');
    return filas.map((f) => ({
      id: f.id,
      contactoId: f.contacto_id,
      deUsuarioId: f.de_usuario_id || null,
      deNombre: f.de_nombre,
      cuerpo: f.cuerpo,
      interno: Boolean(f.interno),
      creadoEn: desdeFecha(f.creado_en)
    }));
  }

  async mensajeContactoFuncionarioPorId(id) {
    const f = await this.knex('contacto_funcionario_mensajes').where({ id }).first();
    if (!f) return null;
    return {
      id: f.id,
      contactoId: f.contacto_id,
      deUsuarioId: f.de_usuario_id || null,
      deNombre: f.de_nombre,
      cuerpo: f.cuerpo,
      interno: Boolean(f.interno),
      creadoEn: desdeFecha(f.creado_en)
    };
  }

  async crearSolicitudFuncionario(solicitud) {
    await this.knex('solicitudes_funcionario').insert({
      id: solicitud.id,
      folio: solicitud.folio,
      municipio_id: solicitud.municipioId ?? null,
      estado_entidad: solicitud.estadoEntidad ?? null,
      solicitado_por_usuario_id: solicitud.solicitadoPorUsuarioId ?? null,
      solicitado_por_user_key: solicitud.solicitadoPorUserKey ?? null,
      mensaje: solicitud.mensaje ?? null,
      estado: solicitud.estado || 'pendiente',
      atendido_por: solicitud.atendidoPor ?? null,
      atendido_en: aFecha(solicitud.atendidoEn),
      creado_en: aFecha(solicitud.creadoEn) || new Date()
    });
    return solicitud;
  }

  async solicitudesFuncionario({ estado = null, limite = 200 } = {}) {
    const consulta = this.knex('solicitudes_funcionario').select('*');
    if (estado) consulta.where('estado', estado);
    const filas = await consulta
      .orderBy('creado_en', 'desc')
      .limit(Math.min(Number(limite) || 200, 500));
    return filas.map((f) => ({
      id: f.id,
      folio: f.folio,
      municipioId: f.municipio_id || null,
      estadoEntidad: f.estado_entidad || null,
      solicitadoPorUsuarioId: f.solicitado_por_usuario_id || null,
      solicitadoPorUserKey: f.solicitado_por_user_key || null,
      mensaje: f.mensaje || '',
      estado: f.estado,
      atendidoPor: f.atendido_por || null,
      atendidoEn: desdeFecha(f.atendido_en),
      creadoEn: desdeFecha(f.creado_en)
    }));
  }

  async actualizarSolicitudFuncionario(id, cambios = {}) {
    const fila = {};
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('atendidoPor' in cambios) fila.atendido_por = cambios.atendidoPor ?? null;
    if ('atendidoEn' in cambios) fila.atendido_en = aFecha(cambios.atendidoEn);
    if (Object.keys(fila).length) {
      await this.knex('solicitudes_funcionario').where({ id }).update(fila);
    }
    const lista = await this.solicitudesFuncionario({ limite: 500 });
    return lista.find((s) => s.id === id) || null;
  }

  /* ---------------------- historial de notificaciones --------------------- */

  #desdeNotificacionHistorial(fila) {
    return {
      id: fila.id,
      fecha: desdeFecha(fila.fecha),
      leida: Boolean(fila.leida),
      leidaEn: desdeFecha(fila.leida_en),
      tipo: fila.tipo,
      evento: fila.evento || null,
      severidad: fila.severidad || 'info',
      titulo: fila.titulo,
      mensaje: fila.mensaje,
      incidenciaId: fila.incidencia_id || null,
      entidadTipo: fila.entidad_tipo || null,
      entidadId: fila.entidad_id || null,
      municipioId: fila.municipio_id || null,
      url: fila.url || null,
      paraUsuario: fila.para_usuario || null,
      archivadaEn: desdeFecha(fila.archivada_en),
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  async notificacionesHistorial(
    userKey,
    { pagina = 1, limite = 30, evento = null, desde = null, hasta = null, texto = '', incluirArchivadas = true } = {}
  ) {
    const base = this.knex('notificaciones').where((q) => {
      q.whereNull('para_usuario').orWhere('para_usuario', userKey);
    });
    base.whereNull('eliminada_en');
    if (!incluirArchivadas) base.whereNull('archivada_en');
    if (evento) base.where('evento', evento);
    if (desde) base.andWhere('fecha', '>=', aFecha(desde));
    if (hasta) base.andWhere('fecha', '<=', aFecha(hasta));
    const busqueda = String(texto || '').trim().toLowerCase();
    if (busqueda) {
      const patron = `%${busqueda}%`;
      base.andWhere((q) =>
        q.whereRaw('LOWER(titulo) LIKE ?', [patron]).orWhereRaw('LOWER(mensaje) LIKE ?', [patron])
      );
    }
    const [{ total }] = await base.clone().count({ total: '*' });
    const tamano = Math.min(Math.max(Number(limite) || 30, 1), 100);
    const salto = (Math.max(Number(pagina) || 1, 1) - 1) * tamano;
    const filas = await base
      .clone()
      .orderBy('fecha', 'desc')
      .limit(tamano)
      .offset(salto);
    return {
      notificaciones: filas.map((f) => this.#desdeNotificacionHistorial(f)),
      total: Number(total) || 0,
      pagina: Math.max(Number(pagina) || 1, 1),
      limite: tamano
    };
  }

  async archivarNotificacion(id) {
    await this.knex('notificaciones').where({ id }).update({ archivada_en: new Date() });
    const fila = await this.knex('notificaciones').where({ id }).first();
    return fila ? this.#desdeNotificacionHistorial(fila) : null;
  }

  async restaurarNotificacion(id) {
    await this.knex('notificaciones').where({ id }).update({ archivada_en: null });
    const fila = await this.knex('notificaciones').where({ id }).first();
    return fila ? this.#desdeNotificacionHistorial(fila) : null;
  }

  async archivarNotificaciones(userKey) {
    return this.knex('notificaciones')
      .where((q) => q.whereNull('para_usuario').orWhere('para_usuario', userKey))
      .whereNull('archivada_en')
      .whereNull('eliminada_en')
      .update({ archivada_en: new Date() });
  }

  /* ------------------------------- folios --------------------------------- */

  async incidenciaPorFolio(folio) {
    const fila = await this.knex('incidencias')
      .whereRaw('UPPER(folio) = ?', [String(folio || '').trim().toUpperCase()])
      .first();
    if (!fila) return null;
    const [incidencia] = await this.#hidratar([fila]);
    return incidencia || null;
  }

  /* ------------------------------ respaldos -------------------------------- */

  #desdeRespaldo(fila) {
    return {
      id: fila.id,
      nombre: fila.nombre,
      tipo: fila.tipo,
      formato: fila.formato,
      archivo: fila.archivo,
      tamano: Number(fila.tamano) || 0,
      hash: fila.hash || null,
      estado: fila.estado,
      error: fila.error || '',
      incluyeSimulados: Boolean(fila.incluye_simulados),
      creadoPor: fila.creado_por || null,
      creadoEn: desdeFecha(fila.creado_en),
      restauradoEn: desdeFecha(fila.restaurado_en),
      notas: fila.notas || ''
    };
  }

  async crearRespaldo(respaldo) {
    await this.knex('respaldos').insert({
      id: respaldo.id,
      nombre: respaldo.nombre,
      tipo: respaldo.tipo || 'manual',
      formato: respaldo.formato || 'json',
      archivo: respaldo.archivo,
      tamano: Number(respaldo.tamano) || 0,
      hash: respaldo.hash ?? null,
      estado: respaldo.estado || 'generando',
      error: respaldo.error ?? null,
      incluye_simulados: respaldo.incluyeSimulados === true,
      creado_por: respaldo.creadoPor ?? null,
      creado_en: aFecha(respaldo.creadoEn) || new Date(),
      restaurado_en: aFecha(respaldo.restauradoEn),
      notas: respaldo.notas ?? null
    });
    return respaldo;
  }

  async respaldos({ texto = '', tipo = null, estado = null, desde = null, hasta = null, pagina = 1, limite = 30 } = {}) {
    const base = this.knex('respaldos').select('*');
    if (tipo) base.where('tipo', tipo);
    if (estado) base.where('estado', estado);
    if (desde) base.andWhere('creado_en', '>=', aFecha(desde));
    if (hasta) base.andWhere('creado_en', '<=', aFecha(hasta));
    const busqueda = String(texto || '').trim();
    if (busqueda) {
      const patron = `%${busqueda.toLowerCase()}%`;
      base.andWhere((q) =>
        q
          .whereRaw('LOWER(nombre) LIKE ?', [patron])
          .orWhereRaw('LOWER(archivo) LIKE ?', [patron])
          .orWhereRaw('LOWER(notas) LIKE ?', [patron])
      );
    }
    const [{ total }] = await base.clone().count({ total: '*' });
    const tamano = Math.min(Math.max(Number(limite) || 30, 1), 100);
    const salto = (Math.max(Number(pagina) || 1, 1) - 1) * tamano;
    const filas = await base
      .clone()
      .orderBy('creado_en', 'desc')
      .limit(tamano)
      .offset(salto);
    return {
      respaldos: filas.map((f) => this.#desdeRespaldo(f)),
      total: Number(total) || 0,
      pagina: Math.max(Number(pagina) || 1, 1),
      limite: tamano
    };
  }

  async respaldoPorId(id) {
    const fila = await this.knex('respaldos').where({ id }).first();
    return fila ? this.#desdeRespaldo(fila) : null;
  }

  async actualizarRespaldo(id, cambios = {}) {
    const fila = {};
    if ('nombre' in cambios) fila.nombre = cambios.nombre;
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('error' in cambios) fila.error = cambios.error ?? null;
    if ('tamano' in cambios) fila.tamano = Number(cambios.tamano) || 0;
    if ('hash' in cambios) fila.hash = cambios.hash ?? null;
    if ('restauradoEn' in cambios) fila.restaurado_en = aFecha(cambios.restauradoEn);
    if ('notas' in cambios) fila.notas = cambios.notas ?? null;
    if (Object.keys(fila).length) {
      await this.knex('respaldos').where({ id }).update(fila);
    }
    return this.respaldoPorId(id);
  }

  async crearEventoRespaldo(evento) {
    await this.knex('respaldos_eventos').insert({
      id: evento.id,
      respaldo_id: evento.respaldoId,
      tipo: evento.tipo,
      actor: evento.actor ?? null,
      detalle: evento.detalle ?? null,
      creado_en: aFecha(evento.creadoEn) || new Date()
    });
    return evento;
  }

  async eventosRespaldo(respaldoId) {
    const filas = await this.knex('respaldos_eventos')
      .where({ respaldo_id: respaldoId })
      .orderBy('creado_en', 'desc');
    return filas.map((f) => ({
      id: f.id,
      respaldoId: f.respaldo_id,
      tipo: f.tipo,
      actor: f.actor || null,
      detalle: f.detalle || '',
      creadoEn: desdeFecha(f.creado_en)
    }));
  }

  /* ------------------------------ publicidad ------------------------------- */

  #jsonPublicacion(valor) {
    if (!valor) return null;
    if (typeof valor === 'object') return valor;
    try {
      return JSON.parse(valor);
    } catch {
      return null;
    }
  }

  #desdePublicacion(fila) {
    return {
      id: fila.id,
      red: fila.red,
      plantilla: fila.plantilla,
      municipioId: fila.municipio_id || null,
      titulo: fila.titulo,
      texto: fila.texto,
      hashtags: fila.hashtags || '',
      enlace: fila.enlace || null,
      imagenUrl: fila.imagen_url || null,
      qrUrl: fila.qr_url || null,
      formato: fila.formato || 'cuadrado',
      ancho: fila.ancho || null,
      alto: fila.alto || null,
      diseno: fila.diseno || null,
      fuente: fila.fuente || null,
      kicker: fila.kicker || '',
      pie: fila.pie || '',
      mostrarQr: fila.mostrar_qr !== 0,
      qrConfig: this.#jsonPublicacion(fila.qr_config),
      qrCodigo: fila.qr_codigo || null,
      layout: this.#jsonPublicacion(fila.layout),
      miniaturaUrl: fila.miniatura_url || null,
      publicadoEn: desdeFecha(fila.publicado_en),
      colorPrimario: fila.color_primario || '#006657',
      colorSecundario: fila.color_secundario || '#0f3d3a',
      estructura: fila.estructura || null,
      cta: fila.cta || '',
      cuerpo: fila.cuerpo || fila.texto || '',
      estado: fila.estado,
      creadoPor: fila.creado_por || null,
      creadoEn: desdeFecha(fila.creado_en),
      actualizadoEn: desdeFecha(fila.actualizado_en),
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  async crearPublicacionRed(publicacion) {
    await this.knex('publicaciones_redes').insert({
      id: publicacion.id,
      red: publicacion.red,
      plantilla: publicacion.plantilla || 'general',
      municipio_id: publicacion.municipioId ?? null,
      titulo: publicacion.titulo,
      texto: publicacion.texto,
      hashtags: publicacion.hashtags ?? null,
      enlace: publicacion.enlace ?? null,
      imagen_url: publicacion.imagenUrl ?? null,
      qr_url: publicacion.qrUrl ?? null,
      formato: publicacion.formato ?? 'cuadrado',
      ancho: publicacion.ancho ?? null,
      alto: publicacion.alto ?? null,
      diseno: publicacion.diseno ?? null,
      fuente: publicacion.fuente ?? null,
      kicker: publicacion.kicker ?? null,
      pie: publicacion.pie ?? null,
      mostrar_qr: publicacion.mostrarQr !== false,
      qr_config: publicacion.qrConfig ? JSON.stringify(publicacion.qrConfig) : null,
      qr_codigo: publicacion.qrCodigo ?? publicacion.id ?? null,
      layout: publicacion.layout ? JSON.stringify(publicacion.layout) : null,
      miniatura_url: publicacion.miniaturaUrl ?? null,
      publicado_en: aFecha(publicacion.publicadoEn) || null,
      color_primario: publicacion.colorPrimario || '#006657',
      color_secundario: publicacion.colorSecundario || '#0f3d3a',
      estructura: publicacion.estructura ?? null,
      cta: publicacion.cta ?? null,
      cuerpo: publicacion.cuerpo ?? null,
      estado: publicacion.estado || 'borrador',
      creado_por: publicacion.creadoPor ?? null,
      creado_en: aFecha(publicacion.creadoEn) || new Date(),
      actualizado_en: aFecha(publicacion.actualizadoEn) || null,
      simulado: publicacion.simulado === true,
      simulacion_id: publicacion.simulacionId ?? null
    });
    return publicacion;
  }

  async publicacionesRed({
    red = null,
    municipioId = null,
    estado = null,
    texto = '',
    pagina = 1,
    limite = 30
  } = {}) {
    const base = this.knex('publicaciones_redes').select('*');
    if (red) base.where('red', red);
    if (municipioId) base.where('municipio_id', municipioId);
    if (estado) base.where('estado', estado);
    const busqueda = String(texto || '').trim();
    if (busqueda) {
      const patron = `%${busqueda.toLowerCase()}%`;
      base.andWhere((q) =>
        q
          .whereRaw('LOWER(titulo) LIKE ?', [patron])
          .orWhereRaw('LOWER(texto) LIKE ?', [patron])
          .orWhereRaw('LOWER(hashtags) LIKE ?', [patron])
      );
    }
    const [{ total }] = await base.clone().count({ total: '*' });
    const tamano = Math.min(Math.max(Number(limite) || 30, 1), 100);
    const salto = (Math.max(Number(pagina) || 1, 1) - 1) * tamano;
    const filas = await base
      .clone()
      .orderBy('creado_en', 'desc')
      .limit(tamano)
      .offset(salto);
    return {
      publicaciones: filas.map((f) => this.#desdePublicacion(f)),
      total: Number(total) || 0,
      pagina: Math.max(Number(pagina) || 1, 1),
      limite: tamano
    };
  }

  async publicacionRedPorId(id) {
    const fila = await this.knex('publicaciones_redes').where({ id }).first();
    return fila ? this.#desdePublicacion(fila) : null;
  }

  async actualizarPublicacionRed(id, cambios = {}) {
    const fila = {};
    if ('red' in cambios) fila.red = cambios.red;
    if ('plantilla' in cambios) fila.plantilla = cambios.plantilla;
    if ('municipioId' in cambios) fila.municipio_id = cambios.municipioId ?? null;
    if ('titulo' in cambios) fila.titulo = cambios.titulo;
    if ('texto' in cambios) fila.texto = cambios.texto;
    if ('hashtags' in cambios) fila.hashtags = cambios.hashtags ?? null;
    if ('enlace' in cambios) fila.enlace = cambios.enlace ?? null;
    if ('imagenUrl' in cambios) fila.imagen_url = cambios.imagenUrl ?? null;
    if ('qrUrl' in cambios) fila.qr_url = cambios.qrUrl ?? null;
    if ('formato' in cambios) fila.formato = cambios.formato ?? null;
    if ('ancho' in cambios) fila.ancho = cambios.ancho ?? null;
    if ('alto' in cambios) fila.alto = cambios.alto ?? null;
    if ('diseno' in cambios) fila.diseno = cambios.diseno ?? null;
    if ('fuente' in cambios) fila.fuente = cambios.fuente ?? null;
    if ('kicker' in cambios) fila.kicker = cambios.kicker ?? null;
    if ('pie' in cambios) fila.pie = cambios.pie ?? null;
    if ('mostrarQr' in cambios) fila.mostrar_qr = cambios.mostrarQr !== false;
    if ('qrConfig' in cambios) {
      fila.qr_config = cambios.qrConfig ? JSON.stringify(cambios.qrConfig) : null;
    }
    if ('qrCodigo' in cambios) fila.qr_codigo = cambios.qrCodigo ?? null;
    if ('layout' in cambios) {
      fila.layout = cambios.layout ? JSON.stringify(cambios.layout) : null;
    }
    if ('miniaturaUrl' in cambios) fila.miniatura_url = cambios.miniaturaUrl ?? null;
    if ('publicadoEn' in cambios) fila.publicado_en = aFecha(cambios.publicadoEn);
    if ('colorPrimario' in cambios) fila.color_primario = cambios.colorPrimario || null;
    if ('colorSecundario' in cambios) fila.color_secundario = cambios.colorSecundario || null;
    if ('estructura' in cambios) fila.estructura = cambios.estructura ?? null;
    if ('cta' in cambios) fila.cta = cambios.cta ?? null;
    if ('cuerpo' in cambios) fila.cuerpo = cambios.cuerpo ?? null;
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('actualizadoEn' in cambios) fila.actualizado_en = aFecha(cambios.actualizadoEn);
    if (Object.keys(fila).length) {
      await this.knex('publicaciones_redes').where({ id }).update(fila);
    }
    return this.publicacionRedPorId(id);
  }

  async eliminarPublicacionRed(id) {
    return (await this.knex('publicaciones_redes').where({ id }).del()) > 0;
  }

  /* ------------------------------ códigos QR ------------------------------- */

  #desdeCodigoQr(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      codigo: fila.codigo,
      tipo: fila.tipo,
      contenido: fila.contenido || '',
      destino: fila.destino || null,
      publicacionId: fila.publicacion_id || null,
      activo: Boolean(fila.activo),
      creadoPor: fila.creado_por || null,
      creadoEn: desdeFecha(fila.creado_en),
      actualizadoEn: desdeFecha(fila.actualizado_en),
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  #desdeEscaneoQr(fila) {
    return {
      id: fila.id,
      codigoId: fila.codigo_id || null,
      codigo: fila.codigo,
      publicacionId: fila.publicacion_id || null,
      escaneadoEn: desdeFecha(fila.escaneado_en),
      municipioId: fila.municipio_id || null,
      precisionM: fila.precision_m === null ? null : Number(fila.precision_m),
      userKey: fila.user_key || null,
      ipHash: fila.ip_hash || null,
      userAgent: fila.user_agent || null,
      origen: fila.origen,
      ubicacionResuelta: Boolean(fila.ubicacion_resuelta),
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  async crearCodigoQr(codigo) {
    await this.knex('codigos_qr').insert({
      id: codigo.id,
      codigo: codigo.codigo,
      tipo: codigo.tipo || 'sistema',
      contenido: codigo.contenido ?? null,
      destino: codigo.destino ?? null,
      publicacion_id: codigo.publicacionId ?? null,
      activo: codigo.activo !== false,
      creado_por: codigo.creadoPor ?? null,
      creado_en: aFecha(codigo.creadoEn) || new Date(),
      actualizado_en: aFecha(codigo.actualizadoEn) || null,
      simulado: codigo.simulado === true,
      simulacion_id: codigo.simulacionId ?? null
    });
    return codigo;
  }

  async codigoQrPorCodigo(codigo) {
    const fila = await this.knex('codigos_qr').where({ codigo }).first();
    return this.#desdeCodigoQr(fila);
  }

  async codigoQrPorPublicacion(publicacionId) {
    const fila = await this.knex('codigos_qr').where({ publicacion_id: publicacionId }).first();
    return this.#desdeCodigoQr(fila);
  }

  async actualizarCodigoQr(id, cambios = {}) {
    const fila = {};
    if ('activo' in cambios) fila.activo = cambios.activo !== false;
    if ('destino' in cambios) fila.destino = cambios.destino ?? null;
    if ('contenido' in cambios) fila.contenido = cambios.contenido ?? null;
    if ('publicacionId' in cambios) fila.publicacion_id = cambios.publicacionId ?? null;
    if ('actualizadoEn' in cambios) fila.actualizado_en = aFecha(cambios.actualizadoEn);
    if (Object.keys(fila).length) await this.knex('codigos_qr').where({ id }).update(fila);
    const actualizado = await this.knex('codigos_qr').where({ id }).first();
    return this.#desdeCodigoQr(actualizado);
  }

  async registrarEscaneoQr(escaneo) {
    await this.knex('qr_escaneos').insert({
      id: escaneo.id,
      codigo_id: escaneo.codigoId ?? null,
      codigo: escaneo.codigo,
      publicacion_id: escaneo.publicacionId ?? null,
      escaneado_en: aFecha(escaneo.escaneadoEn) || new Date(),
      municipio_id: escaneo.municipioId ?? null,
      precision_m: escaneo.precisionM ?? null,
      user_key: escaneo.userKey ?? null,
      ip_hash: escaneo.ipHash ?? null,
      user_agent: escaneo.userAgent ?? null,
      origen: escaneo.origen || 'qr',
      ubicacion_resuelta: escaneo.ubicacionResuelta === true,
      simulado: escaneo.simulado === true,
      simulacion_id: escaneo.simulacionId ?? null
    });
    return escaneo;
  }

  async escaneosQr({ publicacionId = null, codigo = null, desde = null, hasta = null } = {}) {
    const consulta = this.knex('qr_escaneos').select('*');
    if (publicacionId) consulta.where('publicacion_id', publicacionId);
    if (codigo) consulta.where('codigo', codigo);
    if (desde) consulta.where('escaneado_en', '>=', aFecha(desde));
    if (hasta) consulta.where('escaneado_en', '<=', aFecha(hasta));
    const filas = await consulta.orderBy('escaneado_en', 'desc');
    return filas.map((fila) => this.#desdeEscaneoQr(fila));
  }

  async escaneoQrReciente({ codigo, userKey = null, ventanaMs = 30 * 60 * 1000 }) {
    const limite = new Date(Date.now() - ventanaMs);
    const consulta = this.knex('qr_escaneos').where({ codigo }).andWhere('escaneado_en', '>=', limite);
    if (userKey) consulta.andWhere({ user_key: userKey });
    const fila = await consulta.first();
    return fila ? this.#desdeEscaneoQr(fila) : null;
  }

  /* ----------------------- correos institucionales -------------------------- */

  #desdeCorreoInstitucional(fila) {
    return {
      id: fila.id,
      estado: fila.estado,
      municipioId: fila.municipio_id || null,
      entidad: fila.entidad || '',
      dependencia: fila.dependencia || '',
      cargo: fila.cargo || '',
      correo: fila.correo,
      telefono: fila.telefono || '',
      fuenteUrl: fila.fuente_url || '',
      verificado: Boolean(fila.verificado),
      notas: fila.notas || '',
      invitadoEn: desdeFecha(fila.invitado_en),
      ultimaInvitacionEn: desdeFecha(fila.ultima_invitacion_en),
      creadoPor: fila.creado_por || null,
      actualizadoEn: desdeFecha(fila.actualizado_en),
      simulado: Boolean(fila.simulado),
      simulacionId: fila.simulacion_id || null
    };
  }

  async crearCorreoInstitucional(correo) {
    await this.knex('correos_institucionales').insert({
      id: correo.id,
      estado: correo.estado,
      municipio_id: correo.municipioId ?? null,
      entidad: correo.entidad || correo.estado,
      dependencia: correo.dependencia ?? null,
      cargo: correo.cargo ?? null,
      correo: correo.correo,
      telefono: correo.telefono ?? null,
      fuente_url: correo.fuenteUrl ?? null,
      verificado: correo.verificado === true,
      notas: correo.notas ?? null,
      invitado_en: aFecha(correo.invitadoEn),
      ultima_invitacion_en: aFecha(correo.ultimaInvitacionEn),
      creado_por: correo.creadoPor ?? null,
      actualizado_en: aFecha(correo.actualizadoEn) || new Date(),
      simulado: correo.simulado === true,
      simulacion_id: correo.simulacionId ?? null
    });
    return correo;
  }

  async correosInstitucionales({
    estado = null,
    municipioId = null,
    verificado = null,
    texto = '',
    pagina = 1,
    limite = 50
  } = {}) {
    const base = this.knex('correos_institucionales').select('*');
    if (estado) base.where('estado', estado);
    if (municipioId) base.where('municipio_id', municipioId);
    if (verificado !== null && verificado !== undefined) base.where('verificado', verificado);
    const busqueda = String(texto || '').trim();
    if (busqueda) {
      const patron = `%${busqueda.toLowerCase()}%`;
      base.andWhere((q) =>
        q
          .whereRaw('LOWER(correo) LIKE ?', [patron])
          .orWhereRaw('LOWER(estado) LIKE ?', [patron])
          .orWhereRaw('LOWER(dependencia) LIKE ?', [patron])
          .orWhereRaw('LOWER(cargo) LIKE ?', [patron])
      );
    }
    const [{ total }] = await base.clone().count({ total: '*' });
    const tamano = Math.min(Math.max(Number(limite) || 50, 1), 200);
    const salto = (Math.max(Number(pagina) || 1, 1) - 1) * tamano;
    const filas = await base
      .clone()
      .orderBy('actualizado_en', 'desc')
      .limit(tamano)
      .offset(salto);
    return {
      correos: filas.map((f) => this.#desdeCorreoInstitucional(f)),
      total: Number(total) || 0,
      pagina: Math.max(Number(pagina) || 1, 1),
      limite: tamano
    };
  }

  async correoInstitucionalPorId(id) {
    const fila = await this.knex('correos_institucionales').where({ id }).first();
    return fila ? this.#desdeCorreoInstitucional(fila) : null;
  }

  async actualizarCorreoInstitucional(id, cambios = {}) {
    const fila = {};
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('municipioId' in cambios) fila.municipio_id = cambios.municipioId ?? null;
    if ('entidad' in cambios) fila.entidad = cambios.entidad || '';
    if ('dependencia' in cambios) fila.dependencia = cambios.dependencia ?? null;
    if ('cargo' in cambios) fila.cargo = cambios.cargo ?? null;
    if ('correo' in cambios) fila.correo = cambios.correo;
    if ('telefono' in cambios) fila.telefono = cambios.telefono ?? null;
    if ('fuenteUrl' in cambios) fila.fuente_url = cambios.fuenteUrl ?? null;
    if ('verificado' in cambios) fila.verificado = cambios.verificado === true;
    if ('notas' in cambios) fila.notas = cambios.notas ?? null;
    if ('invitadoEn' in cambios) fila.invitado_en = aFecha(cambios.invitadoEn);
    if ('ultimaInvitacionEn' in cambios) fila.ultima_invitacion_en = aFecha(cambios.ultimaInvitacionEn);
    if ('simulado' in cambios) fila.simulado = cambios.simulado === true;
    if ('simulacionId' in cambios) fila.simulacion_id = cambios.simulacionId ?? null;
    fila.actualizado_en = new Date();
    await this.knex('correos_institucionales').where({ id }).update(fila);
    return this.correoInstitucionalPorId(id);
  }

  async eliminarCorreoInstitucional(id) {
    return (await this.knex('correos_institucionales').where({ id }).del()) > 0;
  }

  /* ------------------------------- simulador -------------------------------- */

  #desdeSesionSimulacion(fila) {
    return {
      id: fila.id,
      adminId: fila.admin_id,
      rolSimulado: fila.rol_simulado,
      estado: fila.estado,
      creadaEn: desdeFecha(fila.creada_en),
      cerradaEn: desdeFecha(fila.cerrada_en),
      revertidaEn: desdeFecha(fila.revertida_en),
      notas: fila.notas || '',
      municipioId: fila.municipio_id || null,
      usuarioSimulado: fila.usuario_simulado || null,
      usuarioIncidencia: fila.usuario_incidencia || null,
      incidenciaSimuladaId: fila.incidencia_simulada_id || null,
      datos: (() => {
        try {
          return fila.datos ? JSON.parse(fila.datos) : {};
        } catch {
          return {};
        }
      })()
    };
  }

  async crearSesionSimulacion(sesion) {
    await this.knex('simulacion_sesiones').insert({
      id: sesion.id,
      admin_id: sesion.adminId,
      rol_simulado: sesion.rolSimulado,
      estado: sesion.estado || 'abierta',
      creada_en: aFecha(sesion.creadaEn) || new Date(),
      cerrada_en: aFecha(sesion.cerradaEn),
      revertida_en: aFecha(sesion.revertidaEn),
      notas: sesion.notas ?? null,
      municipio_id: sesion.municipioId ?? null,
      usuario_simulado: sesion.usuarioSimulado ?? null,
      usuario_incidencia: sesion.usuarioIncidencia ?? null,
      incidencia_simulada_id: sesion.incidenciaSimuladaId ?? null,
      datos: sesion.datos ? JSON.stringify(sesion.datos) : null
    });
    return sesion;
  }

  async sesionesSimulacion({ adminId = null, estado = null, limite = 30 } = {}) {
    const base = this.knex('simulacion_sesiones').select('*');
    if (adminId) base.where('admin_id', adminId);
    if (estado) base.where('estado', estado);
    const filas = await base
      .orderBy('creada_en', 'desc')
      .limit(Math.min(Number(limite) || 30, 100));
    return filas.map((f) => this.#desdeSesionSimulacion(f));
  }

  async sesionSimulacionPorId(id) {
    const fila = await this.knex('simulacion_sesiones').where({ id }).first();
    return fila ? this.#desdeSesionSimulacion(fila) : null;
  }

  async actualizarSesionSimulacion(id, cambios = {}) {
    const fila = {};
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('cerradaEn' in cambios) fila.cerrada_en = aFecha(cambios.cerradaEn);
    if ('revertidaEn' in cambios) fila.revertida_en = aFecha(cambios.revertidaEn);
    if ('notas' in cambios) fila.notas = cambios.notas ?? null;
    if ('municipioId' in cambios) fila.municipio_id = cambios.municipioId ?? null;
    if ('usuarioSimulado' in cambios) fila.usuario_simulado = cambios.usuarioSimulado ?? null;
    if ('usuarioIncidencia' in cambios) fila.usuario_incidencia = cambios.usuarioIncidencia ?? null;
    if ('incidenciaSimuladaId' in cambios) {
      fila.incidencia_simulada_id = cambios.incidenciaSimuladaId ?? null;
    }
    if ('datos' in cambios) fila.datos = cambios.datos ? JSON.stringify(cambios.datos) : null;
    if (Object.keys(fila).length) {
      await this.knex('simulacion_sesiones').where({ id }).update(fila);
    }
    return this.sesionSimulacionPorId(id);
  }

  #desdeOperacionSimulacion(fila) {
    const parsear = (valor) => {
      if (!valor) return null;
      try {
        return JSON.parse(valor);
      } catch {
        return null;
      }
    };
    return {
      id: fila.id,
      sesionId: fila.sesion_id,
      orden: Number(fila.orden) || 0,
      accionId: fila.accion_id || null,
      entidadTipo: fila.entidad_tipo,
      entidadId: fila.entidad_id || null,
      operacion: fila.operacion,
      antes: parsear(fila.antes),
      despues: parsear(fila.despues),
      endpoint: fila.endpoint || null,
      resultado: parsear(fila.resultado),
      creadoEn: desdeFecha(fila.creado_en)
    };
  }

  async crearOperacionSimulacion(operacion) {
    await this.knex('simulacion_operaciones').insert({
      id: operacion.id,
      sesion_id: operacion.sesionId,
      orden: Number(operacion.orden) || 1,
      accion_id: operacion.accionId ?? null,
      entidad_tipo: operacion.entidadTipo,
      entidad_id: operacion.entidadId ?? null,
      operacion: operacion.operacion,
      antes: operacion.antes ? JSON.stringify(operacion.antes) : null,
      despues: operacion.despues ? JSON.stringify(operacion.despues) : null,
      endpoint: operacion.endpoint ?? null,
      resultado: operacion.resultado ? JSON.stringify(operacion.resultado) : null,
      creado_en: aFecha(operacion.creadoEn) || new Date()
    });
    return operacion;
  }

  async operacionesSimulacion(sesionId) {
    const filas = await this.knex('simulacion_operaciones')
      .where({ sesion_id: sesionId })
      .orderBy('orden', 'asc');
    return filas.map((f) => this.#desdeOperacionSimulacion(f));
  }

  async limpiarOperacionesSimulacion(sesionId) {
    return this.knex('simulacion_operaciones').where({ sesion_id: sesionId }).del();
  }

  /* ---------------------- fichas de información municipal ------------------ */

  #aFicha(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      municipioId: fila.municipio_id,
      sitioWeb: fila.sitio_web || '',
      telefono: fila.telefono || '',
      correo: fila.correo || '',
      direccion: fila.direccion || '',
      horario: fila.horario || '',
      notas: fila.notas || '',
      estado: fila.estado,
      propuestoPor: fila.propuesto_por || null,
      aprobadoPor: fila.aprobado_por || null,
      motivoRechazo: fila.motivo_rechazo || '',
      creadoEn: desdeFecha(fila.creado_en),
      actualizadoEn: desdeFecha(fila.actualizado_en)
    };
  }

  async fichaMunicipio(municipioId) {
    const fila = await this.knex('municipios_informacion')
      .where({ municipio_id: String(municipioId) })
      .first();
    return this.#aFicha(fila);
  }

  async fichasMunicipios() {
    const filas = await this.knex('municipios_informacion').select('*');
    return filas.map((f) => this.#aFicha(f));
  }

  async guardarFichaMunicipio(ficha) {
    const existente = await this.fichaMunicipio(ficha.municipioId);
    const fila = {
      municipio_id: String(ficha.municipioId),
      sitio_web: ficha.sitioWeb || null,
      telefono: ficha.telefono || null,
      correo: ficha.correo || null,
      direccion: ficha.direccion || null,
      horario: ficha.horario || null,
      notas: ficha.notas || null,
      estado: ficha.estado || 'borrador',
      propuesto_por: ficha.propuestoPor || null,
      aprobado_por: ficha.aprobadoPor || null,
      motivo_rechazo: ficha.motivoRechazo || null,
      actualizado_en: aFecha(ficha.actualizadoEn) || new Date()
    };
    if (existente) {
      await this.knex('municipios_informacion').where({ id: existente.id }).update(fila);
      return this.fichaMunicipio(ficha.municipioId);
    }
    await this.knex('municipios_informacion').insert({
      id: ficha.id,
      ...fila,
      creado_en: aFecha(ficha.creadoEn) || new Date()
    });
    return this.fichaMunicipio(ficha.municipioId);
  }

  async actualizarFichaMunicipio(id, cambios = {}) {
    const fila = {};
    const mapa = {
      sitioWeb: 'sitio_web',
      telefono: 'telefono',
      correo: 'correo',
      direccion: 'direccion',
      horario: 'horario',
      notas: 'notas',
      estado: 'estado',
      propuestoPor: 'propuesto_por',
      aprobadoPor: 'aprobado_por',
      motivoRechazo: 'motivo_rechazo'
    };
    for (const [campo, columna] of Object.entries(mapa)) {
      if (campo in cambios) fila[columna] = cambios[campo] ?? null;
    }
    if ('actualizadoEn' in cambios) fila.actualizado_en = aFecha(cambios.actualizadoEn);
    if (Object.keys(fila).length) {
      await this.knex('municipios_informacion').where({ id }).update(fila);
    }
    const actual = await this.knex('municipios_informacion').where({ id }).first();
    return this.#aFicha(actual);
  }

  /* ----------------------------- roles especiales -------------------------- */

  #aRolPersonalizado(fila) {
    if (!fila) return null;
    let permisos = [];
    try {
      const valor = fila.permisos ? JSON.parse(fila.permisos) : [];
      permisos = Array.isArray(valor) ? valor : [];
    } catch {
      permisos = [];
    }
    return {
      id: fila.id,
      nombre: fila.nombre,
      descripcion: fila.descripcion || '',
      rolBase: fila.rol_base || 'funcionario',
      permisos,
      activo: Boolean(fila.activo),
      creadoPor: fila.creado_por || null,
      creadoEn: desdeFecha(fila.creado_en),
      actualizadoEn: desdeFecha(fila.actualizado_en)
    };
  }

  async rolesPersonalizados() {
    const filas = await this.knex('roles_personalizados').orderBy('nombre', 'asc');
    return filas.map((f) => this.#aRolPersonalizado(f));
  }

  async rolPersonalizadoPorId(id) {
    const fila = await this.knex('roles_personalizados').where({ id }).first();
    return this.#aRolPersonalizado(fila);
  }

  async crearRolPersonalizado(rol) {
    await this.knex('roles_personalizados').insert({
      id: rol.id,
      nombre: rol.nombre,
      descripcion: rol.descripcion || null,
      rol_base: rol.rolBase || 'funcionario',
      permisos: JSON.stringify(rol.permisos || []),
      activo: rol.activo !== false,
      creado_por: rol.creadoPor || null,
      creado_en: aFecha(rol.creadoEn) || new Date(),
      actualizado_en: aFecha(rol.actualizadoEn) || new Date()
    });
    return rol;
  }

  async actualizarRolPersonalizado(id, cambios = {}) {
    const fila = {};
    if ('nombre' in cambios) fila.nombre = cambios.nombre;
    if ('descripcion' in cambios) fila.descripcion = cambios.descripcion ?? null;
    if ('rolBase' in cambios) fila.rol_base = cambios.rolBase;
    if ('permisos' in cambios) fila.permisos = JSON.stringify(cambios.permisos || []);
    if ('activo' in cambios) fila.activo = cambios.activo !== false;
    if ('actualizadoEn' in cambios) fila.actualizado_en = aFecha(cambios.actualizadoEn);
    if (Object.keys(fila).length) {
      await this.knex('roles_personalizados').where({ id }).update(fila);
    }
    return this.rolPersonalizadoPorId(id);
  }

  async eliminarRolPersonalizado(id) {
    await this.knex('usuarios').where({ rol_personalizado_id: id }).update({ rol_personalizado_id: null });
    return (await this.knex('roles_personalizados').where({ id }).del()) > 0;
  }

  /* -------------------------- solicitudes de permisos ---------------------- */

  #aSolicitudPermiso(fila) {
    if (!fila) return null;
    let permisos = [];
    try {
      const valor = fila.permisos ? JSON.parse(fila.permisos) : [];
      permisos = Array.isArray(valor) ? valor : [];
    } catch {
      permisos = [];
    }
    let estados = [];
    try {
      const valor = fila.estados ? JSON.parse(fila.estados) : [];
      estados = Array.isArray(valor) ? valor : [];
    } catch {
      estados = [];
    }
    return {
      id: fila.id,
      usuarioId: fila.usuario_id,
      username: fila.username,
      nombre: fila.nombre || '',
      municipioId: fila.municipio_id || null,
      estados,
      permisos,
      motivo: fila.motivo,
      estado: fila.estado,
      resueltoPor: fila.resuelto_por || null,
      resueltoEn: desdeFecha(fila.resuelto_en),
      respuesta: fila.respuesta || '',
      creadoEn: desdeFecha(fila.creado_en)
    };
  }

  async crearSolicitudPermiso(solicitud) {
    await this.knex('solicitudes_permisos').insert({
      id: solicitud.id,
      usuario_id: solicitud.usuarioId,
      username: solicitud.username,
      nombre: solicitud.nombre || null,
      municipio_id: solicitud.municipioId || null,
      estados: JSON.stringify(solicitud.estados || []),
      permisos: JSON.stringify(solicitud.permisos || []),
      motivo: solicitud.motivo,
      estado: solicitud.estado || 'pendiente',
      resuelto_por: solicitud.resueltoPor || null,
      resuelto_en: aFecha(solicitud.resueltoEn),
      respuesta: solicitud.respuesta || null,
      creado_en: aFecha(solicitud.creadoEn) || new Date()
    });
    return solicitud;
  }

  async solicitudesPermiso({ usuarioId = null, estado = null, limite = 100 } = {}) {
    const consulta = this.knex('solicitudes_permisos').select('*');
    if (usuarioId) consulta.where('usuario_id', usuarioId);
    if (estado) consulta.where('estado', estado);
    const filas = await consulta
      .orderBy('creado_en', 'desc')
      .limit(Math.min(Number(limite) || 100, 500));
    return filas.map((f) => this.#aSolicitudPermiso(f));
  }

  async solicitudPermisoPorId(id) {
    const fila = await this.knex('solicitudes_permisos').where({ id }).first();
    return this.#aSolicitudPermiso(fila);
  }

  async actualizarSolicitudPermiso(id, cambios = {}) {
    const fila = {};
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('resueltoPor' in cambios) fila.resuelto_por = cambios.resueltoPor ?? null;
    if ('resueltoEn' in cambios) fila.resuelto_en = aFecha(cambios.resueltoEn);
    if ('respuesta' in cambios) fila.respuesta = cambios.respuesta ?? null;
    if (Object.keys(fila).length) {
      await this.knex('solicitudes_permisos').where({ id }).update(fila);
    }
    return this.solicitudPermisoPorId(id);
  }

  /* ------------------ roles integrados y roles propios -------------------- */

  #aRol(fila) {
    if (!fila) return null;
    let permisos = [];
    try {
      const valor = fila.permisos ? JSON.parse(fila.permisos) : [];
      permisos = Array.isArray(valor) ? valor : [];
    } catch {
      permisos = [];
    }
    return {
      id: fila.id,
      clave: fila.clave,
      etiqueta: fila.etiqueta,
      descripcion: fila.descripcion || '',
      tipo: fila.tipo,
      rolPlantilla: fila.rol_plantilla,
      permisos,
      territorio: fila.territorio,
      activo: Boolean(fila.activo),
      orden: Number(fila.orden) || 100,
      creadoPor: fila.creado_por || null,
      creadoEn: desdeFecha(fila.creado_en),
      actualizadoEn: desdeFecha(fila.actualizado_en)
    };
  }

  async roles() {
    const filas = await this.knex('roles').orderBy([
      { column: 'orden', order: 'asc' },
      { column: 'etiqueta', order: 'asc' }
    ]);
    return filas.map((f) => this.#aRol(f));
  }

  async rolPorId(id) {
    const fila = await this.knex('roles').where({ id }).first();
    return this.#aRol(fila);
  }

  async rolPorClave(clave) {
    const fila = await this.knex('roles').where({ clave }).first();
    return this.#aRol(fila);
  }

  async crearRol(rol) {
    await this.knex('roles').insert({
      id: rol.id,
      clave: rol.clave,
      etiqueta: rol.etiqueta,
      descripcion: rol.descripcion || null,
      tipo: rol.tipo || 'propio',
      rol_plantilla: rol.rolPlantilla,
      permisos: JSON.stringify(rol.permisos || []),
      territorio: rol.territorio || 'municipios',
      activo: rol.activo !== false,
      orden: Number(rol.orden) || 100,
      creado_por: rol.creadoPor || null,
      creado_en: aFecha(rol.creadoEn) || new Date(),
      actualizado_en: aFecha(rol.actualizadoEn) || new Date()
    });
    return rol;
  }

  async actualizarRol(id, cambios = {}) {
    const fila = {};
    if ('clave' in cambios) fila.clave = cambios.clave;
    if ('etiqueta' in cambios) fila.etiqueta = cambios.etiqueta;
    if ('descripcion' in cambios) fila.descripcion = cambios.descripcion ?? null;
    if ('rolPlantilla' in cambios) fila.rol_plantilla = cambios.rolPlantilla;
    if ('permisos' in cambios) fila.permisos = JSON.stringify(cambios.permisos || []);
    if ('territorio' in cambios) fila.territorio = cambios.territorio;
    if ('activo' in cambios) fila.activo = cambios.activo !== false;
    if ('orden' in cambios) fila.orden = Number(cambios.orden) || 100;
    if ('actualizadoEn' in cambios) fila.actualizado_en = aFecha(cambios.actualizadoEn);
    if (Object.keys(fila).length) await this.knex('roles').where({ id }).update(fila);
    return this.rolPorId(id);
  }

  async eliminarRol(id) {
    await this.knex('usuarios').where({ rol_propio_id: id }).update({ rol_propio_id: null });
    return (await this.knex('roles').where({ id }).del()) > 0;
  }

  /* ------------------ solicitudes de cambio de contraseña ------------------ */

  #aSolicitudPassword(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      usuarioId: fila.usuario_id,
      username: fila.username,
      nombre: fila.nombre || '',
      motivo: fila.motivo,
      estado: fila.estado,
      solicitadoPorId: fila.solicitado_por_id || null,
      solicitadoPor: fila.solicitado_por || null,
      resueltoPor: fila.resuelto_por || null,
      resueltoEn: desdeFecha(fila.resuelto_en),
      respuesta: fila.respuesta || '',
      creadoEn: desdeFecha(fila.creado_en)
    };
  }

  async crearSolicitudPassword(solicitud) {
    await this.knex('solicitudes_password').insert({
      id: solicitud.id,
      usuario_id: solicitud.usuarioId,
      username: solicitud.username,
      nombre: solicitud.nombre || null,
      motivo: solicitud.motivo,
      estado: solicitud.estado || 'pendiente',
      solicitado_por_id: solicitud.solicitadoPorId || null,
      solicitado_por: solicitud.solicitadoPor || null,
      resuelto_por: solicitud.resueltoPor || null,
      resuelto_en: aFecha(solicitud.resueltoEn),
      respuesta: solicitud.respuesta || null,
      creado_en: aFecha(solicitud.creadoEn) || new Date()
    });
    return solicitud;
  }

  async solicitudesPassword({ usuarioId = null, estado = null, limite = 100 } = {}) {
    const consulta = this.knex('solicitudes_password').select('*');
    if (usuarioId) consulta.where('usuario_id', usuarioId);
    if (estado) consulta.where('estado', estado);
    const filas = await consulta
      .orderBy('creado_en', 'desc')
      .limit(Math.min(Number(limite) || 100, 500));
    return filas.map((f) => this.#aSolicitudPassword(f));
  }

  async solicitudPasswordPorId(id) {
    const fila = await this.knex('solicitudes_password').where({ id }).first();
    return this.#aSolicitudPassword(fila);
  }

  async actualizarSolicitudPassword(id, cambios = {}) {
    const fila = {};
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('resueltoPor' in cambios) fila.resuelto_por = cambios.resueltoPor ?? null;
    if ('resueltoEn' in cambios) fila.resuelto_en = aFecha(cambios.resueltoEn);
    if ('respuesta' in cambios) fila.respuesta = cambios.respuesta ?? null;
    if (Object.keys(fila).length) {
      await this.knex('solicitudes_password').where({ id }).update(fila);
    }
    return this.solicitudPasswordPorId(id);
  }

  /* --------------------------- solicitudes de baja ------------------------- */

  #aSolicitudBaja(fila) {
    if (!fila) return null;
    return {
      id: fila.id,
      usuarioId: fila.usuario_id,
      username: fila.username,
      nombre: fila.nombre || '',
      solicitadoPorId: fila.solicitado_por_id || null,
      solicitadoPor: fila.solicitado_por || null,
      motivo: fila.motivo,
      estado: fila.estado,
      resueltoPor: fila.resuelto_por || null,
      resueltoEn: desdeFecha(fila.resuelto_en),
      respuesta: fila.respuesta || '',
      creadoEn: desdeFecha(fila.creado_en)
    };
  }

  async crearSolicitudBaja(solicitud) {
    await this.knex('solicitudes_baja').insert({
      id: solicitud.id,
      usuario_id: solicitud.usuarioId,
      username: solicitud.username,
      nombre: solicitud.nombre || null,
      solicitado_por_id: solicitud.solicitadoPorId || null,
      solicitado_por: solicitud.solicitadoPor || null,
      motivo: solicitud.motivo,
      estado: solicitud.estado || 'pendiente',
      resuelto_por: solicitud.resueltoPor || null,
      resuelto_en: aFecha(solicitud.resueltoEn),
      respuesta: solicitud.respuesta || null,
      creado_en: aFecha(solicitud.creadoEn) || new Date()
    });
    return solicitud;
  }

  async solicitudesBaja({ usuarioId = null, estado = null, limite = 100 } = {}) {
    const consulta = this.knex('solicitudes_baja').select('*');
    if (usuarioId) consulta.where('usuario_id', usuarioId);
    if (estado) consulta.where('estado', estado);
    const filas = await consulta
      .orderBy('creado_en', 'desc')
      .limit(Math.min(Number(limite) || 100, 500));
    return filas.map((f) => this.#aSolicitudBaja(f));
  }

  async solicitudBajaPorId(id) {
    const fila = await this.knex('solicitudes_baja').where({ id }).first();
    return this.#aSolicitudBaja(fila);
  }

  async actualizarSolicitudBaja(id, cambios = {}) {
    const fila = {};
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('resueltoPor' in cambios) fila.resuelto_por = cambios.resueltoPor ?? null;
    if ('resueltoEn' in cambios) fila.resuelto_en = aFecha(cambios.resueltoEn);
    if ('respuesta' in cambios) fila.respuesta = cambios.respuesta ?? null;
    if (Object.keys(fila).length) {
      await this.knex('solicitudes_baja').where({ id }).update(fila);
    }
    return this.solicitudBajaPorId(id);
  }

  /* ------------------------- solicitudes de alta -------------------------- */

  #aSolicitudUsuario(fila) {
    if (!fila) return null;
    let municipios = [];
    try {
      municipios = fila.municipios ? JSON.parse(fila.municipios) : [];
    } catch {
      municipios = [];
    }
    return {
      id: fila.id,
      username: fila.username,
      nombre: fila.nombre || '',
      correo: fila.correo || null,
      telefono: fila.telefono || null,
      notas: fila.notas || '',
      municipios: Array.isArray(municipios) ? municipios : [],
      estado: fila.estado,
      solicitadoPorId: fila.solicitado_por_id || null,
      solicitadoPor: fila.solicitado_por || null,
      resueltoPor: fila.resuelto_por || null,
      resueltoEn: desdeFecha(fila.resuelto_en),
      respuesta: fila.respuesta || '',
      creadoEn: desdeFecha(fila.creado_en)
    };
  }

  async crearSolicitudUsuario(solicitud) {
    await this.knex('solicitudes_usuario').insert({
      id: solicitud.id,
      username: solicitud.username,
      nombre: solicitud.nombre,
      correo: solicitud.correo || null,
      telefono: solicitud.telefono || null,
      notas: solicitud.notas || null,
      municipios: JSON.stringify(solicitud.municipios || []),
      estado: solicitud.estado || 'pendiente',
      solicitado_por_id: solicitud.solicitadoPorId || null,
      solicitado_por: solicitud.solicitadoPor || null,
      resuelto_por: solicitud.resueltoPor || null,
      resuelto_en: aFecha(solicitud.resueltoEn),
      respuesta: solicitud.respuesta || null,
      creado_en: aFecha(solicitud.creadoEn) || new Date()
    });
    return solicitud;
  }

  async solicitudesUsuario({ estado = null, limite = 100 } = {}) {
    const consulta = this.knex('solicitudes_usuario').select('*');
    if (estado) consulta.where('estado', estado);
    const filas = await consulta
      .orderBy('creado_en', 'desc')
      .limit(Math.min(Number(limite) || 100, 500));
    return filas.map((f) => this.#aSolicitudUsuario(f));
  }

  async solicitudUsuarioPorId(id) {
    const fila = await this.knex('solicitudes_usuario').where({ id }).first();
    return this.#aSolicitudUsuario(fila);
  }

  async actualizarSolicitudUsuario(id, cambios = {}) {
    const fila = {};
    if ('estado' in cambios) fila.estado = cambios.estado;
    if ('resueltoPor' in cambios) fila.resuelto_por = cambios.resueltoPor ?? null;
    if ('resueltoEn' in cambios) fila.resuelto_en = aFecha(cambios.resueltoEn);
    if ('respuesta' in cambios) fila.respuesta = cambios.respuesta ?? null;
    if (Object.keys(fila).length) {
      await this.knex('solicitudes_usuario').where({ id }).update(fila);
    }
    return this.solicitudUsuarioPorId(id);
  }
}
