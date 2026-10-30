/**
 * Catálogo de permisos del panel.
 *
 * Debe mantenerse sincronizado con `backend/src/config/constantes.js`:
 * - `PERMISOS_LISTA` son los permisos que el servidor acepta.
 * - `PERMISOS_UMBRELLA` expande los permisos antiguos `gestionar_*` a CRUD.
 * - `PERMISOS_CRUD` agrupa los módulos con operaciones ver/crear/editar/eliminar.
 * - `PERMISOS_BASE` es la matriz que hereda cada rol antes de las excepciones.
 */

export const PERMISOS_LISTA = [
  'reportar',
  'editar_propios',
  'cambiar_estado',
  'resolver',
  'moderar',
  'ver_moderacion',
  'exportar',
  'ver_usuarios',
  'crear_usuarios',
  'editar_usuarios',
  'eliminar_usuarios',
  'gestionar_usuarios',
  'ver_claves',
  'crear_claves',
  'editar_claves',
  'eliminar_claves',
  'gestionar_claves',
  'ver_avisos_clave',
  'editar_avisos_clave',
  'gestionar_avisos_clave',
  'ver_auditoria',
  'ver_incidencias_panel',
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
  'configurar_notificaciones',
  'ver_metricas',
  'ver_solicitudes_acceso',
  'aprobar_solicitudes_acceso',
  'rechazar_solicitudes_acceso',
  'ver_solicitudes_permisos',
  'aprobar_solicitudes_permisos',
  'rechazar_solicitudes_permisos',
  'gestionar_solicitudes_permisos',
  'revelar_password_usuarios',
  'gestionar_solicitudes_informe',
  'gestionar_legal',
  'gestionar_configuracion',
  'gestionar_respaldos',
  'usar_simulador',
  'gestionar_publicidad',
  'gestionar_correos'
];

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

export const ACCIONES_CRUD = [
  ['ver', 'Ver'],
  ['crear', 'Crear'],
  ['editar', 'Editar'],
  ['eliminar', 'Eliminar']
];

export const PERMISOS_CRUD = [
  {
    clave: 'usuarios',
    etiqueta: 'Usuarios',
    nota: 'Alta, edición y baja de cuentas del personal.',
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
    nota: 'Generar, revocar y eliminar claves, y consultar sus sesiones.',
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
    nota: 'Crear o eliminar conceptos personalizados del catálogo.',
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
    nota: 'Revisar, aprobar o rechazar solicitudes de personal.',
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
    nota: 'Consultar y configurar los municipios que reciben avisos.',
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
    nota: 'Resolver las peticiones de permisos extra del personal.',
    etiquetas: { ver: 'Ver', editar: 'Aprobar', eliminar: 'Rechazar' },
    permisos: {
      ver: 'ver_solicitudes_permisos',
      crear: null,
      editar: 'aprobar_solicitudes_permisos',
      eliminar: 'rechazar_solicitudes_permisos'
    }
  }
];

export const ETIQUETAS_PERMISO = {
  reportar: 'Reportar incidencias',
  editar_propios: 'Editar sus propios reportes',
  cambiar_estado: 'Cambiar estado',
  resolver: 'Resolver incidencias',
  moderar: 'Moderar contenido',
  ver_moderacion: 'Ver cola de moderación',
  exportar: 'Exportar informes',
  ver_usuarios: 'Ver usuarios',
  crear_usuarios: 'Crear usuarios',
  editar_usuarios: 'Editar usuarios',
  eliminar_usuarios: 'Desactivar/eliminar usuarios',
  gestionar_usuarios: 'Gestionar usuarios (todo)',
  ver_claves: 'Ver claves y sesiones',
  crear_claves: 'Crear claves',
  editar_claves: 'Revocar/reactivar claves',
  eliminar_claves: 'Eliminar claves',
  gestionar_claves: 'Gestionar claves (todo)',
  ver_avisos_clave: 'Ver avisos por clave',
  editar_avisos_clave: 'Editar avisos por clave',
  gestionar_avisos_clave: 'Gestionar avisos por clave (todo)',
  ver_auditoria: 'Ver bitácora de auditoría',
  ver_incidencias_panel: 'Ver pestaña de incidencias',
  ver_tipos: 'Ver tipos',
  crear_tipos: 'Crear tipos',
  editar_tipos: 'Editar/reemplazar tipos',
  eliminar_tipos: 'Eliminar tipos',
  gestionar_tipos: 'Gestionar tipos (todo)',
  ver_municipios_panel: 'Ver municipios y fichas',
  ver_zonas: 'Ver zonas',
  gestionar_zonas: 'Gestionar zonas',
  ver_firmas: 'Ver firmas y recolecciones',
  ver_monitoreo: 'Ver monitoreo y conectados',
  responder_tickets: 'Responder tickets',
  atender_tickets: 'Atender panel de soporte',
  configurar_notificaciones: 'Configurar notificaciones',
  ver_metricas: 'Ver estadísticas y métricas',
  ver_solicitudes_acceso: 'Ver solicitudes de acceso',
  aprobar_solicitudes_acceso: 'Aprobar solicitudes de acceso',
  rechazar_solicitudes_acceso: 'Rechazar solicitudes de acceso',
  ver_solicitudes_permisos: 'Ver solicitudes de permisos',
  aprobar_solicitudes_permisos: 'Aprobar solicitudes de permisos',
  rechazar_solicitudes_permisos: 'Rechazar solicitudes de permisos',
  gestionar_solicitudes_permisos: 'Gestionar solicitudes de permisos (todo)',
  revelar_password_usuarios: 'Consultar y restablecer contraseñas',
  gestionar_solicitudes_informe: 'Gestionar solicitudes de informe',
  gestionar_legal: 'Gestionar documentos legales',
  gestionar_configuracion: 'Gestionar configuración',
  gestionar_respaldos: 'Gestionar respaldos',
  usar_simulador: 'Usar simulador',
  gestionar_publicidad: 'Gestionar publicidad, QR y campañas',
  gestionar_correos: 'Gestionar correos institucionales'
};

