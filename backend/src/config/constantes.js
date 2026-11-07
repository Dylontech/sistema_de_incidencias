/**
 * Constantes de dominio compartidas por modelos, servicios y controladores.
 *
 * Los valores de DIAS_LIMITES y los límites de archivo provienen del sistema
 * original (monolito en legacy/sistema_de_incidencias.html) para conservar
 * exactamente la misma política de negocio.
 */

/**
 * Roles del sistema.
 * - `anonimo`: sesión de navegador sin cuenta (solo puede reportar).
 * - `ciudadano`: cuenta registrada con correo (recibe avisos de sus reportes).
 * - `funcionario`: personal municipal con escritura dentro de sus municipios.
 * - `auditor`: personal de solo lectura sobre los municipios/estados asignados.
 * - `enlace_estatal`: solo lectura sobre todos los municipios de sus estados.
 * - `enlace_federal`: solo lectura sobre los municipios de sus estados asignados.
 * - `admin`: alcance global y gestión de cuentas/alcances.
 */
export const ROLES = [
  'anonimo',
  'ciudadano',
  'cuadrilla',
  'funcionario',
  'auditor',
  'enlace_estatal',
  'enlace_federal',
  'soporte',
  'admin_municipal',
  'admin_estatal',
  'admin'
];

/** Todo el personal con acceso al panel (lectura o escritura). */
export const ROLES_PERSONAL = [
  'cuadrilla',
  'funcionario',
  'auditor',
  'enlace_estatal',
  'enlace_federal',
  'soporte',
  'admin_municipal',
  'admin_estatal',
  'admin'
];

/** Cualquier nivel de administración (maestro o territorial). */
export const ROLES_ADMIN = ['admin', 'admin_estatal', 'admin_municipal'];

/** Roles que pueden abrir la cola del panel de soporte técnico. */
export const ROLES_ATENCION = ['soporte', 'admin_municipal', 'admin_estatal', 'admin'];

/** Compatibilidad: antes «empleado» era funcionario y admin. */
export const ROLES_EMPLEADO = ROLES_PERSONAL;

/** Roles de solo lectura: pueden consultar e informar, nunca mutar. */
export const ROLES_LECTURA = ['auditor', 'enlace_estatal', 'enlace_federal'];

/** Roles con escritura (siempre que `usuarios.puede_escribir` no lo revoque). */
export const ROLES_ESCRITURA = ['cuadrilla', 'funcionario', 'admin'];

/** Roles que puede crear y editar un administrador desde el panel. */
export const ROLES_PERSONAL_ASIGNABLES = ROLES_PERSONAL;

/** Roles con cuenta propia (todo menos la sesión anónima). */
export const ROLES_CUENTA = ['ciudadano', ...ROLES_PERSONAL];

/**
 * Las 32 entidades federativas de México, en orden alfabético.
 * Los nombres coinciden con los que usa el importador del INEGI y el catálogo
 * (`municipios.estado`). No confundir con `ESTADOS`, que son los estados de
 * una incidencia.
 */
export const ESTADOS_REPUBLICA = [
  'Aguascalientes',
  'Baja California',
  'Baja California Sur',
  'Campeche',
  'Coahuila',
  'Colima',
  'Chiapas',
  'Chihuahua',
  'Ciudad de México',
  'Durango',
  'Guanajuato',
  'Guerrero',
  'Hidalgo',
  'Jalisco',
  'México',
  'Michoacán',
  'Morelos',
  'Nayarit',
  'Nuevo León',
  'Oaxaca',
  'Puebla',
  'Querétaro',
  'Quintana Roo',
  'San Luis Potosí',
  'Sinaloa',
  'Sonora',
  'Tabasco',
  'Tamaulipas',
  'Tlaxcala',
  'Veracruz',
  'Yucatán',
  'Zacatecas'
];

/** Ámbitos de una incidencia: urbano o vialidad de mayor jerarquía. */
export const AMBITOS = [
  'urbano',
  'carretera_estatal',
  'carretera_federal',
  'autopista',
  'camino_rural',
  'otro'
];

export const AMBITO_INICIAL = 'urbano';

