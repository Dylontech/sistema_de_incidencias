/**
 * Catálogo de eventos notificables.
 *
 * Cada evento declara sus valores por defecto; la configuración global del
 * panel (`configuracion_notificaciones`) los puede sobrescribir sin tocar
 * código. Los servicios solo llaman a `notificaciones.emitir('ticket_creado',
 * …)` y aquí está todo lo demás.
 *
 * `roles` son los destinatarios por defecto cuando el aviso no va dirigido a
 * una cuenta concreta (por ejemplo, el autor de un ticket). `alcance` decide el
 * filtro territorial: `todos`, `estados`, `municipios` o `asignados`.
 */
export const EVENTOS_NOTIFICACION = {
  /* ------------------------------ incidencias ------------------------------ */
  incidencia_creada: {
    etiqueta: 'Nueva incidencia reportada',
    descripcion: 'Avisa al personal cuando alguien reporta una incidencia.',
    roles: ['funcionario', 'auditor', 'enlace_estatal', 'enlace_federal'],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },
  incidencia_estado: {
    etiqueta: 'Cambio de estado de una incidencia',
    descripcion: 'Avisa al autor cuando su reporte cambia de estado.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },
  incidencia_resuelta: {
    etiqueta: 'Incidencia resuelta',
    descripcion: 'Avisa al autor cuando su reporte se resuelve.',
    roles: [],
    severidad: 'exito',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },
  incidencia_comentario: {
    etiqueta: 'Nuevo comentario en una incidencia',
    descripcion: 'Avisa al autor cuando el personal comenta su reporte.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },
  incidencia_peligro: {
    etiqueta: 'Incidencia marcada como peligrosa',
    descripcion: 'Avisa al autor cuando su reporte se marca o se retira de peligro.',
    roles: [],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },
  incidencia_alerta: {
    etiqueta: 'Alerta por antigüedad',
    descripcion: 'Avisos automáticos de incidencias que llevan demasiado tiempo abiertas.',
    roles: ['funcionario', 'auditor'],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },

  /* ------------------------------ sugerencias ------------------------------ */
  sugerencia_creada: {
    etiqueta: 'Nueva sugerencia ciudadana',
    descripcion: 'Avisa a los administradores cuando llega una sugerencia.',
    roles: ['admin', 'admin_estatal', 'admin_municipal'],
    severidad: 'info',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'sugerencia'
  },
  sugerencia_respondida: {
    etiqueta: 'Respuesta a una sugerencia',
    descripcion: 'Avisa a la persona que envió la sugerencia cuando se le responde.',
    roles: [],
    severidad: 'exito',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'sugerencia'
  },

  /* -------------------------------- contacto ------------------------------- */
  contacto_creado: {
    etiqueta: 'Nuevo mensaje de contacto',
    descripcion: 'Avisa al personal cuando un ciudadano usa el formulario de contacto.',
    roles: ['admin', 'funcionario'],
    severidad: 'info',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'contacto'
  },
  contacto_respondido: {
    etiqueta: 'Respuesta a un mensaje de contacto',
    descripcion: 'Avisa al ciudadano cuando el personal responde su mensaje.',
    roles: [],
    severidad: 'exito',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'contacto'
  },

  /* ---------------------------- solicitudes -------------------------------- */
  solicitud_acceso_creada: {
    etiqueta: 'Nueva solicitud de acceso',
    descripcion: 'Avisa a los administradores cuando alguien pide una cuenta del personal.',
    roles: ['admin'],
    severidad: 'info',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'solicitud_acceso'
  },
  solicitud_acceso_resuelta: {
    etiqueta: 'Solicitud de acceso resuelta',
    descripcion: 'Avisa al solicitante cuando su solicitud se aprueba o se rechaza.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'solicitud_acceso'
  },
  ficha_municipio_pendiente: {
    etiqueta: 'Ficha municipal pendiente',
    descripcion: 'Avisa a los administradores cuando un funcionario propone cambios a la ficha de su municipio.',
    roles: ['admin', 'admin_estatal', 'admin_municipal'],
    severidad: 'info',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'municipio'
  },
  ficha_municipio_aprobada: {
    etiqueta: 'Ficha municipal aprobada',
    descripcion: 'Avisa al funcionario que su propuesta de ficha fue aprobada.',
    roles: [],
    severidad: 'exito',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'municipio'
  },
  ficha_municipio_rechazada: {
    etiqueta: 'Ficha municipal rechazada',
    descripcion: 'Avisa al funcionario que su propuesta de ficha fue rechazada.',
    roles: [],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'municipio'
  },
  permiso_solicitado: {
    etiqueta: 'Solicitud de permisos',
    descripcion: 'Avisa a los administradores cuando el personal pide permisos extra.',
    roles: ['admin', 'admin_estatal', 'admin_municipal'],
    severidad: 'info',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'permiso'
  },
  permiso_resuelto: {
    etiqueta: 'Solicitud de permisos resuelta',
    descripcion: 'Avisa a la persona si su solicitud de permisos fue aprobada o rechazada.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'permiso'
  },
  solicitud_password_creada: {
    etiqueta: 'Solicitud de cambio de contraseña',
    descripcion: 'Avisa a la administración cuando el personal pide cambiar su contraseña.',
    roles: ['admin', 'admin_estatal', 'admin_municipal'],
    severidad: 'info',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'password'
  },
  solicitud_password_resuelta: {
    etiqueta: 'Solicitud de contraseña resuelta',
    descripcion: 'Avisa al solicitante cuando su contraseña ya fue restablecida.',
    roles: [],
    severidad: 'exito',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'password'
  },
  baja_solicitada: {
    etiqueta: 'Solicitud de baja de una cuenta',
    descripcion: 'Avisa a la administración cuando el personal pide dar de baja a un funcionario.',
    roles: ['admin', 'admin_estatal', 'admin_municipal'],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'baja'
  },
  baja_resuelta: {
    etiqueta: 'Solicitud de baja resuelta',
    descripcion: 'Avisa a quien la pidió si la baja se aplicó o se rechazó.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'baja'
  },
  alta_solicitada: {
    etiqueta: 'Solicitud de alta de una cuenta',
    descripcion: 'Avisa a la administración cuando un funcionario pide crear una cuenta.',
    roles: ['admin', 'admin_estatal', 'admin_municipal'],
    severidad: 'info',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'alta'
  },
  alta_resuelta: {
    etiqueta: 'Solicitud de alta resuelta',
    descripcion: 'Avisa al solicitante con la cuenta creada y su contraseña temporal.',
    roles: [],
    severidad: 'exito',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'alta'
  },
  cuenta_verificada: {
    etiqueta: 'Correo verificado',
    descripcion: 'Confirma al titular que su correo quedó verificado.',
    roles: [],
    severidad: 'exito',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'cuenta'
  },
  cuenta_correo_cambiado: {
    etiqueta: 'Correo de la cuenta actualizado',
    descripcion: 'Avisa al titular que cambió el correo de avisos y debe confirmarlo.',
    roles: [],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'cuenta'
  },
  cuenta_password_cambiada: {
    etiqueta: 'Contraseña de la cuenta cambiada',
    descripcion: 'Avisa al titular que su contraseña cambió y se cerraron sus sesiones.',
    roles: [],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'cuenta'
  },
  cuenta_congelada: {
    etiqueta: 'Cuenta congelada',
    descripcion: 'Avisa al titular que su cuenta quedó congelada temporalmente.',
    roles: [],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'cuenta'
  },
  cuenta_eliminada: {
    etiqueta: 'Cuenta ciudadana eliminada',
    descripcion: 'Aviso interno para administradores cuando una cuenta se elimina.',
    roles: ['admin'],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'cuenta'
  },
  reparacion_asignada: {
    etiqueta: 'Reparación asignada',
    descripcion: 'Avisa a la cuadrilla cuando se le asigna una reparación.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },
  reparacion_iniciada: {
    etiqueta: 'Reparación iniciada',
    descripcion: 'Avisa al coordinador cuando la cuadrilla inicia los trabajos.',
    roles: ['funcionario', 'admin_estatal', 'admin_municipal', 'admin'],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },
  reparacion_terminada: {
    etiqueta: 'Reparación terminada',
    descripcion: 'Avisa al coordinador cuando la cuadrilla termina los trabajos.',
    roles: ['funcionario', 'admin_estatal', 'admin_municipal', 'admin'],
    severidad: 'exito',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },
  reparacion_documentos: {
    etiqueta: 'Documentos de reparación',
    descripcion: 'Avisa al coordinador cuando se suben documentos oficiales del costo.',
    roles: ['funcionario', 'admin_estatal', 'admin_municipal', 'admin'],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },
  reparacion_validada: {
    etiqueta: 'Reparación validada',
    descripcion: 'Avisa a la cuadrilla que el coordinador validó la reparación.',
    roles: [],
    severidad: 'exito',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },
  reporte_conversacion_creada: {
    etiqueta: 'Reporte de una conversación',
    descripcion: 'Avisa a la moderación cuando alguien reporta un hilo de mensajes.',
    roles: ['admin', 'admin_estatal', 'admin_municipal', 'funcionario'],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'conversacion'
  },
  reporte_conversacion_resuelta: {
    etiqueta: 'Reporte de conversación resuelto',
    descripcion: 'Avisa al denunciante y a la cuenta reportada de la medida aplicada.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'conversacion'
  },
  reclamacion_creada: {
    etiqueta: 'Reclamación de una incidencia',
    descripcion: 'Avisa al funcionario y a la administración del municipio para mediar.',
    roles: ['admin', 'admin_estatal', 'admin_municipal', 'funcionario'],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'reclamacion'
  },
  reclamacion_delegada: {
    etiqueta: 'Reclamación delegada',
    descripcion: 'Avisa al funcionario en quien se delegó la decisión final.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'reclamacion'
  },
  reclamacion_resuelta: {
    etiqueta: 'Reclamación resuelta',
    descripcion: 'Informa al funcionario y a quien reclamó de la decisión y el informe preliminar.',
    roles: ['admin', 'admin_estatal', 'admin_municipal', 'funcionario'],
    severidad: 'info',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'reclamacion'
  },
  solicitud_informe_creada: {
    etiqueta: 'Nueva solicitud de informe público',
    descripcion: 'Avisa a los administradores cuando se pide un informe público.',
    roles: ['admin'],
    severidad: 'info',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'solicitud_informe'
  },
  solicitud_informe_enviada: {
    etiqueta: 'Informe público enviado',
    descripcion: 'Aviso interno cuando termina la generación de un informe.',
    roles: ['admin'],
    severidad: 'exito',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'solicitud_informe'
  },
  solicitud_informe_error: {
    etiqueta: 'Error al generar un informe público',
    descripcion: 'Avisa a los administradores cuando falla la generación o el envío.',
    roles: ['admin'],
    severidad: 'error',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'solicitud_informe'
  },

  /* --------------------------------- tickets ------------------------------- */
  ticket_creado: {
    etiqueta: 'Nuevo ticket de soporte',
    descripcion: 'Avisa al equipo de soporte y a los administradores.',
    roles: ['soporte', 'admin'],
    severidad: 'info',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'ticket'
  },
  ticket_asignado: {
    etiqueta: 'Ticket asignado',
    descripcion: 'Avisa a la persona responsable del ticket.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'ticket'
  },
  ticket_respondido: {
    etiqueta: 'Respuesta en un ticket',
    descripcion: 'Avisa al autor del ticket (o al responsable si responde el autor).',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'ticket'
  },
  ticket_cerrado: {
    etiqueta: 'Ticket cerrado',
    descripcion: 'Avisa al autor cuando se cierra su ticket.',
    roles: [],
    severidad: 'exito',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'ticket'
  },
  ticket_reabierto: {
    etiqueta: 'Ticket reabierto',
    descripcion: 'Avisa al responsable cuando el autor reabre el ticket.',
    roles: [],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'ticket'
  },

  /* ------------------------------- mensajería ------------------------------ */
  mensaje_directo: {
    etiqueta: 'Mensaje directo',
    descripcion: 'Avisa al destinatario de un mensaje interno.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'mensaje'
  },
  difusion_personal: {
    etiqueta: 'Difusión al personal',
    descripcion: 'Avisa a un municipio o estado de un mensaje interno.',
    roles: ['funcionario', 'auditor', 'enlace_estatal', 'enlace_federal'],
    severidad: 'info',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'mensaje'
  },

  /* ------------------------------- moderación ------------------------------ */
  moderacion_cuenta: {
    etiqueta: 'Advertencia o sanción de cuenta',
    descripcion: 'Avisa a la cuenta afectada por una decisión de moderación.',
    roles: [],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'cuenta'
  },
  moderacion_contenido: {
    etiqueta: 'Contenido oculto o restaurado',
    descripcion: 'Avisa al autor cuando se modera su contenido.',
    roles: [],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },

  /* --------------------------------- claves -------------------------------- */
  clave_creada: {
    etiqueta: 'Clave de acceso generada',
    descripcion: 'Aviso interno para administradores.',
    roles: ['admin'],
    severidad: 'info',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'clave'
  },
  clave_revocada: {
    etiqueta: 'Clave de acceso revocada',
    descripcion: 'Aviso interno para administradores.',
    roles: ['admin'],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'clave'
  },
  clave_por_vencer: {
    etiqueta: 'Clave de acceso por vencer',
    descripcion:
      'Avisa a las cuentas vinculadas a una clave 30, 20, 10, 5 y 0 días antes de su vencimiento.',
    roles: [],
    severidad: 'alerta',
    canal: 'ambos',
    alcance: 'asignados',
    entidadTipo: 'clave'
  },
  clave_renovada: {
    etiqueta: 'Clave de acceso renovada',
    descripcion: 'Avisa a las cuentas vinculadas que la clave tiene una nueva vigencia.',
    roles: [],
    severidad: 'exito',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'clave'
  },
  clave_renovacion_solicitada: {
    etiqueta: 'Solicitud de renovación de clave',
    descripcion: 'Avisa a la administración cuando un funcionario pide renovar su clave.',
    roles: ['admin', 'admin_estatal', 'admin_municipal'],
    severidad: 'info',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'clave'
  },

  /* -------------------------------- seguridad ------------------------------ */
  seguridad_alerta: {
    etiqueta: 'Alerta de seguridad',
    descripcion: 'Accesos sospechosos, fallos repetidos o cambios sensibles.',
    roles: ['admin'],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'seguridad'
  },

  /* -------------------------------- firmas -------------------------------- */
  firma_agregada: {
    etiqueta: 'Nueva firma de una incidencia',
    descripcion: 'Avisa al autor cuando alguien firma su incidencia.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'incidencia'
  },
  meta_firmas_alcanzada: {
    etiqueta: 'Meta de firmas alcanzada',
    descripcion: 'Avisa al autor, administradores y funcionarios cuando se alcanza la meta.',
    roles: ['admin', 'funcionario'],
    severidad: 'exito',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'incidencia'
  },
  recoleccion_firmas_creada: {
    etiqueta: 'Recolección de firmas creada',
    descripcion: 'Avisa al autor y al personal cuando se crea o actualiza una recolección.',
    roles: ['admin'],
    severidad: 'info',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'recoleccion_firmas'
  },
  solicitud_firmas_admin: {
    etiqueta: 'Solicitud de mediación de firmas',
    descripcion: 'Avisa a los administradores cuando se pide revisar una recolección.',
    roles: ['admin'],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'recoleccion_firmas'
  },
  documento_firmas_enviado: {
    etiqueta: 'Documento de firmas enviado',
    descripcion: 'Registra el envío del documento de firmas al funcionario.',
    roles: ['admin'],
    severidad: 'exito',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'recoleccion_firmas'
  },
  limite_firmas_alcanzado: {
    etiqueta: 'Límite de firmas por cuenta',
    descripcion: 'Avisa a la cuenta cuando alcanza el máximo configurado.',
    roles: [],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'cuenta'
  },

  /* -------------------------- contacto a funcionarios --------------------- */
  contacto_funcionario_creado: {
    etiqueta: 'Nuevo contacto a funcionarios',
    descripcion: 'Avisa a los funcionarios seleccionados por un ciudadano.',
    roles: ['funcionario'],
    severidad: 'info',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'contacto_funcionario'
  },
  contacto_funcionario_respondido: {
    etiqueta: 'Respuesta a un contacto directo',
    descripcion: 'Avisa al ciudadano cuando un funcionario responde su mensaje.',
    roles: [],
    severidad: 'exito',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'contacto_funcionario'
  },
  municipio_sin_funcionario: {
    etiqueta: 'Municipio sin funcionarios',
    descripcion: 'Avisa a los administradores cuando alguien pide contactar un municipio sin personal.',
    roles: ['admin', 'admin_estatal', 'admin_municipal'],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'municipios',
    entidadTipo: 'solicitud_funcionario'
  },
  solicitud_funcionario_atendida: {
    etiqueta: 'Solicitud de funcionario atendida',
    descripcion: 'Avisa al ciudadano cuando el admin atiende la mediación.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'asignados',
    entidadTipo: 'solicitud_funcionario'
  },

  /* ------------------------------- respaldos ------------------------------ */
  respaldo_creado: {
    etiqueta: 'Respaldo creado',
    descripcion: 'Avisa al administrador cuando termina un respaldo.',
    roles: ['admin'],
    severidad: 'exito',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'respaldo'
  },
  respaldo_error: {
    etiqueta: 'Error de respaldo',
    descripcion: 'Avisa al administrador cuando un respaldo falla.',
    roles: ['admin'],
    severidad: 'error',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'respaldo'
  },
  respaldo_restaurado: {
    etiqueta: 'Respaldo restaurado',
    descripcion: 'Avisa al administrador cuando se restaura un respaldo.',
    roles: ['admin'],
    severidad: 'alerta',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'respaldo'
  },
  respaldo_eliminado: {
    etiqueta: 'Respaldo eliminado',
    descripcion: 'Registra la eliminación de un respaldo.',
    roles: ['admin'],
    severidad: 'info',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'respaldo'
  },

  prueba_notificacion: {
    etiqueta: 'Notificación de prueba',
    descripcion: 'Aviso manual que envía un administrador para comprobar canales.',
    roles: [],
    severidad: 'info',
    canal: 'app',
    alcance: 'todos',
    entidadTipo: 'sistema'
  }
};

/** Lista de eventos con su definición, para el panel de configuración. */
export function catalogoEventos() {
  return Object.entries(EVENTOS_NOTIFICACION).map(([evento, definicion]) => ({
    evento,
    ...definicion
  }));
}

/** Definición de un evento, o `null` si no existe. */
export function definicionDe(evento) {
  return EVENTOS_NOTIFICACION[evento] || null;
}

/** ¿El evento existe en el catálogo? */
export function eventoValido(evento) {
  return Boolean(EVENTOS_NOTIFICACION[evento]);
}
