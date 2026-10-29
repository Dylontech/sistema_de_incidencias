/**
 * Catálogos del estudio de publicidad (solo cliente).
 *
 * No se comunican con la API: son textos, medidas y paletas que alimentan el
 * editor. Las plantillas de la biblioteca rellenan los mismos campos que ya
 * envía el editor a `/admin/publicidad/*`, así que el contrato del servidor no
 * cambia. `{municipio}` se sustituye por el municipio elegido en el editor.
 */

/** Tamaños en píxeles; son los que Canva y las redes aceptan sin recortar. */
export const FORMATOS = {
  cuadrado: { clave: 'cuadrado', nombre: 'Post cuadrado', detalle: 'Instagram · Facebook', w: 1080, h: 1080 },
  vertical: { clave: 'vertical', nombre: 'Post vertical 4:5', detalle: 'Instagram · Facebook', w: 1080, h: 1350 },
  historia: { clave: 'historia', nombre: 'Historia / Reel 9:16', detalle: 'Instagram · TikTok · estados', w: 1080, h: 1920 },
  horizontal: { clave: 'horizontal', nombre: 'Enlace / X / WhatsApp', detalle: 'Facebook · X · WhatsApp', w: 1200, h: 630 },
  portada: { clave: 'portada', nombre: 'Portada de Facebook', detalle: 'Cabecera de página', w: 1640, h: 624 },
  'cuatro-tercios': { clave: 'cuatro-tercios', nombre: 'Publicación 4:3', detalle: 'Feed y presentaciones', w: 1200, h: 900 },
  'tres-dos': { clave: 'tres-dos', nombre: 'Fotografía 3:2', detalle: 'Publicaciones editoriales', w: 1500, h: 1000 },
  banner: { clave: 'banner', nombre: 'Banner horizontal', detalle: 'Web y cabeceras', w: 1500, h: 500 },
  linkedin: { clave: 'linkedin', nombre: 'LinkedIn', detalle: 'Enlace profesional', w: 1200, h: 627 },
  personalizado: { clave: 'personalizado', nombre: 'Tamaño personalizado', detalle: 'Define ancho y alto', w: 1080, h: 1080 }
};

export const DISENOS = [
  { clave: 'banda', nombre: 'Banda superior', detalle: 'Cabecera de color, texto claro y QR' },
  { clave: 'centrado', nombre: 'Color completo', detalle: 'Fondo degradado, texto centrado' },
  { clave: 'dividido', nombre: 'Dividido', detalle: 'Bloque de color con el titular y zona clara' },
  { clave: 'tarjeta', nombre: 'Tarjeta', detalle: 'Tarjeta blanca sobre fondo de color' },
  { clave: 'pasos', nombre: 'Pasos numerados', detalle: 'Una línea del desarrollo = un paso' },
  { clave: 'marco', nombre: 'Marco editorial', detalle: 'Borde de color y aire tipográfico' },
  { clave: 'diagonal', nombre: 'Diagonal', detalle: 'Bloque inclinado y contraste fuerte' },
  { clave: 'lateral', nombre: 'Lateral', detalle: 'Titular a la izquierda y datos a la derecha' }
];

/** `familia` es lo que usa el SVG; `canva` es la fuente equivalente en Canva. */
export const FUENTES = {
  sans: { clave: 'sans', nombre: 'Moderna', familia: "'Segoe UI', Helvetica, Arial, sans-serif", ancho: 1, canva: 'Montserrat (títulos) + Open Sans (cuerpo)' },
  serif: { clave: 'serif', nombre: 'Editorial', familia: "Georgia, 'Times New Roman', serif", ancho: 1.07, canva: 'Playfair Display (títulos) + Lora (cuerpo)' },
  redondeada: { clave: 'redondeada', nombre: 'Amigable', familia: "'Trebuchet MS', Verdana, sans-serif", ancho: 1.04, canva: 'Poppins (títulos) + Nunito (cuerpo)' },
  clasica: { clave: 'clasica', nombre: 'Clásica', familia: "'Palatino Linotype', 'Book Antiqua', Palatino, serif", ancho: 1.02, canva: 'Cormorant Garamond + Source Sans' },
  condensada: { clave: 'condensada', nombre: 'Condensada', familia: "'Arial Narrow', 'Roboto Condensed', Arial, sans-serif", ancho: 0.9, canva: 'Bebas Neue + Roboto' },
  mono: { clave: 'mono', nombre: 'Técnica', familia: "'Cascadia Code', 'Courier New', monospace", ancho: 1.12, canva: 'JetBrains Mono + Inter' },
  humanista: { clave: 'humanista', nombre: 'Humanista', familia: "'Trebuchet MS', 'Gill Sans', sans-serif", ancho: 1.03, canva: 'Lato + Merriweather' },
  impacto: { clave: 'impacto', nombre: 'Impacto', familia: "Impact, 'Arial Black', sans-serif", ancho: 1.12, canva: 'Archivo Black + Roboto' }
};