/** Etiquetas legibles de los ámbitos (viajan al frontend). */
export const ETIQUETAS_AMBITO = {
  urbano: 'Zona urbana o municipal',
  carretera_estatal: 'Carretera estatal',
  carretera_federal: 'Carretera federal',
  autopista: 'Autopista',
  camino_rural: 'Camino rural',
  otro: 'Otro tipo de vía'
};

/** Jurisdicción responsable de atender una incidencia vial. */
export const JURISDICCIONES = ['municipal', 'estatal', 'federal', 'concesionada'];

/** Tipos de vía que no exigen que el punto caiga dentro del polígono municipal. */
export const AMBITOS_VIALES = AMBITOS.filter((a) => a !== 'urbano');

/** Estados posibles de una incidencia. */
export const ESTADOS = ['reportada', 'en_proceso', 'resuelta'];

export const ESTADO_INICIAL = 'reportada';

/** Colores derivados de la antigüedad (nunca se persisten). */
export const COLORES = ['verde', 'amarillo', 'naranja', 'rojo'];

/** Regla de antigüedad: < 15 días amarillo, 15-30 naranja, > 30 rojo. */
export const DIAS_LIMITES = { amarillo: 15, naranja: 30 };

/** Orden de prioridad para el ordenamiento por color. */
export const PRIORIDAD_COLOR = { rojo: 0, naranja: 1, amarillo: 2, verde: 3 };

export const ORDENES = ['reciente', 'antigua', 'prioridad'];

/** Longitudes máximas (antes solo existían como maxlength en el HTML). */
export const LIMITES_TEXTO = {
  correo: 160,
  /** Mínimo de la contraseña de una cuenta ciudadana. */
  passwordMin: 8,
  titulo: 80,
  descripcion: 600,
  indicaciones: 400,
  nombreTipo: 60,
  comentario: 500,
  solucion: 600,
  /** Datos de la vía en reportes carreteros. */
  viaNombre: 160,
  viaClave: 40,
  tramo: 160,
  sentido: 40,
  dependencia: 160,
  /** Motivo por el que el personal marca un reporte como peligroso. */
  motivoPeligro: 140,
  /** Explicación opcional que acompaña a una denuncia ciudadana. */
  detalleDenuncia: 400,
  /** Nota con la que el moderador cierra una denuncia. */
  resolucionDenuncia: 600,
  /** Motivo por el que el personal oculta un contenido o sanciona una cuenta. */
  motivoModeracion: 200
};

/**
 * Motivos por los que se puede denunciar un contenido.
 *
 * La lista es cerrada (llega al navegador por `/api/catalogos`) para poder
 * agrupar y contar las denuncias; el detalle libre es opcional.
 */
export const MOTIVOS_DENUNCIA = [
  'spam',
  'contenido_ofensivo',
  'violencia_o_amenazas',
  'datos_personales',
  'informacion_falsa',
  'fuera_de_tema',
  'duplicado',
  'otro'
];

/** Etiquetas legibles de los motivos de denuncia (viajan al frontend). */
export const ETIQUETAS_MOTIVO_DENUNCIA = {
  spam: 'Spam o publicidad',
  contenido_ofensivo: 'Contenido ofensivo',
  violencia_o_amenazas: 'Violencia o amenazas',
  datos_personales: 'Datos personales o privacidad',
  informacion_falsa: 'Información falsa',
  fuera_de_tema: 'Fuera de tema',
  duplicado: 'Duplicado',
  otro: 'Otro motivo'
};

/** Estados del expediente de una denuncia. */
export const ESTADOS_DENUNCIA = ['pendiente', 'atendida', 'descartada'];

/** Acciones con las que el moderador puede cerrar una denuncia. */
export const ACCIONES_MODERACION = ['ocultar', 'eliminar', 'advertir', 'suspender', 'descartar'];

/**
 * Advertencias que soporta una cuenta antes de quedar bloqueada sola.
 * Al llegar a este número la cuenta se suspende de forma indefinida.
 */
export const ADVERTENCIAS_MAX = 3;

/** Tolerancia en grados para detectar reportes duplicados. */
export const PRECISION_DUPLICADO = 0.0002;

/** Tipos de notificación soportados. */
export const TIPOS_NOTIFICACION = [
  'reporte',
  'resuelta',
  'estado',
  'alerta',
  'comentario',
  'mensaje',
  'contacto',
  'sugerencia',
  'solicitud'
];

