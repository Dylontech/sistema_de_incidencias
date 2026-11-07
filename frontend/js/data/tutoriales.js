/**
 * Catálogo de tutoriales.
 *
 * Cada guía declara los roles que pueden verla y sus pasos. El controlador
 * filtra además por visibilidad real del elemento, para que un anónimo nunca
 * vea pasos de funciones que exigen cuenta o permisos de administración.
 */

const TODOS = [
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
const CON_CUENTA = TODOS.filter((r) => r !== 'anonimo');
const PERSONAL = [
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
const ADMIN = ['admin'];
const ADMIN_Y_FUNCIONARIO = ['funcionario', 'admin_municipal', 'admin_estatal', 'admin'];

const paso = (objetivo, titulo, texto, colocacion = 'auto', simulacion = null) => ({
  objetivo,
  titulo,
  texto,
  colocacion,
  ...(simulacion ? { simulacion } : {})
});

export const GUIA_TUTORIALES = [
  {
    id: 'bienvenida',
    titulo: 'Primeros pasos',
    descripcion: 'Mapa, reportes, filtros y avisos principales.',
    categoria: 'Ciudadanía',
    roles: TODOS,
    pasos: [
      { centrado: true, titulo: '¡Bienvenido!', texto: 'Este recorrido te muestra dónde está cada cosa sin salir de la vista principal.' },
      paso('#municipioBuscar', 'Tu municipio', 'Desde aquí puedes buscar y cambiar el municipio activo.', 'abajo'),
      paso('.filters', 'Filtros', 'Filtra los reportes por texto, estado, tipo, antigüedad o comunidad.', 'derecha'),
      paso('#listaIncidencias', 'Los reportes', 'Toca una tarjeta para ver el detalle, los comentarios y el seguimiento.', 'derecha'),
      paso('#map', 'El mapa', 'Los puntos muestran los reportes y su color indica la antigüedad.', 'dentro-abajo'),
      paso('.fab.primary', 'Reportar', 'El botón + abre el formulario para crear una incidencia.', 'izquierda'),
      paso('[data-action="notificaciones:toggle"]', 'Tus avisos', 'La campana reúne los cambios de tus reportes y los avisos del sistema.', 'abajo'),
      { centrado: true, titulo: '¡Listo!', texto: 'Puedes repetir esta guía desde la enciclopedia de tutoriales.' }
    ]
  },
  {
    id: 'reportar',
    titulo: 'Reportar una incidencia',
    descripcion: 'Tipo, ubicación, fotografías y firma del reporte.',
    categoria: 'Ciudadanía',
    roles: TODOS,
    pasos: [
      paso('.fab.primary', 'Abre el reporte', 'El botón + abre el formulario. Elige el tipo, describe el problema y marca la ubicación en el mapa.', 'izquierda'),
      paso('#incTitulo', 'Paso 1: describe el problema', 'En la demo se abre el formulario y se rellena un título y una descripción de ejemplo; no se envía nada.', 'auto', { tipo: 'demoReportar' }),
      paso('#incDescripcion', 'Paso 2: explica el detalle', 'Añade referencias claras para que el personal pueda localizar el problema.', 'auto', { tipo: 'demoReportar' }),
      paso('#map', 'Paso 3: elige la ubicación en el mapa', 'Al pulsar «Elegir en el mapa» el formulario se oculta para que puedas tocar el punto. La demo cierra el modal para mostrarte el mapa.', 'dentro-abajo', { tipo: 'demoReportarMapa' }),
      paso('#incFirmaBox', 'Paso 4: firma y evidencia', 'Al volver al formulario decides si firmas con tu nombre o publicas como anónimo, y puedes adjuntar fotografías.', 'auto', { tipo: 'demoReportarReabrir' }),
      paso('[data-action="incidencias:guardar"]', 'Paso 5: envía el reporte', 'El botón Enviar reporte solo se usa cuando la ubicación y los datos están completos. En esta demo no se guarda nada.', 'abajo')
    ]
  },
  {
    id: 'comentar',
    titulo: 'Comentar y reportar abuso',
    descripcion: 'Normas, denuncias y restricciones.',
    categoria: 'Ciudadanía',
    roles: TODOS,
    pasos: [
      paso('#listaIncidencias', 'Abre un reporte', 'Toca una tarjeta para ver el detalle y la sección de comentarios.', 'derecha'),
      paso('#modalDetalle', 'Comenta con respeto', 'La demo abre el detalle del primer reporte. No publiques datos personales ni spam.', 'auto', { tipo: 'demoComentar' }),
      paso('#listaIncidencias', 'Vuelve a la lista', 'La demo cierra el detalle para que puedas seguir recorriendo los reportes y el mapa.', 'derecha', { tipo: 'demoCerrarDetalle' }),
      paso('#notif-badge', 'Recibe avisos', 'Si tienes cuenta, la campana te avisa cuando alguien comenta tu reporte.', 'abajo')
    ]
  },
  {
    id: 'firmar',
    titulo: 'Firmar una incidencia',
    descripcion: 'Meta, firmas y descarga del documento.',
    categoria: 'Participación',
    roles: CON_CUENTA,
    pasos: [
      paso('#listaIncidencias', 'Elige una incidencia', 'Abre un reporte y busca la sección «Firmas ciudadanas».', 'derecha'),
      paso('#modalDetalle', 'Firma y comparte', 'La demo abre el detalle del primer reporte. Cada cuenta puede firmar una vez por incidencia y hasta el máximo configurado.', 'auto', { tipo: 'demoFirmar' }),
      paso('#listaIncidencias', 'Vuelve a la lista', 'La demo cierra el detalle para que puedas volver a la lista y al mapa.', 'derecha', { tipo: 'demoCerrarDetalle' }),
      {
        ...paso(
          '#btn-admin',
          'El admin media',
          'El administrador revisa las recolecciones, descarga la lista y puede enviarla al funcionario.',
          'abajo'
        ),
        soloRoles: PERSONAL
      }
    ]
  },
  {
    id: 'contacto',
    titulo: 'Contactar a un funcionario',
    descripcion: 'Estado, municipio y selección de funcionarios.',
    categoria: 'Participación',
    roles: CON_CUENTA,
    pasos: [
      paso('[data-action="contacto:abrir"]', 'Abre el contacto', 'Elige estado y municipio. Solo verás funcionarios de ese municipio.', 'derecha'),
      paso('#conEstado', 'Paso 1: elige el territorio', 'La demo abre el formulario y selecciona un estado y un municipio de ejemplo.', 'auto', { tipo: 'demoContacto' }),
      paso('#conFuncionarios', 'Selecciona destinatarios', 'Puedes elegir uno o varios. No se piden nombre, correo ni teléfono: tu cuenta es la identidad.', 'auto'),
      paso('#conSinFuncionario', 'Si no hay funcionarios', 'Avisa al administrador o crea una recolección de firmas para que el municipio se sume.', 'auto')
    ]
  },
  {
    id: 'notificaciones',
    titulo: 'Notificaciones e historial',
    descripcion: 'Enlaces directos, archivo y restauración.',
    categoria: 'Cuenta',
    roles: CON_CUENTA,
    pasos: [
      paso('[data-action="notificaciones:toggle"]', 'Abre la campana', 'Cada aviso abre su origen: incidencia, ticket, mensaje o contacto.', 'abajo', { tipo: 'demoNotificaciones' }),
      paso('[data-action="notificaciones:historial"]', 'Historial', 'Archivar no borra: puedes buscar por texto, evento o fecha y restaurar el aviso.', 'abajo', { tipo: 'demoNotificaciones', historial: true })
    ]
  },
  {
    id: 'folios',
    titulo: 'Mis folios y trámites',
    descripcion: 'Buscar un folio y abrir su origen.',
    categoria: 'Cuenta',
    roles: CON_CUENTA,
    pasos: [
      paso('[data-action="folios:abrir"]', 'Abre el buscador', 'El botón «Mis folios» reúne incidencias, tickets, informes, contacto y firmas.', 'derecha'),
      paso('#foliosTexto', 'Paso 1: busca un folio', 'La demo abre el buscador y escribe el inicio de un folio. No consulta datos reales.', 'auto', { tipo: 'demoFolios' })
    ]
  },
  {
    id: 'informes',
    titulo: 'Solicitar un informe',
    descripcion: 'Fechas, territorios y tipos de incidencia.',
    categoria: 'Informes',
    roles: CON_CUENTA,
    pasos: [
      paso('#demoInformeNombre', 'Abre el formulario', 'La demo abre el formulario de solicitud dentro de esta misma pantalla; no navega a otra vista.', 'auto', { tipo: 'demoInforme' }),
      paso('#demoInformeNombre', 'Paso 1: tus datos', 'Escribe tu nombre y tu correo. En el formulario real son los datos de contacto del informe.', 'auto', { tipo: 'demoInforme', campos: [{ selector: '#demoInformeNombre', valor: 'Vecina Ejemplo' }] }),
      paso('#demoInformeCorreo', 'Paso 2: el correo', 'El informe se envía al correo que confirmes; aquí solo lo simulamos.', 'auto', { tipo: 'demoInforme', campos: [{ selector: '#demoInformeCorreo', valor: 'demo@ejemplo.mx' }] }),
      paso('#demoInformeTerritorio', 'Paso 3: estado', 'Escribe o elige un estado; se abre su bloque con la lista de municipios.', 'auto', { tipo: 'demoInforme', estadoFiltro: true }),
      paso('#demoInformeTerritorio', 'Paso 4: municipios', 'Escribe para filtrar y marca municipios concretos, o «Seleccionar todos los municipios» para incluir todo el estado. Debajo puedes añadir otro estado.', 'auto', { tipo: 'demoInforme', seleccionarEstado: true }),
      paso('#demoInformeDesde', 'Paso 5: fechas', 'Define el periodo. La página real no permite fechas futuras ni superar el máximo configurado.', 'auto', { tipo: 'demoInforme', campos: [{ selector: '#demoInformeDesde', valor: '2026-01-01' }, { selector: '#demoInformeHasta', valor: '2026-10-26' }] }),
      paso('#demoInformeTipos', 'Paso 6: tipos y formato', 'Elige los tipos de incidencia y si quieres PDF o CSV.', 'auto', { tipo: 'demoInforme', campos: [{ selector: '#demoInformeTipos', valor: 'bache' }, { selector: '#demoInformeFormato', valor: 'pdf' }] }),
      paso('#demoInformeTerminos', 'Paso 7: aviso de privacidad', 'En la aplicación real ya aceptaste los términos al entrar y el aviso se consulta en un modal. Esta casilla de la demo representa esa aceptación global.', 'auto', { tipo: 'demoInforme', check: { selector: '#demoInformeTerminos', valor: true } }),
      paso('[data-action="tutorial:demoInforme:fin"]', 'Paso 8: envía (demo)', 'Este botón solo muestra un folio ficticio; no se registra ninguna solicitud.', 'auto', { tipo: 'demoInforme' })
    ]
  },
  {
    id: 'tickets',
    titulo: 'Tickets de soporte',
    descripcion: 'Reportar un problema técnico o de cuenta.',
    categoria: 'Soporte',
    roles: CON_CUENTA,
    pasos: [
      paso('#demoTicketAsunto', 'Abre el formulario', 'La demo abre el formulario de ticket dentro de esta misma pantalla; no navega a otra vista.', 'auto', { tipo: 'demoTicket' }),
      paso('#demoTicketAsunto', 'Paso 1: asunto', 'Resume el problema en una frase. En la demo se rellena solo.', 'auto', { tipo: 'demoTicket', campos: [{ selector: '#demoTicketAsunto', valor: 'El mapa no carga en mi teléfono' }] }),
      paso('#demoTicketCuerpo', 'Paso 2: detalle', 'Indica pantalla, acción y mensaje de error. Cuanto más concreto, mejor.', 'auto', { tipo: 'demoTicket', campos: [{ selector: '#demoTicketCuerpo', valor: 'Al abrir el mapa queda en blanco desde la última actualización.' }] }),
      paso('[data-action="tutorial:demoTicket:fin"]', 'Paso 3: envía (demo)', 'Este botón solo muestra un folio ficticio; no se crea ningún ticket.', 'auto', { tipo: 'demoTicket' })
    ]
  },
  {
    id: 'mapa',
    titulo: 'Capas del mapa',
    descripcion: 'Satélite, satélite con etiquetas, calles y relieve.',
    categoria: 'Mapa',
    roles: TODOS,
    pasos: [
      paso('#map', 'Cambia de capa', 'Arriba a la derecha puedes elegir Satélite, Satélite con etiquetas, Calles o Relieve. La elección se recuerda.', 'dentro-abajo', { tipo: 'demoMapa', capa: 'satelite' }),
      paso('.mapa-capas', 'Selector accesible', 'Cada botón indica la capa activa. En móvil se muestran solo los iconos.', 'izquierda', { tipo: 'demoMapa', capa: 'calles' }),
      paso('[data-action="mapa:centrarUsuario"]', 'Tu ubicación', 'El botón de la diana centra el mapa en tu GPS y deja un marcador azul con forma de persona. No se confunde con los pines de las incidencias.', 'izquierda')
    ]
  },
  {
    id: 'cuenta',
    titulo: 'Crear una cuenta',
    descripcion: 'Avisos, firmas, folios y contacto.',
    categoria: 'Cuenta',
    roles: ['anonimo', 'ciudadano'],
    pasos: [
      paso('#notaCuenta', 'Crea tu cuenta', 'Con una cuenta recibes avisos, puedes firmar, contactar funcionarios y consultar tus folios.', 'derecha'),
      {
        ...paso(
          '#reg-nombre',
          'Paso 1: tus datos',
          'El alta queda abierta para que veas el formulario completo. Escribe el nombre con el que entrarás; no se crea ninguna cuenta.',
          'auto',
          { tipo: 'demoCuenta' }
        ),
        contexto: { vista: 'login', modo: 'registro' },
        foco: '#loginScreen .login-card',
        soloAnonimo: true
      },
      {
        ...paso(
          '#reg-correo',
          'Registro',
          'El correo es solo para avisos. Para entrar usarás el nombre o el pseudónimo y tu contraseña; el pseudónimo se sortea libre de repeticiones.',
          'auto'
        ),
        contexto: { vista: 'login', modo: 'registro' },
        foco: '#loginScreen .login-card',
        soloAnonimo: true
      }
    ]
  },
  {
    id: 'admin-general',
    titulo: 'Panel de administración',
    descripcion: 'Secciones, permisos y alcance.',
    categoria: 'Administración',
    roles: PERSONAL,
    pasos: [
      paso('.admin-tabs', 'Pestañas del panel', 'El panel muestra solo las pestañas que tu rol y permisos permiten.', 'auto'),
      paso('#panel-stats', 'Estadísticas del territorio', 'Estadísticas, incidencias, tipos, municipios con ficha, claves, zonas, usuarios con roles y permisos, tickets, moderación, firmas, legal, configuración, respaldos, simulador, publicidad con campañas y correos.', 'auto')
    ]
  },
  {
    id: 'admin-firmas',
    titulo: 'Firmas y recolecciones',
    descripcion: 'Mediación y envío al funcionario.',
    categoria: 'Administración',
    roles: ADMIN_Y_FUNCIONARIO,
    pasos: [
      paso('[data-action="admin:tab"][data-valor="firmas"]', 'Firmas', 'El admin ve todas las recolecciones; el funcionario solo las de sus municipios y no puede modificarlas.', 'abajo'),
      paso('#firmasAdminLista', 'Recolecciones', 'Aquí aparecen las firmas de tu alcance y el detalle de cada recolección.', 'auto')
    ]
  },
  {
    id: 'admin-legal',
    titulo: 'Legal: términos, privacidad y acerca de',
    descripcion: 'Borrador, vista previa y publicación.',
    categoria: 'Administración',
    roles: ADMIN,
    pasos: [
      paso('[data-action="admin:tab"][data-valor="legal"]', 'Editor legal', 'Elige el documento, edita con las herramientas permitidas y revisa la vista previa.', 'abajo'),
      paso('#legalEditor', 'Borrador y publicación', 'Guardar borrador no cambia la vista pública. Publicar actualiza la versión y guarda historial.', 'auto')
    ]
  },
  {
    id: 'admin-informes',
    titulo: 'Solicitudes de informe',
    descripcion: 'Previsualizar, generar y enviar.',
    categoria: 'Administración',
    roles: ADMIN,
    pasos: [
      paso('[data-action="admin:tab"][data-valor="solicitudes-informe"]', 'Solicitudes de informe', 'Revisa las solicitudes públicas, previsualiza el PDF/CSV, genera el archivo y envíalo.', 'abajo')
    ]
  },
  {
    id: 'admin-respaldos',
    titulo: 'Respaldos y restauración',
    descripcion: 'Buscar, descargar y restaurar.',
    categoria: 'Administración',
    roles: ADMIN,
    pasos: [
      paso('[data-action="admin:tab"][data-valor="respaldos"]', 'Respaldos', 'Puedes crear un respaldo manual, buscarlo por nombre, descargarlo y restaurarlo.', 'abajo'),
      paso('#respaldosTexto', 'Buscador con botón', 'Escribe el nombre o la nota y pulsa Buscar. La restauración exige escribir RESTAURAR.', 'auto')
    ]
  },
  {
    id: 'admin-configuracion',
    titulo: 'Configuración global',
    descripcion: 'Firmas, informes, comentarios y respaldos.',
    categoria: 'Administración',
    roles: ADMIN,
    pasos: [
      paso('[data-action="admin:tab"][data-valor="configuracion"]', 'Configuración', 'Ajusta el máximo de firmas por cuenta, los meses máximos de informe y las reglas de comentarios.', 'abajo')
    ]
  },
  {
    id: 'admin-moderacion',
    titulo: 'Moderación y restricciones',
    descripcion: 'Denuncias, advertencias y comentarios.',
    categoria: 'Administración',
    roles: ADMIN_Y_FUNCIONARIO,
    pasos: [
      paso('[data-action="admin:tab"][data-valor="moderacion"]', 'Moderación', 'Atiende denuncias, oculta contenido y restringe comentarios de cuentas problemáticas.', 'abajo')
    ]
  },
  {
    id: 'admin-campanas',
    titulo: 'Campañas de correo',
    descripcion: 'Suscriptores confirmados y baja en un clic.',
    categoria: 'Administración',
    roles: ADMIN,
    vista: 'panel',
    tab: 'publicidad',
    pasos: [
      paso('[data-action="admin:tab"][data-valor="publicidad"]', 'Publicidad y campañas', 'El generador y las campañas comparten pestaña. Baja hasta «Campañas de correo».', 'abajo'),
      paso('#campNombre', 'Solo suscriptores confirmados', 'La demo abre el editor y rellena una campaña de ejemplo. Cada mensaje lleva baja en un clic y aviso de privacidad; no se envía nada.', 'auto', { tipo: 'demoCampana' })
    ]
  },
  {
    id: 'admin-simulador',
    titulo: 'Simulador de acciones',
    descripcion: 'Probar flujos y revertir datos simulados.',
    categoria: 'Administración',
    roles: ADMIN,
    pasos: [
      paso('[data-action="admin:tab"][data-valor="simulador"]', 'Simulador', 'Elige un rol, ejecuta acciones y revisa la cadena. Todo queda marcado como SIMULADO y se puede revertir.', 'abajo')
    ]
  },
  {
    id: 'admin-publicidad',
    titulo: 'Publicidad en redes',
    descripcion: 'Generar contenido, QR y enlaces.',
    categoria: 'Administración',
    roles: ADMIN,
    pasos: [
      paso('#publicidadTitulo', 'Publicidad', 'La demo rellena una publicación de ejemplo y muestra la vista previa sin guardarla.', 'abajo', { tipo: 'demoPublicidad' })
    ]
  },
  {
    id: 'admin-correos',
    titulo: 'Correos institucionales',
    descripcion: 'Directorio, CSV, invitaciones y clave municipal.',
    categoria: 'Administración',
    roles: ADMIN,
    vista: 'panel',
    tab: 'correos',
    pasos: [
      paso('[data-action="admin:tab"][data-valor="correos"]', 'Correos institucionales', 'Registra correos verificados, importa CSV y envía invitaciones a funcionarios.', 'abajo'),
      paso('#correosBusquedas', 'Verifica y asigna', 'Cuando un correo esté verificado y tenga municipio, usa el botón de llave para asignarlo a la clave de acceso de ese municipio.', 'auto')
    ]
  },

  /* ------------------------- secciones del panel ------------------------- */
  {
    id: 'panel-stats',
    titulo: 'Estadísticas del panel',
    descripcion: 'Filtros por estado y municipio, comparación y tiempos.',
    categoria: 'Panel',
    roles: PERSONAL,
    vista: 'panel',
    tab: 'stats',
    pasos: [
      paso('[data-action="admin:tab"][data-valor="stats"]', 'Estadísticas', 'Aquí ves los totales del territorio y la distribución por tipo.', 'abajo', { tipo: 'demoStats' }),
      paso('#statsTerritorio', 'Elige el territorio', 'Busca y marca varios municipios o estados completos. Solo aparecen los que están dentro de tu alcance.', 'auto'),
      paso('[data-action="stats:aplicar"]', 'Aplica y compara', 'Al aplicar se recalculan los tiempos de resolución y la comparación por municipio y estado.', 'abajo')
    ]
  },
  {
    id: 'panel-incidencias',
    titulo: 'Incidencias del panel',
    descripcion: 'Buscar, destacar peligrosas y exportar.',
    categoria: 'Panel',
    roles: PERSONAL,
    vista: 'panel',
    tab: 'incidencias',
    pasos: [
      paso('#adminBuscar', 'Busca una incidencia', 'Filtra por título o descripción; el botón «Solo peligrosas» deja las que el personal marcó como urgentes.', 'abajo'),
      paso('#adminIncidenciasBody', 'Abre el detalle', 'Desde la tabla puedes ver, cambiar de estado o resolver. Los botones dependen de tu rol y permisos.', 'auto')
    ]
  },
  {
    id: 'panel-tipos',
    titulo: 'Tipos de incidencia',
    descripcion: 'Catálogo, iconos y ejemplos.',
    categoria: 'Panel',
    roles: PERSONAL,
    vista: 'panel',
    tab: 'tipos',
    pasos: [
      paso('#tiposLista', 'Catálogo de tipos', 'Cada tipo define el icono y el ejemplo que guía al ciudadano. Los tipos personalizados se pueden eliminar si no tienen reportes.', 'auto'),
      paso('#nuevoTipoNombre', 'Crea un tipo', 'La demo abre el alta y escribe un concepto de ejemplo. Los tipos base del sistema no se borran.', 'auto', { tipo: 'demoTipo' })
    ]
  },
  {
    id: 'panel-municipios',
    titulo: 'Municipios y fichas',
    descripcion: 'Búsqueda por estado, conteos y ficha aprobada.',
    categoria: 'Panel',
    roles: PERSONAL,
    vista: 'panel',
    tab: 'municipios',
    pasos: [
      paso('#municipiosBuscar', 'Busca y filtra', 'Escribe el nombre o elige un estado. La tabla se agrupa por entidad para no mezclar municipios de distintas entidades.', 'abajo'),
      paso('#municipiosLista', 'Revisa la carga', 'Cada fila muestra incidencias abiertas, tickets, sugerencias y personal asignado.', 'auto'),
      paso('#modalFichaMunicipio', 'Ficha municipal', 'La demo abre la ficha del municipio activo. El funcionario puede proponer la información; el administrador la aprueba o la rechaza.', 'auto', { tipo: 'demoFicha' })
    ]
  },
  {
    id: 'panel-claves',
    titulo: 'Claves de acceso',
    descripcion: 'Generar, buscar y revocar claves de municipios.',
    categoria: 'Panel',
    roles: PERSONAL,
    vista: 'panel',
    tab: 'claves',
    pasos: [
      paso('[data-action="admin:tab"][data-valor="claves"]', 'Pestaña Claves', 'Las claves se separaron de Municipios para que llegar a ellas sea directo.', 'abajo'),
      paso('#clavesLista', 'Administra las claves', 'Cada clave indica sus municipios, usos, vencimiento, correo asignado y estado. Copia el código y entrégalo con la cuenta.', 'auto'),
      paso('#claveNombre', 'Clave de ejemplo', 'La demo abre el alta y escribe un nombre ficticio. No genera ninguna clave.', 'auto', { tipo: 'demoClave', soloAdmin: true })
    ]
  },
  {
    id: 'panel-zonas',
    titulo: 'Zonas y comunidades',
    descripcion: 'Localidades del municipio y sus reportes.',
    categoria: 'Panel',
    roles: PERSONAL,
    vista: 'panel',
    tab: 'zonas',
    pasos: [
      paso('#zonasLista', 'Comunidades del municipio', 'Las zonas son las localidades del INEGI. La tabla resume reportes, pendientes y resueltos de cada una.', 'auto'),
      paso('[data-action="admin:tab"][data-valor="municipios"]', 'Cambia de municipio', 'El municipio activo se elige en la barra superior o desde Municipios; las zonas se recargan al cambiar.', 'abajo')
    ]
  },
  {
    id: 'panel-usuarios',
    titulo: 'Usuarios, roles y permisos',
    descripcion: 'Altas, roles especiales y solicitudes de permisos.',
    categoria: 'Panel',
    roles: PERSONAL,
    vista: 'panel',
    tab: 'usuarios',
    pasos: [
      paso('#usuariosLista', 'Cuentas del personal', 'Aquí ves el rol, el alcance territorial, la escritura y el estado de cada cuenta.', 'auto'),
      paso('#usuarioUsername', 'Alta de ejemplo', 'La demo abre el formulario de alta y rellena un usuario ficticio. No guarda la cuenta.', 'auto', { tipo: 'demoUsuario', soloAdmin: true }),
      paso('#btnRolesEspeciales', 'Roles especiales', 'Crea un rol con permisos extra y asígnalo a una cuenta compatible. El alcance sigue siendo el de sus municipios o estados.', 'abajo'),
      paso('#solicitudesPermisosLista', 'Solicitudes de permisos', 'El personal pide permisos desde «Mi cuenta»; apruébalos o recházalos aquí.', 'auto')
    ]
  },
  {
    id: 'panel-solicitudes',
    titulo: 'Solicitudes de acceso',
    descripcion: 'Altas de personal y claves automáticas.',
    categoria: 'Panel',
    roles: PERSONAL,
    vista: 'panel',
    tab: 'solicitudes',
    pasos: [
      paso('#solicitudesAccesoLista', 'Revisa las solicitudes', 'Al aprobar se crea la cuenta, se genera la clave de sus municipios y se envían las credenciales.', 'auto')
    ]
  },
  {
    id: 'panel-tickets',
    titulo: 'Tickets y soporte',
    descripcion: 'Cola de soporte y reglas de asignación.',
    categoria: 'Panel',
    roles: PERSONAL,
    vista: 'panel',
    tab: 'tickets',
    pasos: [
      paso('#ticketsAdminLista', 'Atiende la cola', 'Abre el hilo, responde y cierra el ticket. La prioridad y la asignación quedan en el historial.', 'auto'),
      paso('#reglasTicketsLista', 'Automatiza la asignación', 'Las reglas reparten tickets por municipio, prioridad o rol. Sin reglas quedan en «sin asignar».', 'auto', { tipo: 'demoRegla', soloAdmin: true })
    ]
  },
  {
    id: 'panel-sesiones',
    titulo: 'Sesiones conectadas',
    descripcion: 'Actividad reciente y cierre de sesión.',
    categoria: 'Panel',
    roles: PERSONAL,
    vista: 'panel',
    tab: 'sesiones',
    pasos: [
      paso('#sesionesLista', 'Monitorea accesos', 'La IP se guarda como huella SHA-256. Puedes cerrar una sesión sospechosa sin esperar a que caduque.', 'auto')
    ]
  },
  {
    id: 'panel-notificaciones',
    titulo: 'Configuración de notificaciones',
    descripcion: 'Eventos, canales y alcance.',
    categoria: 'Panel',
    roles: ADMIN,
    vista: 'panel',
    tab: 'notificaciones',
    pasos: [
      paso('#notifAdminLista', 'Matriz de avisos', 'Decide qué eventos avisan, por qué canal, a qué roles y con qué alcance territorial.', 'auto'),
      paso('[data-action="notificacionesAdmin:probar"]', 'Envía una prueba', 'Comprueba la campana o el correo antes de dar por buena la configuración.', 'abajo')
    ]
  },
  {
    id: 'panel-moderacion',
    titulo: 'Moderación',
    descripcion: 'Denuncias, contenido oculto y restricciones.',
    categoria: 'Panel',
    roles: ADMIN_Y_FUNCIONARIO,
    vista: 'panel',
    tab: 'moderacion',
    pasos: [
      paso('#denunciasLista', 'Denuncias pendientes', 'Atiende las denuncias de la comunidad: oculta el contenido, descarta el aviso o sanciona a la cuenta.', 'auto'),
      paso('#sancionesBody', 'Cuentas sancionadas', 'Aquí también se levantan restricciones de comentarios cuando el plazo termina.', 'auto')
    ]
  },
  {
    id: 'panel-firmas',
    titulo: 'Firmas y recolecciones',
    descripcion: 'Metas, firmantes y envío al funcionario.',
    categoria: 'Panel',
    roles: ADMIN_Y_FUNCIONARIO,
    vista: 'panel',
    tab: 'firmas',
    pasos: [
      paso('#firmasAdminLista', 'Recolecciones', 'El autor fija la meta y el administrador media. El funcionario solo consulta las de su municipio.', 'auto'),
      paso('#firmasAdminTexto', 'Busca por folio o título', 'Escribe y pulsa Buscar para localizar una recolección concreta.', 'abajo')
    ]
  },
  {
    id: 'panel-solicitudes-informe',
    titulo: 'Solicitudes de informe',
    descripcion: 'Previsualizar, generar y enviar.',
    categoria: 'Panel',
    roles: ADMIN,
    vista: 'panel',
    tab: 'solicitudes-informe',
    pasos: [
      paso('#solicitudesInformeLista', 'Solicitudes públicas', 'Revisa el detalle y el territorio elegido, previsualiza el PDF/CSV y genera o rechaza la solicitud.', 'auto'),
      paso('#solicitudesInformeEstado', 'Filtra por estado', 'Separa las pendientes de verificación, las enviadas y las que fallaron.', 'abajo')
    ]
  },
  {
    id: 'panel-legal',
    titulo: 'Editor legal',
    descripcion: 'Términos, privacidad y acerca de.',
    categoria: 'Panel',
    roles: ADMIN,
    vista: 'panel',
    tab: 'legal',
    pasos: [
      paso('#legalEditor', 'Edita el documento', 'Usa la barra de formato permitida. Guardar borrador no cambia la vista pública.', 'auto'),
      paso('[data-action="legal:publicar"]', 'Publica una versión', 'Publicar incrementa la versión, guarda historial y actualiza la página pública y el consentimiento.', 'abajo')
    ]
  },
  {
    id: 'panel-configuracion',
    titulo: 'Configuración global',
    descripcion: 'Límites de firmas, informes, comentarios y respaldos.',
    categoria: 'Panel',
    roles: ADMIN,
    vista: 'panel',
    tab: 'configuracion',
    pasos: [
      paso('#configuracionLista', 'Ajusta los límites', 'Cada clave explica su efecto. Los cambios se aplican en la siguiente operación o de inmediato si el formulario público la consulta.', 'auto'),
      paso('[data-action="configuracion:guardar"]', 'Guarda', 'Revisa la configuración y pulsa Guardar para persistirla.', 'abajo')
    ]
  },
  {
    id: 'panel-respaldos',
    titulo: 'Respaldos',
    descripcion: 'Crear, buscar, descargar y restaurar.',
    categoria: 'Panel',
    roles: ADMIN,
    vista: 'panel',
    tab: 'respaldos',
    pasos: [
      paso('#respaldosResumen', 'Estado de los respaldos', 'Muestra el último respaldo y cuándo toca el siguiente automático.', 'auto'),
      paso('#respaldosTexto', 'Busca un respaldo', 'Escribe el nombre o la nota y pulsa Buscar. Restaurar exige escribir RESTAURAR.', 'abajo')
    ]
  },
  {
    id: 'panel-simulador',
    titulo: 'Simulador de acciones',
    descripcion: 'Probar flujos con roles reales, simular vialidades y revertir.',
    categoria: 'Panel',
    roles: ADMIN,
    vista: 'panel',
    tab: 'simulador',
    pasos: [
      paso('#simuladorRol', 'Elige el rol y el municipio', 'El simulador crea una cuenta temporal con ese rol y ejecuta acciones reales marcadas como simuladas.', 'abajo'),
      paso('#simViaBueno', 'Simula el estado de las vialidades', 'Distribuye los tramos por porcentajes (bueno, leve, regular, malo y crítico). Deben sumar 100%; no modifica los datos reales.', 'abajo'),
      paso('#simuladorJournal', 'Revisa y revierte', 'Cada operación queda en el journal; revertir borra lo simulado sin tocar datos reales.', 'auto')
    ]
  },
  {
    id: 'panel-vialidades',
    titulo: 'Catálogo de vialidades',
    descripcion: 'Delimitar polígonos de calles y carreteras, importar KML/GeoJSON u OSM y verificar la condición.',
    categoria: 'Panel',
    roles: ['admin_municipal', 'admin_estatal', 'admin'],
    vista: 'panel',
    tab: 'vialidades',
    pasos: [
      paso('#vialidadesMunicipioFiltro', 'Elige el municipio', 'La lista muestra las vialidades reales de tu alcance y las que están sin verificar o con más de 180 días.', 'abajo'),
      paso('#vialidadesResumen', 'Revisa el estado actual', 'El resumen indica cuántas vialidades tienen reportes, cuántas están sin reportes y cuántas esperan verificación.', 'auto'),
      paso('#vialidadesLista', 'Edita o verifica', 'Cada fila enlaza a Google Maps y permite editar el eje/polígono, el ancho de calzada, marcarlo verificado o archivarlo.', 'auto'),
      paso('#vialidadesArchivo', 'Importa la red real', 'Puedes cargar un KML/GeoJSON con polígonos o ejecutar «Cargar red real (OSM)». La importación fusiona por clave/OSM y conserva notas y enlaces manuales; «Reemplazar todo» es opcional.', 'abajo')
    ]
  },
  {
    id: 'panel-auditoria',
    titulo: 'Auditoría y reportes',
    descripcion: 'Filtrar por fecha, tipo y autor, y descargar el informe.',
    categoria: 'Panel',
    roles: PERSONAL,
    vista: 'panel',
    tab: 'auditoria',
    pasos: [
      paso('#auditoriaUsuario', 'Filtra por autor y tipo', 'Combina autor, tipo de acción (alta, cambio, baja), ruta y rango de fechas.', 'abajo'),
      paso('#auditoriaEnciclopedia', 'Consulta la enciclopedia', 'Explica qué significa cada columna y qué se guarda (y qué nunca se guarda) en la bitácora.', 'auto'),
      paso('#auditoriaLista', 'Revisa el resultado', 'Cada fila conserva actor, rol, entidad, resultado HTTP, clave e huella de IP.', 'auto'),
      paso('[data-action="auditoria:pdf"]', 'Descarga el informe', 'PDF o CSV usan exactamente los filtros activos; el archivo incluye el detalle saneado.', 'arriba')
    ]
  },
  {
    id: 'panel-publicidad',
    titulo: 'Publicidad y campañas',
    descripcion: 'Editor, colores, QR y envío de campañas.',
    categoria: 'Panel',
    roles: ADMIN,
    vista: 'panel',
    tab: 'publicidad',
    pasos: [
      paso('#publicidadTitulo', 'Estructura la pieza', 'Completa gancho, desarrollo y llamado a la acción; elige la estructura y personaliza los colores.', 'abajo', { tipo: 'demoPublicidad' }),
      paso('#publicidadColorPrimario', 'Personaliza los colores', 'El color principal tiñe la cabecera y el QR; el secundario se usa en el texto destacado.', 'abajo'),
      paso('#publicidadLista', 'Edita o reutiliza', 'Cada publicación guardada se puede editar o descargar en SVG. Abajo están las campañas de correo.', 'auto')
    ]
  },

  /* ------------------------------ monitoreo ------------------------------ */
  {
    id: 'monitoreo',
    titulo: 'Monitoreo en vivo',
    descripcion: 'Filtros, KPIs y cambios de estado.',
    categoria: 'Monitoreo',
    roles: PERSONAL,
    vista: 'monitoreo',
    pasos: [
      paso('#monitoreoKpis', 'Indicadores en vivo', 'Los KPIs se recalculan cada 30 segundos con las incidencias de tu alcance.', 'auto'),
      paso('#monFiltroEstado', 'Filtra la cola', 'Filtra por estado, tipo de vía o antigüedad para priorizar.', 'abajo'),
      paso('#monitoreoTabla', 'Actúa desde la tabla', 'Abre el detalle o marca «en proceso» si tu cuenta puede escribir.', 'auto')
    ]
  },

  {
    id: 'soporte-panel',
    titulo: 'Bandeja de soporte técnico',
    descripcion: 'Cola de tickets, prioridad, asignación y respuesta dentro del modal.',
    categoria: 'Soporte',
    roles: ['soporte', 'admin_municipal', 'admin_estatal', 'admin'],
    pasos: [
      paso('#linkSoporte', 'Abre el panel', 'Solo las cuentas con permiso de atención ven este acceso. Dentro puedes filtrar la cola, asignar responsables y responder.', 'derecha', { tipo: 'navegar' })
    ]
  },

  /* ------------------------------- informes ------------------------------- */
  {
    id: 'informes-panel',
    titulo: 'Informes y exportaciones',
    descripcion: 'Resumen, CSV, JSON e informe imprimible.',
    categoria: 'Informes',
    roles: PERSONAL,
    vista: 'informes',
    pasos: [
      paso('#reporteStats', 'Resumen del periodo', 'El modal muestra los totales y la tabla por tipo con el promedio de días.', 'auto'),
      paso('[data-action="reportes:csv"]', 'Exporta los datos', 'Descarga CSV para hoja de cálculo, JSON como respaldo o abre el informe imprimible.', 'abajo')
    ]  },

  /* --------------------------- permisos (V2.11) --------------------------- */
  {
    id: 'permisos-usuarios',
    titulo: 'Permisos de Usuarios',
    descripcion: 'Ver, crear, editar, desactivar y consultar contraseñas.',
    categoria: 'Permisos',
    roles: ADMIN,
    vista: 'panel',
    tab: 'usuarios',
    pasos: [
      paso('#usuariosLista', 'La tabla del personal', 'Cada cuenta muestra su rol, su territorio y si puede escribir. Los ciudadanos no aparecen aquí: solo los gestiona el administrador maestro.', 'auto', { tipo: 'navegar' }),
      paso('#usuarioPermisos', 'La matriz de permisos', 'Cada módulo tiene cuatro acciones. Pulsa el botón «?» de cualquier casilla para leer qué permite, qué bloquea y un ejemplo real.', 'auto', { tipo: 'demoUsuario', soloAdmin: true }),
      paso('#btnRolesEspeciales', 'Roles y permisos', 'Aquí ajustas la matriz base de cada rol del sistema, creas roles propios y repartes roles especiales.', 'abajo'),
      paso('#solicitudesPermisosLista', 'Solicitudes de permisos', 'El personal pide permisos desde «Mi cuenta». Solo quien tiene «Ver solicitudes de permisos» ve esta bandeja.', 'auto'),
      paso('#solicitudesPasswordLista', 'Solicitudes de contraseña', 'Las peticiones de cambio de contraseña se resuelven aquí: al aprobar se genera una temporal y queda auditada.', 'auto')
    ]
  },
  {
    id: 'permisos-claves',
    titulo: 'Permisos de Claves de acceso',
    descripcion: 'Qué territorio y qué permisos autoriza una clave.',
    categoria: 'Permisos',
    roles: ADMIN,
    vista: 'panel',
    tab: 'claves',
    pasos: [
      paso('#clavesLista', 'Las claves vigentes', 'Cada clave declara su código, su territorio, los permisos que concede y las sesiones abiertas con ella.', 'auto', { tipo: 'navegar' }),
      paso('#clavePermisos', 'La clave también recorta permisos', 'Al entrar con una clave, la sesión adopta su territorio y su lista de permisos. Si la clave no los declara, conserva los de la cuenta.', 'auto', { tipo: 'demoClave', soloAdmin: true }),
      paso('#claveTerritorio', 'Estado y municipios', 'Primero se elige el estado y después el municipio; «Añadir otro estado» repite el proceso.', 'auto'),
      paso('[data-action="claves:guardar"]', 'Se muestra una sola vez', 'El código se enseña al guardar y no se repite: entrégalo en mano.', 'arriba')
    ]
  },
  {
    id: 'permisos-tipos',
    titulo: 'Permisos de Tipos',
    descripcion: 'Crear y eliminar conceptos del catálogo.',
    categoria: 'Permisos',
    roles: ADMIN,
    vista: 'panel',
    tab: 'tipos',
    pasos: [
      paso('#tiposLista', 'El catálogo', 'Los tipos base del sistema no se borran; los personalizados sí, siempre que no tengan reportes asociados.', 'auto', { tipo: 'navegar' }),
      paso('[data-action="tipos:nuevo"]', 'Crear un tipo', 'La demo abre el formulario sin guardar nada: escribe un nombre, un icono y un aviso opcional.', 'abajo', { tipo: 'demoTipo', soloAdmin: true })
    ]
  },
  {
    id: 'permisos-solicitudes-acceso',
    titulo: 'Permisos de Solicitudes',
    descripcion: 'Altas de personal y peticiones de permisos extra.',
    categoria: 'Permisos',
    roles: ADMIN,
    vista: 'panel',
    tab: 'solicitudes',
    pasos: [
      paso('#solicitudesLista', 'Solicitudes de acceso', 'Llegan desde la pantalla pública de solicitud. Aprobar no crea la cuenta: hace falta la clave y el territorio.', 'auto', { tipo: 'navegar' }),
      paso('#usuariosLista', 'Solicitudes de permisos', 'Se resuelven en la pestaña Usuarios. Nadie puede aprobar permisos que no tenga: así se evita la escalada.', 'auto')
    ]
  },
  {
    id: 'permisos-avisos-clave',
    titulo: 'Permisos de Avisos por clave',
    descripcion: 'Qué municipios reciben avisos con cada clave.',
    categoria: 'Permisos',
    roles: ADMIN,
    vista: 'panel',
    tab: 'avisos-clave',
    pasos: [
      paso('#tabAvisosClave', 'Avisos por clave', 'Revocar los avisos no invalida la clave para iniciar sesión; solo deja de notificar.', 'auto', { tipo: 'navegar' }),
      paso('#avisosClaveLista', 'Subconjunto del territorio', 'Solo se pueden elegir municipios que ya pertenezcan a la clave.', 'auto')
    ]
  },
  {
    id: 'permisos-incidencias',
    titulo: 'Permisos de Incidencias y moderación',
    descripcion: 'Reportar, cambiar estado, resolver, moderar y exportar.',
    categoria: 'Permisos',
    roles: ADMIN,
    vista: 'panel',
    tab: 'incidencias',
    pasos: [
      paso('#panel-incidencias', 'Trabajo diario', 'Reportar, editar lo propio, cambiar estado y resolver son permisos separados: se puede avanzar sin cerrar.', 'auto', { tipo: 'navegar' }),
      paso('#moderacionLista', 'Moderación', 'Ocultar una publicación la retira del mapa público. Ver la cola no implica poder ocultar.', 'auto')
    ]
  },
  {
    id: 'permisos-mapa',
    titulo: 'Permisos de Mapa y catálogos',
    descripcion: 'Municipios, fichas, zonas y firmas.',
    categoria: 'Permisos',
    roles: ADMIN,
    vista: 'panel',
    tab: 'municipios',
    pasos: [
      paso('#municipiosLista', 'Municipios y fichas', 'El funcionario propone la ficha; la aprobación es de administración.', 'auto', { tipo: 'navegar' }),
      paso('#zonasLista', 'Zonas', 'Las zonas (colonias y comunidades) alimentan la geocerca y los filtros del mapa.', 'auto')
    ]
  },
  {
    id: 'permisos-soporte',
    titulo: 'Permisos de Soporte y notificaciones',
    descripcion: 'Responder, atender la cola y configurar avisos.',
    categoria: 'Permisos',
    roles: ADMIN,
    vista: 'panel',
    tab: 'tickets',
    pasos: [
      paso('#ticketsAdminLista', 'Responder no es atender', 'Responder permite contestar un ticket; atender abre la cola completa, asigna, prioriza y cierra.', 'auto', { tipo: 'navegar' }),
      paso('#notificacionesAdminLista', 'Configurar avisos', 'Decide qué eventos avisan a cada rol. No cambia las preferencias personales de cada cuenta.', 'auto')
    ]
  },
  {
    id: 'permisos-monitoreo',
    titulo: 'Permisos de Monitoreo y analítica',
    descripcion: 'Estadísticas, sesiones, auditoría e informes.',
    categoria: 'Permisos',
    roles: ADMIN,
    vista: 'panel',
    tab: 'stats',
    pasos: [
      paso('#statsTerritorio', 'Estadísticas con alcance', 'El selector solo ofrece el territorio de la sesión. Pedir otro por la API responde 403, no ceros.', 'auto', { tipo: 'demoStats', soloAdmin: true }),
      paso('#sesionesLista', 'Sesiones y auditoría', 'Monitoreo muestra las sesiones abiertas; la auditoría registra las escrituras y las consultas de contraseña.', 'auto')
    ]
  },
  {
    id: 'permisos-sistema',
    titulo: 'Permisos de Administración del sistema',
    descripcion: 'Configuración, respaldos, legal, simulador y publicidad.',
    categoria: 'Permisos',
    roles: ADMIN,
    vista: 'panel',
    tab: 'configuracion',
    pasos: [
      paso('#panel-configuracion', 'Configuración y respaldos', 'Los límites, los márgenes del informe y el logo se cambian aquí. Restaurar un respaldo sobrescribe datos.', 'auto', { tipo: 'navegar' }),
      paso('#panel-publicidad', 'Simulador y publicidad', 'El simulador no envía correos reales ni cuenta en estadísticas; la publicidad genera QR y campañas.', 'auto')
    ]
  },
  {
    id: 'panel-roles',
    titulo: 'Roles del sistema, propios y especiales',
    descripcion: 'Editar matrices, crear roles y restablecer a fábrica.',
    categoria: 'Permisos',
    roles: ADMIN,
    vista: 'panel',
    tab: 'usuarios',
    pasos: [
      paso('#btnRolesEspeciales', 'Abre «Roles y permisos»', 'Verás tres listas: roles del sistema, roles propios y roles especiales.', 'abajo', { tipo: 'navegar' }),
      paso('#rolesIntegradosLista', 'Roles del sistema', 'Edita la matriz de un rol integrado o restablécelo a los permisos de fábrica.', 'auto'),
      paso('#rolesPropiosLista', 'Roles propios', 'Un rol propio hereda el comportamiento de una plantilla (funcionario, auditor…) y añade su matriz.', 'auto'),
      paso('#rolEspecialPermisos', 'La matriz del rol', 'Los cambios se aplican a las cuentas en su siguiente petición; no hace falta reiniciar el sistema.', 'auto'),
      paso('#rolEspecialAplicar', 'Aplicar a la cuenta', 'Al guardar desde el alta de usuario, «Aplicar a esta cuenta» vuelve al formulario con los datos intactos.', 'arriba')
    ]
  },
  {
    id: 'panel-password',
    titulo: 'Consultar y restablecer contraseñas',
    descripcion: 'Acceso auditado a la contraseña cifrada.',
    categoria: 'Permisos',
    roles: ADMIN,
    vista: 'panel',
    tab: 'usuarios',
    pasos: [
      paso('#usuariosLista', 'El botón de la llave', 'Aparece solo con el permiso «Consultar y restablecer contraseñas». La contraseña se muestra difuminada.', 'auto', { tipo: 'navegar' }),
      paso('#passwordUsuarioTexto', 'La consulta queda en auditoría', 'Cada revelado se registra con tu usuario, la fecha y el motivo. La contraseña nunca se guarda en la bitácora.', 'auto'),
      paso('[data-action="password:restablecer"]', 'Restablecer', 'Genera una temporal legible. Las cuentas anteriores a V2.11 no tienen copia cifrada: solo se pueden restablecer.', 'arriba')
    ]  }
];

const PERMISO_POR_GUIA = {
  'admin-firmas': 'ver_firmas',
  'admin-legal': 'gestionar_legal',
  'admin-informes': 'gestionar_solicitudes_informe',
  'admin-respaldos': 'gestionar_respaldos',
  'admin-configuracion': 'gestionar_configuracion',
  'admin-moderacion': 'ver_moderacion',
  'admin-campanas': 'gestionar_publicidad',
  'admin-simulador': 'usar_simulador',
  'admin-publicidad': 'gestionar_publicidad',
  'admin-correos': 'gestionar_correos',
  'panel-stats': 'ver_metricas',
  'panel-incidencias': 'ver_incidencias_panel',
  'panel-tipos': 'ver_tipos',
  'panel-municipios': 'ver_municipios_panel',
  'panel-claves': 'ver_claves',
  'panel-zonas': 'ver_zonas',
  'panel-usuarios': 'ver_usuarios',
  'panel-solicitudes': 'ver_solicitudes_acceso',
  'panel-tickets': 'atender_tickets',
  'panel-sesiones': 'ver_monitoreo',
  'panel-notificaciones': 'configurar_notificaciones',
  'panel-moderacion': 'ver_moderacion',
  'panel-firmas': 'ver_firmas',
  'panel-solicitudes-informe': 'gestionar_solicitudes_informe',
  'panel-legal': 'gestionar_legal',
  'panel-configuracion': 'gestionar_configuracion',
  'panel-respaldos': 'gestionar_respaldos',
  'panel-simulador': 'usar_simulador',
  'panel-publicidad': 'gestionar_publicidad',
  'panel-roles': 'ver_usuarios',
  'panel-password': 'revelar_password_usuarios',
  'permisos-usuarios': 'ver_usuarios',
  'permisos-claves': 'ver_claves',
  'permisos-tipos': 'ver_tipos',
  'permisos-solicitudes-acceso': 'ver_solicitudes_acceso',
  'permisos-avisos-clave': 'ver_avisos_clave',
  'permisos-incidencias': 'ver_incidencias_panel',
  'permisos-mapa': 'ver_municipios_panel',
  'permisos-soporte': 'atender_tickets',
  'permisos-monitoreo': 'ver_metricas',
  'permisos-sistema': 'gestionar_configuracion',
  monitoreo: 'ver_monitoreo',
  'informes-panel': 'exportar',
  'soporte-panel': 'atender_tickets'
};

// Todas las guías deben tener al menos una demostración segura. Las que solo
// recorren una pestaña reciben «navegar»; las que tienen formulario declaran
// su propia demo en el paso correspondiente.
for (const guia of GUIA_TUTORIALES) {
  if (!guia.pasos.some((paso) => paso.simulacion)) {
    guia.pasos = guia.pasos.map((paso, indice) =>
      indice === 0 ? { ...paso, simulacion: { tipo: 'navegar' } } : paso
    );
  }
  if (PERMISO_POR_GUIA[guia.id]) guia.permiso = PERMISO_POR_GUIA[guia.id];
}

export function guiasPara(usuario) {
  const rol = usuario?.rol || 'anonimo';
  const permisos = new Set(usuario?.permisos || []);
  return GUIA_TUTORIALES.filter((guia) => {
    if (!guia.roles.includes(rol)) return false;
    if (!guia.permiso || rol === 'admin') return true;
    if (guia.id === 'panel-notificaciones') return false;
    return permisos.has(guia.permiso);
  });
}
