/**
 * Catálogo de acciones del simulador.
 *
 * El catálogo es la fuente de la pestaña admin y de la guía de tutorial. Cada
 * entrada declara los roles que pueden ejecutarla y la cadena que se muestra
 * al administrador (ruta → permiso → servicio → repositorio → evento).
 */
export const ROLES_SIMULACION = [
  { clave: 'anonimo', nombre: 'Ciudadanía anónima', grupo: 'Público' },
  { clave: 'ciudadano', nombre: 'Ciudadano con cuenta', grupo: 'Público' },
  { clave: 'funcionario', nombre: 'Funcionario municipal', grupo: 'Personal' },
  { clave: 'auditor', nombre: 'Auditor (solo lectura)', grupo: 'Personal' },
  { clave: 'enlace_estatal', nombre: 'Enlace estatal', grupo: 'Personal' },
  { clave: 'enlace_federal', nombre: 'Enlace federal', grupo: 'Personal' },
  { clave: 'soporte', nombre: 'Soporte técnico', grupo: 'Personal' },
  { clave: 'admin_municipal', nombre: 'Administrador municipal', grupo: 'Administración' },
  { clave: 'admin_estatal', nombre: 'Administrador estatal', grupo: 'Administración' },
  { clave: 'admin', nombre: 'Administrador maestro', grupo: 'Administración' }
];

const campo = (nombre, etiqueta, tipo = 'text', defecto = '', extra = {}) => ({
  nombre,
  etiqueta,
  tipo,
  defecto,
  ...extra
});