/** Modos de suscripción a incidencias nuevas. */
export const MODOS_NOTIFICACION = ['asignados', 'municipios', 'todos', 'ninguno'];

/** Canales por los que puede salir un aviso. */
export const CANALES_NOTIFICACION = ['app', 'correo', 'ambos', 'ninguno'];

/** Severidad de un aviso: decide el color y el icono en la campana. */
export const SEVERIDADES_NOTIFICACION = ['info', 'exito', 'alerta', 'error'];

/** Alcance territorial de una regla de notificación. */
export const ALCANCES_NOTIFICACION = ['todos', 'estados', 'municipios', 'asignados'];

/** Catálogo cerrado de tickets de soporte. */
export const CATEGORIAS_TICKET = ['error', 'acceso', 'datos', 'sugerencia', 'otro'];
export const PRIORIDADES_TICKET = ['baja', 'media', 'alta'];
export const ESTADOS_TICKET = ['abierto', 'en_revision', 'respondido', 'cerrado'];

/** Historial de un ticket (`ticket_eventos.tipo`). */
export const EVENTOS_TICKET = [
  'creado',
  'asignado',
  'reasignado',
  'respondido',
  'estado',
  'prioridad',
  'nota_interna',
  'reabierto'
];

/** Permisos granulares que un administrador puede ajustar por cuenta. */
export const PERMISOS = [
  'reportar',
  'editar_propios',
  'cambiar_estado',
  'resolver',
  'moderar',
  'ver_moderacion',
  'exportar',
  // Usuarios: CRUD completo. `gestionar_usuarios` se conserva como permiso
  // paraguas para no romper cuentas y roles creados antes de V2.10.
  'ver_usuarios',
  'crear_usuarios',
  'editar_usuarios',
  'eliminar_usuarios',
  'gestionar_usuarios',
  // Claves de acceso: CRUD completo.
  'ver_claves',
  'crear_claves',
  'editar_claves',
  'eliminar_claves',
  'gestionar_claves',
  // Avisos por clave: consulta y edición.
  'ver_avisos_clave',
  'editar_avisos_clave',
  'gestionar_avisos_clave',
  'ver_auditoria',
  'ver_incidencias_panel',
  // Tipos de incidencia: ver, crear y eliminar (el catálogo no edita tipos;
  // `editar_tipos` se conserva reservado para no romper permisos existentes).
  'ver_tipos',
  'crear_tipos',
  'editar_tipos',
  'eliminar_tipos',
  'gestionar_tipos',
  'ver_municipios_panel',
  'ver_zonas',
  'gestionar_zonas',
  'ver_firmas',
  'ver_monitoreo',
  'responder_tickets',
  'atender_tickets',
  'ver_reparaciones_panel',
  'coordinar_reparaciones',
  'atender_reparaciones',
  'subir_documentos_reparacion',
  'configurar_notificaciones',
  'ver_metricas',
  // Solicitudes de acceso al personal: consulta, aprobación y rechazo.
  'ver_solicitudes_acceso',
  'aprobar_solicitudes_acceso',
  'rechazar_solicitudes_acceso',
  // Solicitudes de permisos extra del personal (las resuelve el administrador).
  'ver_solicitudes_permisos',
  'aprobar_solicitudes_permisos',
  'rechazar_solicitudes_permisos',
  'gestionar_solicitudes_permisos',
  // Consulta auditada de la contraseña de una cuenta.
  'revelar_password_usuarios',
  'gestionar_reclamaciones',
  'gestionar_solicitudes_informe',
  'gestionar_legal',
  'gestionar_configuracion',
  'gestionar_verificacion_cuentas',
  'gestionar_respaldos',
  'gestionar_vialidades',
  'usar_simulador',
  'gestionar_publicidad',
  'gestionar_correos'
];

/**
 * Permisos paraguas que se expanden a permisos CRUD concretos.
 *
 * Así una cuenta con `gestionar_usuarios` conserva exactamente las mismas
 * capacidades que antes, pero el panel y las claves pueden conceder solo
 * «ver», «crear», «editar» o «eliminar» por separado.
 */
