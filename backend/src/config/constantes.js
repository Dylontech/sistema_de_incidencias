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
  titulo: 80,
  descripcion: 600,
  indicaciones: 400,
  nombreTipo: 60,
  comentario: 500,
  solucion: 600,
  /** Motivo por el que el personal marca un reporte como peligroso. */
  motivoPeligro: 140
};

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
export const COLECCIONES = ['incidencias', 'tipos', 'municipios', 'usuarios', 'notificaciones'];
