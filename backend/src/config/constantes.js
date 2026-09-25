/**
 * Constantes de dominio compartidas por modelos, servicios y controladores.
 *
 * Los valores de DIAS_LIMITES y los límites de archivo provienen del sistema
 * original (monolito en legacy/sistema_de_incidencias.html) para conservar
 * exactamente la misma política de negocio.
 */

export const ROLES = ['anonimo', 'funcionario', 'admin'];

export const ROLES_EMPLEADO = ['funcionario', 'admin'];

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

/** Límites de evidencia (paridad con MAX_FOTO / MAX_VIDEO / MAX_VIDEO_SEG). */
export const EVIDENCIA_POLITICA = {
  maxFotoBytes: 100 * 1024 * 1024,
  maxVideoBytes: 1024 * 1024 * 1024,
  maxVideoSegundos: 300,
  maxArchivosPorCarga: 20,
  mimesPermitidos: ['image/', 'video/', 'application/pdf'],
  extensiones: {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'application/pdf': '.pdf'
  }
};

/** Íconos disponibles para el selector (se cargan desde los datos semilla). */
export const COLECCIONES = ['incidencias', 'tipos', 'municipios', 'usuarios', 'notificaciones'];