export const ACCIONES_SIMULACION = [
  {
    id: 'reportar',
    seccion: 'Incidencias',
    titulo: 'Reportar una incidencia',
    descripcion: 'Crea un reporte real etiquetado como SIMULADO en el municipio de la sesión.',
    roles: ['anonimo', 'ciudadano', 'funcionario', 'admin_municipal', 'admin_estatal', 'admin'],
    endpoint: 'POST /api/incidencias',
    metodo: 'POST',
    permiso: 'crear_incidencias',
    servicio: 'incidencias.service.crear',
    repositorio: 'crearIncidencia',
    eventos: ['incidencia_creada'],
    notificacion: 'Acuse al autor y aviso al personal del municipio',
    correo: 'No (solo aviso interno)',
    entidad: 'incidencias',
    campos: [
      campo('titulo', 'Título', 'text', '[SIMULACIÓN] Bache de prueba'),
      campo('descripcion', 'Descripción', 'textarea', 'Reporte generado por el simulador para probar el flujo.')
    ]
  },
  {
    id: 'comentar',
    seccion: 'Incidencias',
    titulo: 'Comentar una incidencia simulada',
    descripcion: 'Publica un comentario con las reglas anti-abuso y lo marca como SIMULADO.',
    roles: ['anonimo', 'ciudadano', 'funcionario', 'admin_municipal', 'admin_estatal', 'admin'],
    endpoint: 'POST /api/incidencias/:id/comentarios',
    metodo: 'POST',
    permiso: 'comentar',
    servicio: 'comentarios.service.crear',
    repositorio: 'crearComentarioIncidencia',
    eventos: ['incidencia_comentario'],
    notificacion: 'Aviso al autor del reporte',
    correo: 'No',
    entidad: 'incidencia_comentarios',
    campos: [campo('texto', 'Comentario', 'textarea', 'Comentario de prueba del simulador.')]
  },
  {
    id: 'firmar',
    seccion: 'Firmas',
    titulo: 'Firmar la incidencia simulada',
    descripcion: 'Firma con la cuenta simulada y comprueba el límite configurable por cuenta.',
    roles: ['ciudadano', 'admin_municipal', 'admin_estatal', 'admin'],
    endpoint: 'POST /api/incidencias/:id/firmas',
    metodo: 'POST',
    permiso: 'firmar',
    servicio: 'firmas.service.firmarIncidencia',
    repositorio: 'crearFirmaIncidencia',
    eventos: ['firma_agregada', 'meta_firmas_alcanzada'],
    notificacion: 'Autor, administración y funcionarios del municipio',
    correo: 'No',
    entidad: 'recoleccion_firmas',
    campos: []
  },
  {
    id: 'recoleccion',
    seccion: 'Firmas',
    titulo: 'Crear recolección municipal',
    descripcion: 'Abre una recolección de firmas para pedir atención a un tema del municipio.',
    roles: ['ciudadano', 'admin_municipal', 'admin_estatal', 'admin'],
    endpoint: 'POST /api/firmas/municipio',
    metodo: 'POST',
    permiso: 'firmar',
    servicio: 'firmas.service.crearRecoleccionMunicipal',
    repositorio: 'crearRecoleccionFirma',
    eventos: ['recoleccion_firmas_creada'],
    notificacion: 'Administración y personal del municipio',
    correo: 'No',
    entidad: 'recolecciones_firmas',
    campos: [
      campo('titulo', 'Título', 'text', '[SIMULACIÓN] Recolección vecinal'),
      campo('descripcion', 'Descripción', 'textarea', 'Recolección creada por el simulador.'),
      campo('meta', 'Meta de firmas', 'number', '10')
    ]
  },
  {
    id: 'cambiar-estado',
    seccion: 'Incidencias',
    titulo: 'Cambiar el estado de la incidencia',
    descripcion: 'El funcionario o administrador simulado atiende el reporte creado por la sesión.',
    roles: ['funcionario', 'admin_municipal', 'admin_estatal', 'admin'],
    endpoint: 'PATCH /api/incidencias/:id',
    metodo: 'PATCH',
    permiso: 'editar_incidencias',
    servicio: 'incidencias.service.actualizar',
    repositorio: 'actualizarIncidencia',
    eventos: ['incidencia_actualizada'],
    notificacion: 'Autor y personal que sigue el municipio',
    correo: 'No',
    entidad: 'incidencias',
    campos: [
      campo('estado', 'Nuevo estado', 'select', 'en_proceso', {
        opciones: [
          { valor: 'reportada', etiqueta: 'Reportada' },
          { valor: 'en_proceso', etiqueta: 'En proceso' },
          { valor: 'resuelta', etiqueta: 'Resuelta' }
        ]
      }),
      campo('solucion', 'Solución / nota', 'textarea', 'Atención simulada para probar el flujo.')
    ]
  },
  {
    id: 'ticket',
    seccion: 'Soporte',
    titulo: 'Crear ticket de soporte',
    descripcion: 'Abre un ticket de soporte técnico; queda en la cola del personal.',
    roles: ['ciudadano', 'funcionario', 'soporte', 'admin_municipal', 'admin_estatal', 'admin'],
    endpoint: 'POST /api/tickets',
    metodo: 'POST',
    permiso: 'crear_tickets',
    servicio: 'tickets.service.crear',
    repositorio: 'crearTicket',
    eventos: ['ticket_creado', 'ticket_asignado'],
    notificacion: 'Equipo de soporte y responsable asignado',
    correo: 'No',
    entidad: 'tickets',
    campos: [
      campo('asunto', 'Asunto', 'text', '[SIMULACIÓN] Ticket de prueba'),
      campo('cuerpo', 'Detalle', 'textarea', 'Ticket generado por el simulador.')
    ]
  },
  {
    id: 'contacto',
    seccion: 'Comunicación',
    titulo: 'Contactar a un funcionario',
    descripcion: 'Envía un mensaje directo a un funcionario del municipio sin pedir datos personales.',
    roles: ['ciudadano', 'admin_municipal', 'admin_estatal', 'admin'],
    endpoint: 'POST /api/contacto/funcionarios',
    metodo: 'POST',
    permiso: 'contactar_funcionarios',
    servicio: 'contactos-funcionarios.service.crearContacto',
    repositorio: 'crearContactoFuncionario',
    eventos: ['contacto_funcionario_creado'],
    notificacion: 'Funcionarios destinatarios',
    correo: 'No',
    entidad: 'contactos_funcionarios',
    campos: [
      campo('asunto', 'Asunto', 'text', '[SIMULACIÓN] Consulta ciudadana'),
      campo('mensaje', 'Mensaje', 'textarea', 'Mensaje de prueba del simulador.')
    ]
  },
  {
    id: 'sugerencia',
    seccion: 'Comunicación',
    titulo: 'Enviar una sugerencia',
    descripcion: 'Registra una sugerencia con folio para el buzón del administrador.',
    roles: ['anonimo', 'ciudadano', 'admin_municipal', 'admin_estatal', 'admin'],
    endpoint: 'POST /api/sugerencias',
    metodo: 'POST',
    permiso: 'sugerir',
    servicio: 'sugerencias.service.crear',
    repositorio: 'crearSugerencia',
    eventos: ['sugerencia_creada'],
    notificacion: 'Administración municipal',
    correo: 'No',
    entidad: 'sugerencias',
    campos: [campo('mensaje', 'Sugerencia', 'textarea', 'Sugerencia de prueba del simulador.')]
  },
  {
    id: 'informe',
    seccion: 'Informes',
    titulo: 'Solicitar un informe público',
    descripcion: 'Crea una solicitud multi-territorio con correo de simulación y doble opt-in.',
    roles: ['anonimo', 'ciudadano', 'admin_municipal', 'admin_estatal', 'admin'],
    endpoint: 'POST /api/solicitudes-informe',
    metodo: 'POST',
    permiso: 'solicitar_informes',
    servicio: 'solicitudes.service.crearSolicitud',
    repositorio: 'crearSolicitudInforme',
    eventos: ['solicitud_informe_creada'],
    notificacion: 'Administración',
    correo: 'Sí, en modo simulado (no sale del servidor)',
    entidad: 'solicitudes_informe',
    campos: [
      campo('nombre', 'Nombre', 'text', 'Solicitante simulado'),
      campo('correo', 'Correo', 'email', 'simulacion@example.test')
    ]
  },
  {
    id: 'publicacion',
    seccion: 'Difusión',
    titulo: 'Generar publicación para redes',
    descripcion: 'Arma el texto, hashtags y QR de una publicación institucional.',
    roles: ['admin'],
    endpoint: 'POST /api/admin/publicidad/generar',
    metodo: 'POST',
    permiso: 'publicar_redes',
    servicio: 'publicidad.service.generar',
    repositorio: 'crearPublicacionRed',
    eventos: [],
    notificacion: 'Ninguna',
    correo: 'No',
    entidad: 'publicaciones_redes',
    campos: [
      campo('titulo', 'Título', 'text', '[SIMULACIÓN] Invita a reportar'),
      campo('texto', 'Texto', 'textarea', 'Contenido de prueba para redes sociales.')
    ]
  },
  {
    id: 'correo',
    seccion: 'Difusión',
    titulo: 'Registrar correo institucional',
    descripcion: 'Añade un correo verificado al directorio y evita duplicados.',
    roles: ['admin'],
    endpoint: 'POST /api/admin/correos-institucionales',
    metodo: 'POST',
    permiso: 'gestionar_correos',
    servicio: 'correos-institucionales.service.crear',
    repositorio: 'crearCorreoInstitucional',
    eventos: [],
    notificacion: 'Ninguna',
    correo: 'No',
    entidad: 'correos_institucionales',
    campos: [
      campo('correo', 'Correo', 'email', 'simulacion@example.test'),
      campo('dependencia', 'Dependencia', 'text', 'Ayuntamiento (simulación)')
    ]
  }
];

export function accionesPara(rol) {
  return ACCIONES_SIMULACION.filter((accion) => accion.roles.includes(rol));
}

export function accionPorId(id) {
  return ACCIONES_SIMULACION.find((accion) => accion.id === id) || null;
}