export const PERMISOS_UMBRELLA = {
  gestionar_usuarios: [
    'ver_usuarios',
    'crear_usuarios',
    'editar_usuarios',
    'eliminar_usuarios',
    'ver_solicitudes_acceso',
    'aprobar_solicitudes_acceso',
    'rechazar_solicitudes_acceso'
  ],
  gestionar_claves: ['ver_claves', 'crear_claves', 'editar_claves', 'eliminar_claves'],
  gestionar_avisos_clave: ['ver_avisos_clave', 'editar_avisos_clave'],
  gestionar_tipos: ['ver_tipos', 'crear_tipos', 'editar_tipos', 'eliminar_tipos'],
  gestionar_solicitudes_permisos: [
    'ver_solicitudes_permisos',
    'aprobar_solicitudes_permisos',
    'rechazar_solicitudes_permisos'
  ]
};

/**
 * Módulos con operaciones CRUD propias. El frontend pinta una fila por módulo
 * con las acciones disponibles; el servidor vuelve a comprobar cada permiso.
 */
export const PERMISOS_CRUD = [
  {
    clave: 'usuarios',
    etiqueta: 'Usuarios',
    permisos: {
      ver: 'ver_usuarios',
      crear: 'crear_usuarios',
      editar: 'editar_usuarios',
      eliminar: 'eliminar_usuarios'
    }
  },
  {
    clave: 'claves',
    etiqueta: 'Claves de acceso',
    etiquetas: { ver: 'Ver', crear: 'Crear', editar: 'Revocar', eliminar: 'Eliminar' },
    permisos: {
      ver: 'ver_claves',
      crear: 'crear_claves',
      editar: 'editar_claves',
      eliminar: 'eliminar_claves'
    }
  },
  {
    clave: 'tipos',
    etiqueta: 'Tipos de incidencia',
    // El catálogo solo permite crear y eliminar conceptos personalizados.
    etiquetas: { ver: 'Ver', crear: 'Crear', eliminar: 'Eliminar' },
    permisos: {
      ver: 'ver_tipos',
      crear: 'crear_tipos',
      editar: null,
      eliminar: 'eliminar_tipos'
    }
  },
  {
    clave: 'solicitudes_acceso',
    etiqueta: 'Solicitudes de acceso',
    etiquetas: { ver: 'Ver', editar: 'Aprobar', eliminar: 'Rechazar' },
    permisos: {
      ver: 'ver_solicitudes_acceso',
      crear: null,
      editar: 'aprobar_solicitudes_acceso',
      eliminar: 'rechazar_solicitudes_acceso'
    }
  },
  {
    clave: 'avisos_clave',
    etiqueta: 'Avisos por clave',
    etiquetas: { ver: 'Ver', editar: 'Configurar' },
    permisos: {
      ver: 'ver_avisos_clave',
      crear: null,
      editar: 'editar_avisos_clave',
      eliminar: null
    }
  },
  {
    clave: 'solicitudes_permisos',
    etiqueta: 'Solicitudes de permisos',
    etiquetas: { ver: 'Ver', editar: 'Aprobar', eliminar: 'Rechazar' },
    permisos: {
      ver: 'ver_solicitudes_permisos',
      crear: null,
      editar: 'aprobar_solicitudes_permisos',
      eliminar: 'rechazar_solicitudes_permisos'
    }
  }
];