export const PALETAS = [
  { clave: 'institucional', nombre: 'Institucional', primario: '#006657', secundario: '#0f3d3a' },
  { clave: 'civico', nombre: 'Azul cívico', primario: '#1d4ed8', secundario: '#172554' },
  { clave: 'alerta', nombre: 'Alerta vial', primario: '#c2410c', secundario: '#431407' },
  { clave: 'vino', nombre: 'Vino', primario: '#9f1239', secundario: '#4c0519' },
  { clave: 'noche', nombre: 'Noche', primario: '#115e59', secundario: '#0a1f1d' },
  { clave: 'sol', nombre: 'Sol', primario: '#b45309', secundario: '#451a03' }
];

export const CATEGORIAS = [
  { clave: 'todas', nombre: 'Todas' },
  { clave: 'lanzamiento', nombre: 'Lanzamiento' },
  { clave: 'participacion', nombre: 'Participación' },
  { clave: 'transparencia', nombre: 'Transparencia' },
  { clave: 'comunidad', nombre: 'Comunidad' },
  { clave: 'mias', nombre: 'Mías' }
];

/**
 * Biblioteca de piezas. `base` debe ser una clave del catálogo del servidor
 * (reportar, firmas, funcionarios, informes, reconocimiento) y `estructura`
 * una de las del servidor (anuncio, paso_a_paso, dato_clave, testimonio).
 */
