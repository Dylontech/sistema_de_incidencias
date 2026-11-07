/** Vista de configuración central. */
import { $, esc } from '../core/utils.js';

const ETIQUETAS = {
  'firmas.max_por_usuario': 'Máximo de firmas por cuenta',
  'firmas.meta_min': 'Meta mínima de firmas',
  'firmas.meta_max': 'Meta máxima de firmas',
  'firmas.meta_default': 'Meta por defecto',
  'firmas.permitir_anonimas': 'Permitir firmas anónimas',
  'firmas.notificar_meta': 'Notificar al alcanzar la meta',
  'informes.max_meses': 'Máximo de meses por informe',
  'informes.fecha_minima': 'Fecha mínima permitida',
  'informes.max_registros': 'Máximo de registros por informe',
  'informes.margen_superior': 'Margen superior del informe (mm)',
  'informes.margen_derecho': 'Margen derecho del informe (mm)',
  'informes.margen_inferior': 'Margen inferior del informe (mm)',
  'informes.margen_izquierdo': 'Margen izquierdo del informe (mm)',
  'informes.logo_url': 'URL del logo institucional',
  'informes.logo_posicion': 'Posición del logo (izquierda/derecha/centro)',
  'informes.logo_ancho': 'Ancho del logo (px)',
  'informes.logo_desplazamiento_x': 'Ajuste horizontal del logo (px)',
  'informes.logo_desplazamiento_y': 'Ajuste vertical del logo (px)',
  'informes.pie_texto': 'Texto del pie de página',
  'informes.color_acento': 'Color institucional del informe',
  'informes.evidencia_columnas': 'Imágenes de evidencia por fila',
  'informes.evidencia_posicion': 'Orden de la evidencia',
  'informes.motor_pdf': 'Versión del PDF de informes',
  'comentarios.max_por_dia': 'Comentarios por cuenta al día',
  'comentarios.espera_segundos': 'Espera entre comentarios (segundos)',
  'comentarios.max_enlaces': 'Enlaces permitidos por comentario',
  'comentarios.ocultar_automatico': 'Reportes para ocultar automáticamente',
  'notificaciones.historial_dias': 'Días de historial de avisos',
  'respaldos.activo': 'Respaldos automáticos activos',
  'respaldos.intervalo_horas': 'Intervalo de respaldo (horas)',
  'respaldos.retencion': 'Respaldos automáticos a conservar',
  'respaldos.incluir_simulados': 'Incluir datos simulados por defecto',
  'respaldos.max_manuales': 'Máximo de respaldos manuales',
  'general.sitio_nombre': 'Nombre del sistema',
  'general.correo_contacto': 'Correo de contacto',
  'general.url_base': 'URL pública'
};

const GRUPOS = {
  'firmas.': 'Firmas',
  'informes.': 'Informes',
  'comentarios.': 'Comentarios',
  'notificaciones.': 'Notificaciones',
  'respaldos.': 'Respaldos',
  'general.': 'General'
};

const OPCIONES = {
  'informes.motor_pdf': [
    ['v2', 'Rediseñado (recomendado)'],
    ['v1', 'Clásico (anterior)'],
    ['preguntar', 'Preguntar en cada descarga']
  ],
  'informes.evidencia_posicion': [
    ['final', 'Al final, como anexo'],
    ['despues_descripcion', 'Justo después de la descripción']
  ]
};

function grupoDe(clave) {
  const prefijo = Object.keys(GRUPOS).find((p) => clave.startsWith(p));
  return prefijo ? GRUPOS[prefijo] : 'Otros';
}

function campo(clave, valor) {
  const id = `config_${clave.replace(/\./g, '_')}`;
  if (typeof valor === 'boolean') {
    return `<label class="check-line">
      <input type="checkbox" id="${id}" data-config-key="${esc(clave)}" ${valor ? 'checked' : ''}>
      <span>${esc(ETIQUETAS[clave] || clave)}</span>
    </label>`;
  }
  const opciones = OPCIONES[clave];
  if (opciones) {
    const actual = String(valor ?? '');
    const nota =
      clave === 'informes.motor_pdf'
        ? 'v2 usa el diseño nuevo; v1 conserva el anterior; preguntar muestra la elección en cada descarga.'
        : clave;
    return `<div class="form-group">
      <label for="${id}">${esc(ETIQUETAS[clave] || clave)}</label>
      <select id="${id}" data-config-key="${esc(clave)}">
        ${opciones
          .map(
            ([opcion, texto]) =>
              `<option value="${esc(opcion)}" ${actual === opcion ? 'selected' : ''}>${esc(texto)}</option>`
          )
          .join('')}
      </select>
      <p class="campo-nota">${esc(nota)}</p>
    </div>`;
  }
  const tipo =
    clave === 'informes.fecha_minima'
      ? 'date'
      : clave === 'informes.color_acento'
        ? 'color'
        : typeof valor === 'number'
          ? 'number'
          : 'text';
  return `<div class="form-group">
    <label for="${id}">${esc(ETIQUETAS[clave] || clave)}</label>
    <input type="${tipo}" id="${id}" autocomplete="off" data-config-key="${esc(clave)}" value="${esc(String(valor ?? ''))}">
    <p class="campo-nota">${esc(clave)}</p>
  </div>`;
}

export function renderizar(configuracion = []) {
  const contenedor = $('configuracionLista');
  if (!contenedor) return;
  const grupos = new Map();
  for (const fila of configuracion) {
    const grupo = grupoDe(fila.clave);
    if (!grupos.has(grupo)) grupos.set(grupo, []);
    grupos.get(grupo).push(fila);
  }
  contenedor.innerHTML = [...grupos.entries()]
    .map(
      ([grupo, filas]) => `
      <div class="panel-blanco u-mb-12">
        <h4 class="titulo-seccion u-mb-8">${esc(grupo)}</h4>
        <div class="config-grid">
          ${filas.map((f) => campo(f.clave, f.valor)).join('')}
        </div>
      </div>`
    )
    .join('');
}

export function leer() {
  const datos = {};
  document.querySelectorAll('[data-config-key]').forEach((elemento) => {
    const clave = elemento.dataset.configKey;
    if (elemento.type === 'checkbox') datos[clave] = elemento.checked;
    else if (elemento.type === 'number') datos[clave] = Number(elemento.value);
    else datos[clave] = elemento.value;
  });
  return datos;
}
