/**
 * Configuración central del sistema (tabla `configuracion`).
 *
 * Los valores se guardan como JSON para conservar booleanos y números entre el
 * driver JSON y MySQL. Las claves desconocidas se rechazan para evitar que un
 * error de escritura inactive una función sin que nadie lo note.
 */
import { AppError } from '../utils/AppError.js';

export const CONFIGURACION_POR_DEFECTO = Object.freeze({
  'firmas.max_por_usuario': 10,
  'firmas.meta_min': 1,
  'firmas.meta_max': 10000,
  'firmas.meta_default': 100,
  'firmas.permitir_anonimas': false,
  'firmas.notificar_meta': true,
  'informes.max_meses': 24,
  'informes.fecha_minima': '2020-01-01',
  'informes.max_registros': 1500,
  'informes.margen_superior': 18,
  'informes.margen_derecho': 15,
  'informes.margen_inferior': 18,
  'informes.margen_izquierdo': 15,
  'informes.logo_url': '',
  'informes.logo_posicion': 'izquierda',
  'informes.logo_ancho': 90,
  'informes.logo_desplazamiento_x': 0,
  'informes.logo_desplazamiento_y': 0,
  'informes.pie_texto': 'Sistema de Incidencias Municipales',
  'comentarios.max_por_dia': 20,
  'comentarios.espera_segundos': 30,
  'comentarios.max_enlaces': 2,
  'comentarios.ocultar_automatico': 3,
  'notificaciones.historial_dias': 180,
  'respaldos.activo': true,
  'respaldos.intervalo_horas': 24,
  'respaldos.retencion': 7,
  'respaldos.incluir_simulados': false,
  'respaldos.max_manuales': 20,
  'general.sitio_nombre': 'Sistema de Incidencias Municipales',
  'general.correo_contacto': '',
  'general.url_base': ''
});

const NUMERICAS = new Map([
  ['firmas.max_por_usuario', { min: 1, max: 500 }],
  ['firmas.meta_min', { min: 1, max: 100000 }],
  ['firmas.meta_max', { min: 1, max: 1000000 }],
  ['firmas.meta_default', { min: 1, max: 1000000 }],
  ['informes.max_meses', { min: 1, max: 120 }],
  ['informes.max_registros', { min: 1, max: 50000 }],
  ['informes.margen_superior', { min: 5, max: 50 }],
  ['informes.margen_derecho', { min: 5, max: 50 }],
  ['informes.margen_inferior', { min: 5, max: 50 }],
  ['informes.margen_izquierdo', { min: 5, max: 50 }],
  ['informes.logo_ancho', { min: 30, max: 220 }],
  ['informes.logo_desplazamiento_x', { min: -120, max: 120 }],
  ['informes.logo_desplazamiento_y', { min: -80, max: 80 }],
  ['comentarios.max_por_dia', { min: 1, max: 1000 }],
  ['comentarios.espera_segundos', { min: 0, max: 3600 }],
  ['comentarios.max_enlaces', { min: 0, max: 20 }],
  ['comentarios.ocultar_automatico', { min: 1, max: 100 }],
  ['notificaciones.historial_dias', { min: 1, max: 3650 }],
  ['respaldos.intervalo_horas', { min: 1, max: 720 }],
  ['respaldos.retencion', { min: 1, max: 365 }],
  ['respaldos.max_manuales', { min: 1, max: 500 }]
]);

const BOOLEANAS = new Set([
  'firmas.permitir_anonimas',
  'firmas.notificar_meta',
  'respaldos.activo',
  'respaldos.incluir_simulados'
]);

const FECHAS = new Set(['informes.fecha_minima']);
const POSICIONES_LOGO = new Set(['izquierda', 'derecha', 'centro']);

function error(campo, mensaje) {
  return AppError.solicitudInvalida('Configuración inválida', [{ campo, mensaje }]);
}

function validar(clave, valor) {
  if (!(clave in CONFIGURACION_POR_DEFECTO)) {
    throw error(clave, 'Clave de configuración desconocida');
  }
  if (NUMERICAS.has(clave)) {
    const numero = Number(valor);
    const rango = NUMERICAS.get(clave);
    if (!Number.isFinite(numero) || numero < rango.min || numero > rango.max) {
      throw error(clave, `Debe ser un número entre ${rango.min} y ${rango.max}`);
    }
    return numero;
  }
  if (BOOLEANAS.has(clave)) {
    if (typeof valor !== 'boolean') throw error(clave, 'Debe ser verdadero o falso');
    return valor;
  }
  if (FECHAS.has(clave)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''))) {
      throw error(clave, 'Usa el formato AAAA-MM-DD');
    }
    return String(valor);
  }
  if (typeof valor !== 'string') throw error(clave, 'Debe ser texto');
  const texto = valor.trim().slice(0, 500);
  if (clave === 'informes.logo_posicion' && !POSICIONES_LOGO.has(texto)) {
    throw error(clave, 'La posición debe ser izquierda, derecha o centro');
  }
  if (clave === 'informes.logo_url' && texto && !/^\/uploads\/[A-Za-z0-9._-]+$/.test(texto)) {
    throw error(clave, 'El logo debe ser un archivo subido al sistema');
  }
  return texto;
}