export const BIBLIOTECA = [
  {
    clave: 'lanzamiento-sistema',
    categoria: 'lanzamiento',
    nombre: 'Presenta el sistema',
    base: 'reportar',
    estructura: 'anuncio',
    diseno: 'banda',
    formato: 'cuadrado',
    red: 'facebook',
    paleta: 'institucional',
    kicker: 'NUEVO EN TU MUNICIPIO',
    titulo: 'Reporta desde tu celular, sin filas ni trámites',
    texto:
      'Baches, luminarias apagadas, fugas o drenajes tapados: regístralos en minutos con foto y ubicación, y sigue el estado de tu reporte.',
    cta: 'Reporta ahora',
    hashtags: '#Reporta #MiMunicipio #CiudadaníaActiva'
  },
  {
    clave: 'tres-pasos',
    categoria: 'lanzamiento',
    nombre: 'Reportar en 3 pasos',
    base: 'reportar',
    estructura: 'paso_a_paso',
    diseno: 'pasos',
    formato: 'vertical',
    red: 'instagram',
    paleta: 'institucional',
    kicker: 'ASÍ DE FÁCIL',
    titulo: 'Reportar un problema toma 3 pasos',
    texto:
      'Entra al sistema y elige tu municipio.\nMarca el lugar en el mapa y describe qué está pasando.\nSube una foto y da seguimiento a tu reporte.',
    cta: 'Empieza aquí',
    hashtags: '#PasoAPaso #Reporta #MiMunicipio'
  },
  {
    clave: 'sin-cuenta',
    categoria: 'lanzamiento',
    nombre: 'Sin cuenta también puedes',
    base: 'reportar',
    estructura: 'anuncio',
    diseno: 'centrado',
    formato: 'historia',
    red: 'instagram',
    paleta: 'civico',
    kicker: 'PARTICIPA',
    titulo: 'No necesitas cuenta para reportar',
    texto:
      'Puedes reportar de forma anónima. Si creas una cuenta, además das seguimiento a tus reportes y apoyas otros con tu firma.',
    cta: 'Entra y reporta',
    hashtags: '#ParticipaciónCiudadana #Reporta #MiMunicipio'
  },
  {
    clave: 'municipio-en-sistema',
    categoria: 'lanzamiento',
    nombre: 'Tu municipio ya está',
    base: 'reportar',
    estructura: 'anuncio',
    diseno: 'dividido',
    formato: 'cuadrado',
    red: 'facebook',
    paleta: 'institucional',
    kicker: '{municipio}',
    titulo: '{municipio} ya cuenta con el Sistema de Incidencias',
    texto:
      'Vecinas y vecinos de {municipio}: reporten desde hoy los problemas de su colonia y vean cómo avanza cada atención.',
    cta: 'Conoce el sistema',
    hashtags: '#Reporta #MiMunicipio #Incidencias'
  },
  {
    clave: 'firmas-suma',
    categoria: 'participacion',
    nombre: 'Tu firma suma',
    base: 'firmas',
    estructura: 'anuncio',
    diseno: 'centrado',
    formato: 'cuadrado',
    red: 'facebook',
    paleta: 'noche',
    kicker: 'CAUSAS DE LA COMUNIDAD',
    titulo: 'Tu firma hace la diferencia',
    texto:
      'Firma las incidencias que te importan. Cuando se alcanza la meta de firmas, se avisa a las autoridades.',
    cta: 'Firma y comparte',
    hashtags: '#Firmas #Comunidad #CambioLocal'
  },
  {
    clave: 'firmas-vecinos',
    categoria: 'participacion',
    nombre: 'Junta firmas con tus vecinos',
    base: 'firmas',
    estructura: 'paso_a_paso',
    diseno: 'pasos',
    formato: 'historia',
    red: 'whatsapp',
    paleta: 'sol',
    kicker: 'ORGANÍZATE',
    titulo: 'Reúne firmas en tu colonia',
    texto:
      'Abre la incidencia que te preocupa.\nComparte la recolección con tus vecinos.\nAl llegar a la meta, se notifica a las autoridades.',
    cta: 'Comparte la recolección',
    hashtags: '#Firmas #Vecinos #Colonia'
  },
  {
    clave: 'contacto-funcionarios',
    categoria: 'participacion',
    nombre: 'Habla con tu municipio',
    base: 'funcionarios',
    estructura: 'anuncio',
    diseno: 'tarjeta',
    formato: 'cuadrado',
    red: 'facebook',
    paleta: 'civico',
    kicker: 'CONTACTO DIRECTO',
    titulo: 'Escribe al personal municipal sin publicar tus datos',
    texto:
      'Con tu cuenta puedes mandar un mensaje al funcionario responsable desde el sistema. Si no hay alguien asignado, la administración recibe tu solicitud.',
    cta: 'Abre el canal de contacto',
    hashtags: '#ContactoCiudadano #ServicioPúblico #Transparencia'
  },
  {
    clave: 'suscripcion',
    categoria: 'participacion',
    nombre: 'Suscríbete a las novedades',
    base: 'informes',
    estructura: 'anuncio',
    diseno: 'banda',
    formato: 'horizontal',
    red: 'x',
    paleta: 'institucional',
    kicker: 'INFÓRMATE',
    titulo: 'Recibe novedades de tu municipio en tu correo',
    texto: 'La suscripción se confirma por correo y puedes darte de baja en un clic.',
    cta: 'Suscríbete',
    hashtags: '#Novedades #MiMunicipio'
  },
  {
    clave: 'informes-publicos',
    categoria: 'transparencia',
    nombre: 'Solicita un informe',
    base: 'informes',
    estructura: 'anuncio',
    diseno: 'dividido',
    formato: 'horizontal',
    red: 'facebook',
    paleta: 'civico',
    kicker: 'DATOS ABIERTOS',
    titulo: 'Pide un informe público de tu municipio',
    texto:
      'Elige municipio, estado, tipo de incidencia y fechas. Recibes el PDF o CSV en el correo que registres.',
    cta: 'Solicita tu informe',
    hashtags: '#DatosAbiertos #RendiciónDeCuentas #InformaciónPública'
  },
  {
    clave: 'dato-clave',
    categoria: 'transparencia',
    nombre: 'Dato clave',
    base: 'informes',
    estructura: 'dato_clave',
    diseno: 'centrado',
    formato: 'vertical',
    red: 'instagram',
    paleta: 'noche',
    kicker: 'TRANSPARENCIA',
    titulo: 'Los datos del mantenimiento urbano son públicos',
    texto:
      'Consulta cuántos reportes se atendieron, cuánto tardaron y en qué zonas, por municipio y tipo de incidencia.',
    cta: 'Consulta los datos',
    hashtags: '#DatosAbiertos #Transparencia #MiMunicipio'
  },
  {
    clave: 'avances',
    categoria: 'transparencia',
    nombre: 'Reportes atendidos',
    base: 'reconocimiento',
    estructura: 'anuncio',
    diseno: 'tarjeta',
    formato: 'vertical',
    red: 'facebook',
    paleta: 'institucional',
    kicker: 'AVANCES',
    titulo: 'Así avanza el mantenimiento de tu comunidad',
    texto:
      'Mira los reportes que ya fueron atendidos. La transparencia también se construye mostrando resultados.',
    cta: 'Mira los reportes resueltos',
    hashtags: '#Avances #Transparencia #TrabajoEnEquipo'
  },
  {
    clave: 'testimonio',
    categoria: 'comunidad',
    nombre: 'Voz de la comunidad',
    base: 'reconocimiento',
    estructura: 'testimonio',
    diseno: 'tarjeta',
    formato: 'cuadrado',
    red: 'instagram',
    paleta: 'vino',
    kicker: 'LO DICE LA COMUNIDAD',
    titulo: 'Reportamos y se atendió',
    texto: '[Escribe aquí el testimonio real. Pide autorización a la persona antes de publicarlo.]',
    cta: 'Cuéntanos tu caso',
    hashtags: '#Comunidad #Reporta #MiMunicipio'
  },
  {
    clave: 'editorial-servicio',
    categoria: 'lanzamiento',
    nombre: 'Editorial de servicio',
    base: 'reportar',
    estructura: 'dato_clave',
    diseno: 'marco',
    formato: 'cuatro-tercios',
    red: 'facebook',
    paleta: 'civico',
    kicker: 'SERVICIO PÚBLICO',
    titulo: 'Tu reporte tiene seguimiento',
    texto: 'Cada incidencia recibe un folio y un historial para que sepas qué pasó después de reportarla.',
    cta: 'Consultar el sistema',
    hashtags: '#ServicioPúblico #Transparencia #MiMunicipio'
  },
  {
    clave: 'lateral-firmas',
    categoria: 'participacion',
    nombre: 'Firmas en movimiento',
    base: 'firmas',
    estructura: 'paso_a_paso',
    diseno: 'lateral',
    formato: 'tres-dos',
    red: 'facebook',
    paleta: 'sol',
    kicker: 'PARTICIPA',
    titulo: 'Tres pasos para que tu colonia avance',
    texto: 'Elige la causa.\nFirma con tu cuenta.\nComparte con tus vecinos.',
    cta: 'Firmar ahora',
    hashtags: '#Firmas #Vecinos #Colonia'
  },
  {
    clave: 'banner-informes',
    categoria: 'transparencia',
    nombre: 'Banner de datos',
    base: 'informes',
    estructura: 'anuncio',
    diseno: 'diagonal',
    formato: 'banner',
    red: 'x',
    paleta: 'noche',
    kicker: 'DATOS ABIERTOS',
    titulo: 'La información de tu municipio, a un clic',
    texto: 'Solicita un informe por territorio, tipo y fecha. Recibe el PDF o CSV en tu correo.',
    cta: 'Solicitar informe',
    hashtags: '#DatosAbiertos #MiMunicipio'
  },
  {
    clave: 'linkedin-sistema',
    categoria: 'comunidad',
    nombre: 'Presentación profesional',
    base: 'reportar',
    estructura: 'anuncio',
    diseno: 'marco',
    formato: 'linkedin',
    red: 'facebook',
    paleta: 'institucional',
    kicker: 'GOBIERNO ABIERTO',
    titulo: 'Una plataforma para escuchar a la comunidad',
    texto: 'Reportes geolocalizados, seguimiento y datos públicos para mejorar la gestión municipal.',
    cta: 'Conocer la plataforma',
    hashtags: '#GobiernoAbierto #Participación #DatosPúblicos'
  }
];

