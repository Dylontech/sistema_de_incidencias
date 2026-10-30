/**
 * Explicación de cada permiso para la matriz del panel.
 *
 * Cada entrada responde tres preguntas: qué permite, qué bloquea y un ejemplo
 * real. `modulo` enlaza con la guía simulada de la enciclopedia de tutoriales.
 * Debe mantenerse sincronizado con `PERMISOS_LISTA` de `data/permisos.js`.
 */
export const PERMISOS_AYUDA = {
  reportar: {
    etiqueta: 'Reportar incidencias',
    quePermite: 'Crear reportes nuevos en los municipios donde la cuenta tiene alcance.',
    queBloquea: 'Sin este permiso el formulario de reporte rechaza la publicación.',
    ejemplo: 'Un funcionario de Maravatío registra un bache en su municipio desde el mapa.',
    modulo: 'permisos-incidencias'
  },
  editar_propios: {
    etiqueta: 'Editar sus propios reportes',
    quePermite: 'Corregir la descripción, el tipo o la ubicación de un reporte que la propia cuenta creó.',
    queBloquea: 'No permite tocar reportes de otras personas: para eso hace falta moderación.',
    ejemplo: 'Un funcionario corrige la dirección de un reporte que él mismo levantó.',
    modulo: 'permisos-incidencias'
  },
  cambiar_estado: {
    etiqueta: 'Cambiar estado',
    quePermite: 'Mover una incidencia entre reportada, en proceso y resuelta (salvo la resolución final).',
    queBloquea: 'Sin él, el selector de estado se oculta y la API responde 403.',
    ejemplo: 'El funcionario marca una fuga como «en proceso» al enviar la cuadrilla.',
    modulo: 'permisos-incidencias'
  },
  resolver: {
    etiqueta: 'Resolver incidencias',
    quePermite: 'Cerrar un reporte como resuelto y registrar la fecha de resolución.',
    queBloquea: 'Sin este permiso el reporte puede avanzar pero no cerrarse.',
    ejemplo: 'El funcionario cierra el bache después de repararlo.',
    modulo: 'permisos-incidencias'
  },
  moderar: {
    etiqueta: 'Moderar contenido',
    quePermite: 'Ocultar reportes o comentarios y resolver denuncias de la ciudadanía.',
    queBloquea: 'Sin él, la cola de moderación es de solo lectura.',
    ejemplo: 'Se oculta un reporte con datos personales de un vecino.',
    riesgo: 'Ocultar contenido retira publicaciones del mapa público; conviene revisar la denuncia antes.',
    modulo: 'permisos-incidencias'
  },
  ver_moderacion: {
    etiqueta: 'Ver cola de moderación',
    quePermite: 'Consultar denuncias pendientes y publicaciones ocultas.',
    queBloquea: 'No permite ocultar ni sancionar: eso lo decide «Moderar contenido».',
    ejemplo: 'Un auditor revisa las denuncias sin poder actuar sobre ellas.',
    modulo: 'permisos-incidencias'
  },
  exportar: {
    etiqueta: 'Exportar informes',
    quePermite: 'Descargar el respaldo CSV/JSON y los informes del ámbito de la cuenta.',
    queBloquea: 'Sin él la pestaña de informes no ofrece descarga.',
    ejemplo: 'El enlace estatal descarga el informe mensual de sus estados.',
    riesgo: 'El archivo incluye datos personales del personal de su ámbito; no debe compartirse fuera.',
    modulo: 'permisos-monitoreo'
  },
  ver_usuarios: {
    etiqueta: 'Ver usuarios',
    quePermite: 'Listar las cuentas del personal dentro del alcance territorial de la sesión.',
    queBloquea: 'No muestra ciudadanos (eso es exclusivo del administrador maestro) ni permite editar.',
    ejemplo: 'Un funcionario consulta qué compañeros tiene asignados en su municipio.',
    modulo: 'permisos-usuarios'
  },
  crear_usuarios: {
    etiqueta: 'Crear usuarios',
    quePermite: 'Dar de alta cuentas del personal dentro del propio ámbito.',
    queBloquea: 'Quien no es administración solo puede crear funcionarios; nunca administradores.',
    ejemplo: 'El administrador municipal abre la cuenta de un nuevo funcionario de su municipio.',
    riesgo: 'Cada cuenta es una llave de acceso al territorio: conviene revisar el nombre y el correo.',
    modulo: 'permisos-usuarios'
  },
  editar_usuarios: {
    etiqueta: 'Editar usuarios',
    quePermite: 'Cambiar nombre, correo, rol, territorio y estado de una cuenta de su ámbito.',
    queBloquea: 'No permite cambiar contraseñas ni permisos salvo que la cuenta sea de administración.',
    ejemplo: 'Se amplía el territorio de una funcionaria a dos municipios.',
    modulo: 'permisos-usuarios'
  },
  eliminar_usuarios: {
    etiqueta: 'Desactivar usuarios',
    quePermite: 'Aplicar la baja lógica: la cuenta deja de poder entrar pero conserva su historial.',
    queBloquea: 'No borra datos ni permite desactivar al último administrador.',
    ejemplo: 'Se desactiva la cuenta de un funcionario que cambió de dependencia.',
    modulo: 'permisos-usuarios'
  },
  gestionar_usuarios: {
    etiqueta: 'Gestionar usuarios (todo)',
    quePermite: 'Concede de una vez ver, crear, editar y desactivar cuentas, además de resolver solicitudes de acceso.',
    queBloquea: 'Sigue sin permitir tocar cuentas de administración fuera del administrador maestro.',
    ejemplo: 'Se usa para conservar el comportamiento anterior a V2.10 sin marcar cuatro casillas.',
    riesgo: 'Es un permiso paraguas: si solo se necesita consultar, concede únicamente «Ver usuarios».',
    modulo: 'permisos-usuarios'
  },
  ver_claves: {
    etiqueta: 'Ver claves y sesiones',
    quePermite: 'Consultar las claves de acceso, su territorio, quién las usa y sus sesiones.',
    queBloquea: 'No permite crear, revocar ni eliminar claves.',
    ejemplo: 'El administrador revisa qué claves están activas en su estado.',
    modulo: 'permisos-claves'
  },
  crear_claves: {
    etiqueta: 'Crear claves',
    quePermite: 'Generar una clave que fija el territorio y los permisos de quien entre con ella.',
    queBloquea: 'Solo la administración puede crear claves; un funcionario usa la suya pero no genera otras.',
    ejemplo: 'Se crea la clave «Maravatío · funcionario» para entregarla en mano.',
    riesgo: 'La clave es un segundo factor: se entrega una sola vez y no debe reenviarse por correo.',
    modulo: 'permisos-claves'
  },
  editar_claves: {
    etiqueta: 'Revocar claves',
    quePermite: 'Revocar una clave vigente y cerrar de inmediato las sesiones abiertas con ella.',
    queBloquea: 'No permite cambiar su territorio ni sus permisos: eso exige crear otra clave.',
    ejemplo: 'Se revoca la clave de un equipo que terminó su comisión.',
    modulo: 'permisos-claves'
  },
  eliminar_claves: {
    etiqueta: 'Eliminar claves',
    quePermite: 'Borrar definitivamente una clave y cerrar sus sesiones.',
    queBloquea: 'No se puede deshacer: la clave desaparece del listado.',
    ejemplo: 'Se elimina una clave creada por error durante una prueba.',
    riesgo: 'Prefiere revocar si quieres conservar el rastro histórico de la clave.',
    modulo: 'permisos-claves'
  },
  gestionar_claves: {
    etiqueta: 'Gestionar claves (todo)',
    quePermite: 'Concede ver, crear, revocar y eliminar claves de acceso.',
    queBloquea: 'No concede los avisos por clave, que tienen su propio permiso.',
    ejemplo: 'Habilita a un administrador municipal a mantener las claves de su municipio.',
    riesgo: 'Es un permiso sensible: una clave mal configurada puede abrir territorio ajeno.',
    modulo: 'permisos-claves'
  },
  ver_avisos_clave: {
    etiqueta: 'Ver avisos por clave',
    quePermite: 'Consultar qué municipios reciben avisos por cada clave.',
    queBloquea: 'No permite cambiar la configuración.',
    ejemplo: 'Se revisa si la clave de Maravatío tiene avisos activos.',
    modulo: 'permisos-avisos-clave'
  },
  editar_avisos_clave: {
    etiqueta: 'Configurar avisos por clave',
    quePermite: 'Elegir los municipios donde una clave recibe avisos y revocarlos o reactivarlos.',
    queBloquea: 'No invalida la clave para iniciar sesión; solo limita sus notificaciones.',
    ejemplo: 'Se revocan los avisos de una clave que ya no atiende el territorio.',
    modulo: 'permisos-avisos-clave'
  },
  gestionar_avisos_clave: {
    etiqueta: 'Gestionar avisos por clave (todo)',
    quePermite: 'Concede ver y configurar los avisos por clave.',
    queBloquea: 'No permite crear ni revocar las claves.',
    ejemplo: 'Permite a un administrador ajustar los avisos de su estado sin tocar las claves.',
    modulo: 'permisos-avisos-clave'
  },
  ver_auditoria: {
    etiqueta: 'Ver bitácora de auditoría',
    quePermite: 'Consultar quién hizo cada escritura, con qué rol, clave y resultado.',
    queBloquea: 'No muestra lecturas (salvo las consultas de contraseña, que se registran aparte).',
    ejemplo: 'El administrador revisa quién consultó una contraseña la semana pasada.',
    riesgo: 'La bitácora contiene datos de actividad del personal: trátala como información reservada.',
    modulo: 'permisos-sistema'
  },
  ver_incidencias_panel: {
    etiqueta: 'Ver pestaña de incidencias',
    quePermite: 'Abrir la pestaña que lista y filtra los reportes del ámbito.',
    queBloquea: 'Sin él la pestaña no aparece, aunque se tenga el resto del panel.',
    ejemplo: 'Un auditor consulta las incidencias de sus estados.',
    modulo: 'permisos-incidencias'
  },
  ver_tipos: {
    etiqueta: 'Ver tipos',
    quePermite: 'Consultar el catálogo de tipos de incidencia.',
    queBloquea: 'No permite agregar ni eliminar conceptos.',
    ejemplo: 'El funcionario consulta qué tipos existen antes de reportar.',
    modulo: 'permisos-tipos'
  },
  crear_tipos: {
    etiqueta: 'Crear tipos',
    quePermite: 'Añadir conceptos personalizados al catálogo (bache, fuga, alumbrado…).',
    queBloquea: 'El catálogo base no se puede borrar, solo los tipos personalizados.',
    ejemplo: 'Se agrega el tipo «Poda de árbol» para el municipio.',
    modulo: 'permisos-tipos'
  },
  editar_tipos: {
    etiqueta: 'Editar tipos',
    quePermite: 'Permiso reservado para una futura edición del catálogo.',
    queBloquea: 'Hoy el catálogo no permite editar un tipo: hay que eliminarlo y crearlo de nuevo.',
    ejemplo: 'Se conserva para no romper permisos creados antes de V2.10.',
    modulo: 'permisos-tipos'
  },
  eliminar_tipos: {
    etiqueta: 'Eliminar tipos',
    quePermite: 'Quitar conceptos personalizados del catálogo.',
    queBloquea: 'No elimina las incidencias que ya usan ese tipo.',
    ejemplo: 'Se retira un tipo duplicado que se creó por error.',
    modulo: 'permisos-tipos'
  },
  gestionar_tipos: {
    etiqueta: 'Gestionar tipos (todo)',
    quePermite: 'Concede ver, crear, editar y eliminar tipos.',
    queBloquea: 'No afecta a los tipos base del sistema.',
    ejemplo: 'Permite a un administrador municipal mantener su catálogo.',
    modulo: 'permisos-tipos'
  },
  ver_municipios_panel: {
    etiqueta: 'Ver municipios y fichas',
    quePermite: 'Consultar los municipios de su ámbito, sus conteos y la ficha informativa.',
    queBloquea: 'No permite aprobar fichas: eso es de administración.',
    ejemplo: 'El funcionario completa la ficha de su municipio.',
    modulo: 'permisos-mapa'
  },
  ver_zonas: {
    etiqueta: 'Ver zonas',
    quePermite: 'Consultar las colonias, comunidades y tenencias del municipio.',
    queBloquea: 'No permite modificarlas.',
    ejemplo: 'Se revisa qué zonas tiene Maravatío antes de asignar un reporte.',
    modulo: 'permisos-mapa'
  },
  gestionar_zonas: {
    etiqueta: 'Gestionar zonas',
    quePermite: 'Crear, editar y eliminar zonas del catálogo municipal.',
    queBloquea: 'No cambia el polígono del municipio.',
    ejemplo: 'Se agrega la colonia nueva al catálogo.',
    modulo: 'permisos-mapa'
  },
  ver_firmas: {
    etiqueta: 'Ver firmas y recolecciones',
    quePermite: 'Consultar firmas y recolecciones de firmas del ámbito.',
    queBloquea: 'No permite crear recolecciones nuevas ni exportar sin «Exportar informes».',
    ejemplo: 'Se revisa cuántas firmas lleva una recolección vecinal.',
    modulo: 'permisos-incidencias'
  },
  ver_monitoreo: {
    etiqueta: 'Ver monitoreo y conectados',
    quePermite: 'Consultar sesiones activas, métricas del servidor y estado de las claves.',
    queBloquea: 'No permite cerrar sesiones ni cambiar configuración.',
    ejemplo: 'El administrador revisa quién está conectado en su estado.',
    modulo: 'permisos-monitoreo'
  },
  responder_tickets: {
    etiqueta: 'Responder tickets',
    quePermite: 'Leer y responder tickets de soporte, y crear los propios.',
    queBloquea: 'No abre la cola completa ni permite cambiar prioridad o asignación.',
    ejemplo: 'Un funcionario responde la duda de una vecina sobre su reporte.',
    modulo: 'permisos-soporte'
  },
  atender_tickets: {
    etiqueta: 'Atender panel de soporte',
    quePermite: 'Abrir la cola de soporte, asignar, priorizar, cerrar y reabrir tickets.',
    queBloquea: 'Sin él la página de soporte no aparece en el menú.',
    ejemplo: 'Soporte técnico toma un ticket de «error» y lo asigna a la persona adecuada.',
    modulo: 'permisos-soporte'
  },
  configurar_notificaciones: {
    etiqueta: 'Configurar notificaciones',
    quePermite: 'Ajustar qué eventos avisan a cada rol y por qué canal.',
    queBloquea: 'No cambia las preferencias personales de cada cuenta.',
    ejemplo: 'Se desactiva el aviso de «incidencia creada» para el rol auditor.',
    modulo: 'permisos-soporte'
  },
  ver_metricas: {
    etiqueta: 'Ver estadísticas y métricas',
    quePermite: 'Ver las tarjetas, comparativos y tiempos de resolución de su ámbito.',
    queBloquea: 'No muestran territorios fuera del alcance: el servidor responde 403.',
    ejemplo: 'El funcionario ve las estadísticas de Maravatío comparadas con su estado.',
    modulo: 'permisos-monitoreo'
  },
  ver_solicitudes_acceso: {
    etiqueta: 'Ver solicitudes de acceso',
    quePermite: 'Consultar las solicitudes de alta de personal recibidas desde la pantalla pública.',
    queBloquea: 'No permite aprobarlas ni rechazarlas.',
    ejemplo: 'El administrador municipal revisa las solicitudes de su municipio.',
    modulo: 'permisos-solicitudes-acceso'
  },
  aprobar_solicitudes_acceso: {
    etiqueta: 'Aprobar solicitudes de acceso',
    quePermite: 'Autorizar el alta de una persona del personal desde la solicitud pública.',
    queBloquea: 'No crea la cuenta por sí solo: la clave y el territorio siguen siendo necesarios.',
    ejemplo: 'Se aprueba la solicitud de un enlace estatal.',
    modulo: 'permisos-solicitudes-acceso'
  },
  rechazar_solicitudes_acceso: {
    etiqueta: 'Rechazar solicitudes de acceso',
    quePermite: 'Cerrar una solicitud de acceso indicando el motivo.',
    queBloquea: 'No impide que la persona vuelva a solicitarlo más adelante.',
    ejemplo: 'Se rechaza una solicitud que pedía un territorio ajeno.',
    modulo: 'permisos-solicitudes-acceso'
  },
  ver_solicitudes_permisos: {
    etiqueta: 'Ver solicitudes de permisos',
    quePermite: 'Ver las peticiones de permisos extra que hace el personal desde «Mi cuenta».',
    queBloquea: 'Sin este permiso el bloque de solicitudes ni siquiera aparece en la pestaña Usuarios.',
    ejemplo: 'El administrador revisa qué permisos pide una funcionaria y por qué.',
    modulo: 'permisos-solicitudes-acceso'
  },
  aprobar_solicitudes_permisos: {
    etiqueta: 'Aprobar solicitudes de permisos',
    quePermite: 'Conceder los permisos pedidos como excepciones de la cuenta.',
    queBloquea: 'No permite aprobar permisos que quien aprueba no tiene (evita la escalada).',
    ejemplo: 'Se aprueba «Ver auditoría» para una funcionaria de confianza.',
    riesgo: 'Concede capacidad real de inmediato: la sesión se recarga en la siguiente petición.',
    modulo: 'permisos-solicitudes-acceso'
  },
  rechazar_solicitudes_permisos: {
    etiqueta: 'Rechazar solicitudes de permisos',
    quePermite: 'Cerrar una solicitud de permisos con una respuesta explicativa.',
    queBloquea: 'No quita permisos que la cuenta ya tuviera.',
    ejemplo: 'Se rechaza una petición de «Eliminar usuarios» sin justificación.',
    modulo: 'permisos-solicitudes-acceso'
  },
  gestionar_solicitudes_permisos: {
    etiqueta: 'Gestionar solicitudes de permisos (todo)',
    quePermite: 'Concede ver, aprobar y rechazar solicitudes de permisos.',
    queBloquea: 'No concede los permisos solicitados, solo la capacidad de resolverlos.',
    ejemplo: 'Se asigna a un administrador delegado para que atienda la bandeja.',
    modulo: 'permisos-solicitudes-acceso'
  },
  revelar_password_usuarios: {
    etiqueta: 'Consultar y restablecer contraseñas',
    quePermite: 'Ver la contraseña guardada (cifrada) de una cuenta del ámbito y generar una temporal.',
    queBloquea: 'Solo la administración lo tiene; un funcionario debe solicitarlo desde «Mi cuenta».',
    ejemplo: 'El administrador entrega de nuevo la contraseña a un funcionario que la olvidó.',
    riesgo: 'Cada consulta queda registrada en auditoría con el motivo. No compartas la contraseña por medios inseguros.',
    modulo: 'permisos-usuarios'
  },
  gestionar_solicitudes_informe: {
    etiqueta: 'Gestionar solicitudes de informe',
    quePermite: 'Previsualizar, generar, enviar o rechazar los informes que pide la ciudadanía.',
    queBloquea: 'No permite cambiar el diseño del informe (eso es «Gestionar configuración»).',
    ejemplo: 'Se genera el informe trimestral solicitado por una asociación vecinal.',
    modulo: 'permisos-monitoreo'
  },
  gestionar_legal: {
    etiqueta: 'Gestionar documentos legales',
    quePermite: 'Editar el borrador de términos y privacidad, publicarlo y restaurar versiones.',
    queBloquea: 'No permite saltarse la aceptación de la ciudadanía: al publicar, vuelve a pedirse.',
    ejemplo: 'Se publica una nueva versión del aviso de privacidad.',
    riesgo: 'Un cambio de versión obliga a todas las cuentas a aceptar de nuevo.',
    modulo: 'permisos-sistema'
  },
  gestionar_configuracion: {
    etiqueta: 'Gestionar configuración',
    quePermite: 'Cambiar límites, márgenes y diseño del informe, logo y textos generales.',
    queBloquea: 'No cambia los permisos de las cuentas.',
    ejemplo: 'Se sube el logo institucional y se ajusta el pie del informe.',
    modulo: 'permisos-sistema'
  },
  gestionar_respaldos: {
    etiqueta: 'Gestionar respaldos',
    quePermite: 'Crear, descargar, restaurar y eliminar respaldos de la base.',
    queBloquea: 'No permite respaldar solo una parte del sistema.',
    ejemplo: 'Se crea un respaldo manual antes de una migración.',
    riesgo: 'Restaurar un respaldo sobrescribe datos actuales: exige escribir RESTAURAR.',
    modulo: 'permisos-sistema'
  },
  usar_simulador: {
    etiqueta: 'Usar simulador',
    quePermite: 'Ejecutar acciones de prueba con datos marcados como simulados y revertirlas.',
    queBloquea: 'Los datos simulados no envían correos reales ni aparecen en las estadísticas.',
    ejemplo: 'Se simula el alta de una incidencia para comprobar el flujo completo.',
    modulo: 'permisos-sistema'
  },
  gestionar_publicidad: {
    etiqueta: 'Gestionar publicidad, QR y campañas',
    quePermite: 'Crear piezas, generar QR, exportar y administrar campañas de correo.',
    queBloquea: 'No envía campañas sin confirmar la suscripción de los destinatarios.',
    ejemplo: 'Se diseña una publicación para redes con QR al formulario de reporte.',
    modulo: 'permisos-sistema'
  },
  gestionar_correos: {
    etiqueta: 'Gestionar correos institucionales',
    quePermite: 'Mantener el directorio de correos, verificarlos y asignarlos a una clave.',
    queBloquea: 'No envía correos masivos: eso es de las campañas.',
    ejemplo: 'Se asigna el correo verificado del municipio a su clave de acceso.',
    modulo: 'permisos-sistema'
  }
};