/** Grupos de la matriz. Los CRUD se pintan como filas Ver/Crear/Editar/Eliminar. */
export const GRUPOS_PERMISOS = [
  { titulo: 'Usuarios', crud: 'usuarios' },
  { titulo: 'Claves de acceso', crud: 'claves' },
  { titulo: 'Tipos de incidencia', crud: 'tipos' },
  { titulo: 'Solicitudes de acceso', crud: 'solicitudes_acceso' },
  { titulo: 'Avisos por clave', crud: 'avisos_clave' },
  { titulo: 'Solicitudes de permisos', crud: 'solicitudes_permisos' },
  {
    titulo: 'Incidencias y moderación',
    permisos: [
      'reportar',
      'editar_propios',
      'cambiar_estado',
      'resolver',
      'moderar',
      'ver_moderacion',
      'ver_incidencias_panel',
      'exportar'
    ]
  },
  {
    titulo: 'Mapa y catálogos',
    permisos: ['ver_municipios_panel', 'ver_zonas', 'gestionar_zonas', 'ver_firmas']
  },
  {
    titulo: 'Soporte y notificaciones',
    permisos: ['responder_tickets', 'atender_tickets', 'configurar_notificaciones']
  },
  {
    titulo: 'Monitoreo y analítica',
    permisos: ['ver_monitoreo', 'ver_metricas', 'ver_auditoria']
  },
  {
    titulo: 'Administración del sistema',
    permisos: [
      'gestionar_solicitudes_informe',
      'gestionar_legal',
      'gestionar_configuracion',
      'gestionar_respaldos',
      'usar_simulador',
      'gestionar_publicidad',
      'gestionar_correos',
      'revelar_password_usuarios'
    ]
  }
];

export const PERMISOS_BASE = {
  admin: PERMISOS_LISTA,
  admin_estatal: [
    'gestionar_solicitudes_permisos',
    'revelar_password_usuarios',
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
    'configurar_notificaciones',
    'ver_metricas'
  ],
  admin_municipal: [
    'gestionar_solicitudes_permisos',
    'revelar_password_usuarios',
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
    'configurar_notificaciones',
    'ver_metricas'
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
    'configurar_notificaciones',
    'ver_metricas'
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
    'configurar_notificaciones',
    'ver_metricas'
  ],
  soporte: [
    'responder_tickets',
    'atender_tickets',
    'ver_incidencias_panel',
    'ver_moderacion',
    'configurar_notificaciones',
    'ver_metricas'
  ],
  enlace_estatal: [
    'exportar',
    'ver_incidencias_panel',
    'ver_moderacion',
    'responder_tickets',
    'configurar_notificaciones',
    'ver_monitoreo',
    'ver_metricas'
  ],
  enlace_federal: [
    'exportar',
    'ver_incidencias_panel',
    'ver_moderacion',
    'responder_tickets',
    'configurar_notificaciones',
    'ver_monitoreo',
    'ver_metricas'
  ]
};

export function expandirPermisos(lista = []) {
  const conjunto = new Set();
  for (const permiso of lista) {
    if (!PERMISOS_LISTA.includes(permiso)) continue;
    conjunto.add(permiso);
    for (const hijo of PERMISOS_UMBRELLA[permiso] || []) conjunto.add(hijo);
  }
  return [...conjunto];
}

export function permisosBaseDeRol(rol) {
  return expandirPermisos(PERMISOS_BASE[rol] || []);
}

/** Matriz del rol con las excepciones de la cuenta aplicadas. */
export function permisosEfectivosDeRol(rol, overrides = {}) {
  const conjunto = new Set(permisosBaseDeRol(rol));
  const mapa = overrides && typeof overrides === 'object' && !Array.isArray(overrides)
    ? overrides
    : {};
  for (const [permiso, valor] of Object.entries(mapa)) {
    if (valor !== false || !PERMISOS_UMBRELLA[permiso]) continue;
    conjunto.delete(permiso);
    for (const hijo of PERMISOS_UMBRELLA[permiso]) conjunto.delete(hijo);
  }
  for (const [permiso, valor] of Object.entries(mapa)) {
    if (valor !== true) continue;
    conjunto.add(permiso);
    for (const hijo of PERMISOS_UMBRELLA[permiso] || []) conjunto.add(hijo);
  }
  for (const [permiso, valor] of Object.entries(mapa)) {
    if (valor !== false || PERMISOS_UMBRELLA[permiso]) continue;
    conjunto.delete(permiso);
  }
  return conjunto;
}