/** Valor efectivo de una clave (configuración guardada o valor por defecto). */
export async function valor(repositorio, clave) {
  if (!(clave in CONFIGURACION_POR_DEFECTO)) {
    throw new Error(`Clave de configuración desconocida: ${clave}`);
  }
  const fila = await repositorio.configuracion(clave);
  if (!fila) return CONFIGURACION_POR_DEFECTO[clave];
  return validar(clave, fila.valor);
}

/** Todas las claves, con defaults aplicados. */
export async function todas(repositorio) {
  const guardadas = await repositorio.configuraciones();
  const porClave = new Map(guardadas.map((f) => [f.clave, f]));
  return Object.entries(CONFIGURACION_POR_DEFECTO).map(([clave, porDefecto]) => {
    const fila = porClave.get(clave);
    let efectivo = porDefecto;
    try {
      efectivo = fila ? validar(clave, fila.valor) : porDefecto;
    } catch {
      efectivo = porDefecto;
    }
    return {
      clave,
      valor: efectivo,
      porDefecto,
      actualizadoPor: fila?.actualizadoPor || null,
      actualizadoEn: fila?.actualizadoEn || null
    };
  });
}

/** Plantilla efectiva del informe imprimible y de los PDF públicos. */
export async function plantillaInforme(repositorio) {
  const [
    margenSuperior,
    margenDerecho,
    margenInferior,
    margenIzquierdo,
    logoUrl,
    logoPosicion,
    logoAncho,
    logoDesplazamientoX,
    logoDesplazamientoY,
    pieTexto
  ] = await Promise.all([
    valor(repositorio, 'informes.margen_superior'),
    valor(repositorio, 'informes.margen_derecho'),
    valor(repositorio, 'informes.margen_inferior'),
    valor(repositorio, 'informes.margen_izquierdo'),
    valor(repositorio, 'informes.logo_url'),
    valor(repositorio, 'informes.logo_posicion'),
    valor(repositorio, 'informes.logo_ancho'),
    valor(repositorio, 'informes.logo_desplazamiento_x'),
    valor(repositorio, 'informes.logo_desplazamiento_y'),
    valor(repositorio, 'informes.pie_texto')
  ]);
  return {
    margenSuperior,
    margenDerecho,
    margenInferior,
    margenIzquierdo,
    logoUrl,
    logoPosicion,
    logoAncho,
    logoDesplazamientoX,
    logoDesplazamientoY,
    pieTexto
  };
}

/** Subconjunto público para formularios (sin datos internos). */
export async function publicas(repositorio) {
  const [
    maxFirmas,
    metaMin,
    metaMax,
    metaDefault,
    maxMeses,
    fechaMinima,
    maxRegistros,
    maxComentarios,
    esperaComentarios,
    maxEnlaces,
    nombreSitio
  ] = await Promise.all([
    valor(repositorio, 'firmas.max_por_usuario'),
    valor(repositorio, 'firmas.meta_min'),
    valor(repositorio, 'firmas.meta_max'),
    valor(repositorio, 'firmas.meta_default'),
    valor(repositorio, 'informes.max_meses'),
    valor(repositorio, 'informes.fecha_minima'),
    valor(repositorio, 'informes.max_registros'),
    valor(repositorio, 'comentarios.max_por_dia'),
    valor(repositorio, 'comentarios.espera_segundos'),
    valor(repositorio, 'comentarios.max_enlaces'),
    valor(repositorio, 'general.sitio_nombre')
  ]);
  return {
    firmas: { maxPorUsuario: maxFirmas, metaMin, metaMax, metaDefault },
    informes: { maxMeses, fechaMinima, maxRegistros },
    comentarios: { maxPorDia: maxComentarios, esperaSegundos: esperaComentarios, maxEnlaces },
    sitio: { nombre: nombreSitio }
  };
}

/** Guarda un conjunto de claves validadas. */
export async function guardar(repositorio, actor, cambios = {}) {
  const entradas = Object.entries(cambios || {});
  if (!entradas.length) throw AppError.solicitudInvalida('No hay cambios de configuración');
  const normalizados = [];
  for (const [clave, valorCrudo] of entradas) {
    normalizados.push([clave, validar(clave, valorCrudo)]);
  }
  for (const [clave, valorNormalizado] of normalizados) {
    await repositorio.guardarConfiguracion(clave, valorNormalizado, actor?.username || null);
  }
  return todas(repositorio);
}