/** Permisos que trae cada rol antes de aplicar excepciones por cuenta. */
export const PERMISOS_POR_ROL = {
  admin: [...PERMISOS],
  admin_estatal: [
    'reportar',
    'editar_propios',
    'cambiar_estado',
    'resolver',
    'moderar',
    'ver_moderacion',
    'exportar',
    'gestionar_usuarios',
    'ver_usuarios',
    'gestionar_claves',
    'gestionar_avisos_clave',
    'ver_incidencias_panel',
    'ver_tipos',
    'gestionar_tipos',
    'ver_municipios_panel',
    'ver_zonas',
    'gestionar_zonas',
    'ver_firmas',
    'ver_monitoreo',
    'responder_tickets',
    'atender_tickets',
    'ver_reparaciones_panel',
    'coordinar_reparaciones',
    'atender_reparaciones',
    'subir_documentos_reparacion',
    'ver_metricas',
    'gestionar_vialidades',
    'gestionar_solicitudes_permisos',
    'revelar_password_usuarios',
    'gestionar_reclamaciones'
  ],
  admin_municipal: [
    'reportar',
    'editar_propios',
    'cambiar_estado',
    'resolver',
    'moderar',
    'ver_moderacion',
    'exportar',
    'gestionar_usuarios',
    'ver_usuarios',
    'gestionar_claves',
    'gestionar_avisos_clave',
    'ver_incidencias_panel',
    'ver_tipos',
    'gestionar_tipos',
    'ver_municipios_panel',
    'ver_zonas',
    'gestionar_zonas',
    'ver_firmas',
    'responder_tickets',
    'atender_tickets',
    'ver_reparaciones_panel',
    'coordinar_reparaciones',
    'atender_reparaciones',
    'subir_documentos_reparacion',
    'ver_metricas',
    'gestionar_vialidades',
    'gestionar_solicitudes_permisos',
    'revelar_password_usuarios',
    'gestionar_reclamaciones'
  ],
  funcionario: [
    'reportar',
    'editar_propios',
    'cambiar_estado',
    'resolver',
    'moderar',
    'ver_moderacion',
    'exportar',
    'ver_usuarios',
    'ver_incidencias_panel',
    'ver_tipos',
    'gestionar_tipos',
    'ver_municipios_panel',
    'ver_zonas',
    'gestionar_zonas',
    'ver_firmas',
    'responder_tickets',
    'ver_reparaciones_panel',
    'coordinar_reparaciones',
    'atender_reparaciones',
    'subir_documentos_reparacion',
    'ver_metricas',
    'gestionar_reclamaciones'
  ],
  cuadrilla: [
    'ver_incidencias_panel',
    'ver_reparaciones_panel',
    'atender_reparaciones',
    'subir_documentos_reparacion'
  ],
  auditor: [
    'exportar',
    'ver_usuarios',
    'ver_incidencias_panel',
    'ver_tipos',
    'ver_municipios_panel',
    'ver_zonas',
    'ver_moderacion',
    'responder_tickets',
    'ver_metricas',
    'gestionar_reclamaciones'
  ],
  soporte: [
    'responder_tickets',
    'atender_tickets',
    'ver_incidencias_panel',
    'ver_moderacion',
    'ver_metricas'
  ],
  enlace_estatal: [
    'exportar',
    'ver_incidencias_panel',
    'ver_moderacion',
    'responder_tickets',
    'ver_monitoreo',
    'ver_metricas'
  ],
  enlace_federal: [
    'exportar',
    'ver_incidencias_panel',
    'ver_moderacion',
    'responder_tickets',
    'ver_monitoreo',
    'ver_metricas'
  ],
  ciudadano: ['reportar', 'editar_propios', 'responder_tickets'],
  anonimo: ['reportar', 'editar_propios']
};

/** Municipio que se muestra cuando la aplicación acaba de arrancar (Maravatío). */
export const MUNICIPIO_DEFAULT = '16050';

/**
 * Concepto «Otro»: es el único que deja elegir un icono propio.
 * El resto de conceptos ya trae el suyo, y así todos los reportes del mismo
 * tipo se ven igual en el listado y en el mapa.
 */
export const TIPO_OTRO = 'otro';

/**
 * Límites de evidencia.
 *
 * La evidencia es **solo de fotografías**: el video se retiró del formulario y
 * el servidor lo rechaza (los reportes que ya tengan video se siguen mostrando).
 * El PDF se admite únicamente como documento de la resolución.
 */
export const EVIDENCIA_POLITICA = {
  maxFotoBytes: 100 * 1024 * 1024,
  maxArchivosPorCarga: 20,
  mimesPermitidos: ['image/', 'application/pdf'],
  /**
   * Tope para la evidencia que llega dentro de un respaldo del monolito: allí
   * también había video de hasta 1 GB, así que se conserva ese margen para no
   * perder archivos que ya existían. Al subir desde el formulario manda
   * `maxFotoBytes`.
   */
  maxImportacionBytes: 1024 * 1024 * 1024,
  extensiones: {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
    // Solo para importar evidencia antigua: el video ya no se puede subir.
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm'
  }
};

/** Íconos disponibles para el selector (se cargan desde los datos semilla). */
export const COLECCIONES = [
  'incidencias',
  'tipos',
  'municipios',
  'usuarios',
  'notificaciones',
  'denuncias'
];
