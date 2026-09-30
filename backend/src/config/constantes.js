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
 * - `funcionario` / `admin`: personal del municipio (login con clave de municipio).
 */
export const ROLES = ['anonimo', 'ciudadano', 'funcionario', 'admin'];

export const ROLES_EMPLEADO = ['funcionario', 'admin'];

/** Roles que puede crear y editar un administrador desde el panel. */
export const ROLES_PERSONAL = ['funcionario', 'admin'];

/** Roles con cuenta propia (todo menos la sesión anónima). */
export const ROLES_CUENTA = ['ciudadano', 'funcionario', 'admin'];

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
  /**
   * Máximo de la contraseña. bcrypt solo mira los primeros 72 bytes, así que
   * más allá de eso los caracteres no aportan nada: mejor decirlo que dejar
   * creer que cuenta.
   */
  passwordMax: 72,
  titulo: 80,
  descripcion: 600,
  indicaciones: 400,
  nombreTipo: 60,
  comentario: 500,
  solucion: 600,
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
export const TIPOS_NOTIFICACION = ['reporte', 'resuelta', 'estado', 'alerta', 'comentario'];

/** Municipio que se muestra cuando la aplicación acaba de arrancar (Maravatío). */
export const MUNICIPIO_DEFAULT = '16050';

/**
 * Concepto «Otro»: es el único que deja elegir un icono propio.
 * El resto de conceptos ya trae el suyo, y así todos los reportes del mismo
 * tipo se ven igual en el listado y en el mapa.
 */
export const TIPO_OTRO = 'otro';

/**
 * Límites y política de la evidencia.
 *
 * La evidencia es **solo de fotografías**: el video se retiró del formulario y
 * el servidor lo rechaza (los reportes que ya tengan video se siguen mostrando).
 * El PDF se admite únicamente como documento de la resolución.
 *
 * `mimesPermitidos` es una **lista cerrada**: antes se aceptaba cualquier
 * `image/*` y por ahí colaba `image/svg+xml`, que puede llevar código dentro y,
 * servido desde el mismo origen, sería XSS almacenado. Además del `Content-Type`
 * se comprueba la **firma binaria** del archivo (ver `detectarTipo` en
 * `services/uploads.service.js`), porque ese dato lo elige quien sube.
 */
export const EVIDENCIA_POLITICA = {
  /** Tope de cada archivo: una foto de móvil ronda los 3-8 MB. */
  maxFotoBytes: 20 * 1024 * 1024,
  /** Tope del conjunto de una misma carga (ver `limiteCargaDe`). */
  maxCargaBytes: 60 * 1024 * 1024,
  maxArchivosPorCarga: 20,
  mimesPermitidos: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
  /**
   * Tope para la evidencia que llega dentro de un respaldo del monolito: allí
   * también había video de hasta 1 GB, así que se conserva ese margen para no
   * perder archivos que ya existían. Al subir desde el formulario mandan
   * `maxFotoBytes` y `maxCargaBytes`.
   */
  maxImportacionBytes: 1024 * 1024 * 1024,
  /** Bytes del arranque que se leen para comprobar la firma del archivo. */
  bytesDeFirma: 1024,
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