/**
 * Plantillas de correo. `puntos` es una línea por elemento; `estilo` decide
 * si salen como pasos, lista con palomitas o tarjetas. `ruta` se añade al
 * origen del sitio cuando el administrador no escribe un enlace propio.
 */
export const CORREOS = [
  {
    clave: 'bienvenida',
    nombre: 'Presentación del sistema',
    asunto: 'Conoce el Sistema de Incidencias Municipales',
    titular: 'Reporta los problemas de tu municipio y sigue su atención',
    intro:
      'Ya puedes registrar baches, luminarias apagadas, fugas o drenajes obstruidos desde tu celular o computadora.\n\nCada reporte tiene un folio para que veas cómo avanza.',
    puntos:
      'Registra el problema con foto y ubicación\nSigue el estado de tu reporte\nSuma firmas para que se atienda más rápido',
    estilo: 'lista',
    boton: 'Entrar al sistema',
    ruta: '/'
  },
  {
    clave: 'tres-pasos',
    nombre: 'Cómo reportar en 3 pasos',
    asunto: 'Reportar un problema toma 3 pasos',
    titular: 'Así reportas un problema en tu colonia',
    intro: 'Es rápido y no necesitas cuenta para empezar.',
    puntos:
      'Elige tu municipio y marca el lugar en el mapa\nDescribe lo que ocurre y sube una foto\nGuarda tu folio y consulta el avance cuando quieras',
    estilo: 'pasos',
    boton: 'Hacer mi primer reporte',
    ruta: '/'
  },
  {
    clave: 'firmas',
    nombre: 'Suma tu firma',
    asunto: 'Tu firma ayuda a que se atienda',
    titular: 'Las causas de tu comunidad necesitan tu firma',
    intro:
      'Firma las incidencias que te importan y comparte la recolección con tus vecinos. Al llegar a la meta se avisa a las autoridades.',
    puntos: 'Elige una incidencia de tu zona\nFírmala con tu cuenta\nCompártela con tus vecinos',
    estilo: 'pasos',
    boton: 'Ver incidencias para firmar',
    ruta: '/'
  },
  {
    clave: 'transparencia',
    nombre: 'Transparencia y datos abiertos',
    asunto: 'Consulta los datos de tu municipio',
    titular: 'Datos abiertos para tu comunidad',
    intro:
      'Solicita un informe público por municipio, estado, tipo de incidencia y rango de fechas. Lo recibes por correo en PDF o CSV.',
    puntos:
      'Por municipio: revisa lo que pasa en tu zona\nPor tipo: baches, alumbrado, agua y más\nPor fecha: compara periodos',
    estilo: 'tarjetas',
    boton: 'Solicitar un informe',
    ruta: '/informes'
  },
  {
    clave: 'avances',
    nombre: 'Avances y reconocimiento',
    asunto: 'Mira lo que ya se atendió',
    titular: 'Así avanza el mantenimiento de tu comunidad',
    intro:
      'Gracias a los reportes de la ciudadanía, estos son algunos avances. Sustituye los datos entre corchetes por las cifras reales del periodo.',
    puntos:
      'Reportes atendidos: [número]\nTiempo promedio: [días]\nMás participación: [colonias]',
    estilo: 'tarjetas',
    boton: 'Ver reportes resueltos',
    ruta: '/'
  },
  {
    clave: 'municipio',
    nombre: 'Tu municipio ya está en el sistema',
    asunto: '{municipio} ya cuenta con el Sistema de Incidencias',
    titular: '{municipio} ya está en el sistema',
    intro:
      'Desde hoy puedes reportar los problemas de tu colonia en {municipio} y seguir cómo se atienden.',
    puntos:
      'Reporta sin filas ni trámites\nConsulta el estado con tu folio\nContacta al personal municipal desde el sistema',
    estilo: 'lista',
    boton: 'Conocer el sistema',
    ruta: '/'
  }
];
