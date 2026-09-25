/**
 * Vista del formulario de incidencia (reportar/editar) y del modal de resolución.
 * El estado temporal (ubicación, zona, evidencia) lo guarda el controlador en
 * el store; aquí solo se pinta.
 */
import { $, esc } from '../core/utils.js';
import { seleccionarIcono, limpiarPicker, iconoSeleccionado } from './tipos.view.js';

const ICONOS_STATUS = {
  ok: 'bi-check-circle-fill',
  error: 'bi-exclamation-triangle-fill',
  loading: 'bi-hourglass-split'
};

/** Deja el formulario listo para un reporte nuevo. */
export function prepararAlta(usuario = null) {
  $('modalIncTitle').textContent = 'Reportar incidencia';
  $('incGuardarTexto').textContent = 'Enviar reporte';
  $('incTipo').value = '';
  $('incTitulo').value = '';
  $('incDescripcion').value = '';
  $('incIndicaciones').value = '';
  $('incCoordsTexto').value = '';
  $('ejemploTipoBox').style.display = 'none';
  $('locStatus').style.display = 'none';
  $('evidenceList').innerHTML = '';
  limpiarPicker('iconPicker');
  renderZonaBadge(null);
  renderFirma(usuario);
}

/**
 * Bloque «Firma del reporte».
 *
 * Una sesión anónima no tiene elección: sus reportes nunca llevan nombre. Una
 * cuenta (ciudadana o del personal) decide reporte a reporte si firma con su
 * nombre o si aparece como «Anónimo»; el valor por omisión es firmar.
 */
export function renderFirma(usuario = null, { anonima = null, bloqueado = false } = {}) {
  const casilla = $('incAnonima');
  const nota = $('incFirmaNota');
  if (!casilla) return;

  const esAnonimo = usuario?.rol === 'anonimo';
  const conNombre = anonima === true;
  casilla.disabled = esAnonimo || bloqueado;
  casilla.checked = esAnonimo ? true : conNombre;

  if (!nota) return;
  if (bloqueado) {
    nota.textContent =
      'La firma se decide al crear el reporte y no cambia después: este quedó como «Anónimo».';
  } else if (esAnonimo) {
    nota.textContent =
      'Estás en una sesión anónima: el reporte aparecerá como «Anónimo» y no recibirás avisos. Crea una cuenta para seguir tus reportes.';
  } else if (casilla.checked) {
    nota.textContent = `Aparecerá como «Anónimo», pero seguirás recibiendo los avisos de «${usuario?.nombre || 'tu cuenta'}».`;
  } else {
    nota.textContent = `Aparecerá con tu nombre: ${usuario?.nombre || 'tu cuenta'}.`;
  }
}

/** Refleja la elección del usuario en la nota del formulario. */
export function actualizarNotaFirma(usuario) {
  renderFirma(usuario, { anonima: $('incAnonima')?.checked === true });
}

/** Rellena el formulario con una incidencia existente. */
export function prepararEdicion(incidencia) {
  $('modalIncTitle').textContent = 'Editar incidencia';
  $('incGuardarTexto').textContent = 'Guardar cambios';
  $('incTipo').value = incidencia.tipoId || '';
  $('incTitulo').value = incidencia.titulo || '';
  $('incDescripcion').value = incidencia.descripcion || '';
  $('incIndicaciones').value = incidencia.indicaciones || '';
  $('incCoordsTexto').value =
    incidencia.lat != null ? `${incidencia.lat.toFixed(6)}, ${incidencia.lng.toFixed(6)}` : '';
  if (incidencia.iconoCustom) seleccionarIcono('iconPicker', incidencia.iconoCustom, null);
  else limpiarPicker('iconPicker');
}

/** Rellena el desplegable de tipos del formulario. */
export function renderSelectTipos(tipos = []) {
  const select = $('incTipo');
  if (!select) return;
  const actual = select.value;
  select.innerHTML =
    '<option value="">— Selecciona un tipo —</option>' +
    tipos.map((t) => `<option value="${esc(t.id)}">${t.icono} ${esc(t.nombre)}</option>`).join('');
  if (tipos.some((t) => t.id === actual)) select.value = actual;
}

export function leerFormulario() {
  return {
    tipoId: $('incTipo').value,
    titulo: $('incTitulo').value.trim(),
    descripcion: $('incDescripcion').value.trim(),
    indicaciones: $('incIndicaciones').value.trim(),
    iconoCustom: iconoSeleccionado('iconPicker'),
    anonima: $('incAnonima')?.checked === true,
    evidencia: []
  };
}

/** Refleja la ubicación elegida y el resultado de la geocerca. */
export function aplicarUbicacion({ lat, lng, zona, dentro = true }) {
  const texto = $('incCoordsTexto');
  if (texto && lat != null) texto.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  if (!dentro) {
    mostrarLocStatus(
      'Ubicación fuera del municipio activo. Elige un punto dentro del área marcada en el mapa.',
      'error'
    );
    renderZonaBadge(null);
    return;
  }

  // La comunidad es opcional: las localidades del INEGI cubren las áreas
  // pobladas, así que un punto puede ser válido sin pertenecer a ninguna.
  mostrarLocStatus(
    zona
      ? `Ubicación válida · comunidad: ${zona.nombre}`
      : 'Ubicación válida dentro del municipio (sin comunidad asignada)',
    'ok'
  );
  renderZonaBadge(zona);
}

export function mostrarLocStatus(mensaje, tipo = 'ok') {
  const elemento = $('locStatus');
  if (!elemento) return;
  elemento.style.display = 'flex';
  elemento.className = `loc-status ${tipo}`;
  elemento.innerHTML = `<i class="bi ${ICONOS_STATUS[tipo] || 'bi-info-circle-fill'}"></i> ${esc(mensaje)}`;
}

export function renderZonaBadge(zona) {
  const elemento = $('incZonaBadge');
  if (!elemento) return;
  if (!zona) {
    elemento.style.display = 'none';
    elemento.innerHTML = '';
    return;
  }
  elemento.style.display = 'inline-flex';
  elemento.style.background = zona.color;
  elemento.innerHTML = `<i class="bi bi-pin-map-fill"></i> ${esc(zona.nombre)}
    <span style="opacity:.8;text-transform:capitalize;">(${esc(zona.tipo)})</span>`;
}

export function textoCoordenadas() {
  return $('incCoordsTexto')?.value || '';
}

/** Caja de ejemplo guía según el tipo seleccionado. */
export function mostrarEjemplo(tipoId, ejemplos = {}) {
  const ejemplo = ejemplos[tipoId];
  const caja = $('ejemploTipoBox');
  if (!ejemplo) {
    caja.style.display = 'none';
    return;
  }
  $('ejemploTitulo').textContent = `"${ejemplo.titulo}"`;
  $('ejemploDescripcion').textContent = ejemplo.descripcion;
  caja.style.display = 'block';
}

/** Copia el ejemplo a los campos vacíos (equivale a `Incidencias.usarEjemplo`). */
export function usarEjemplo(tipoId, ejemplos = {}) {
  const ejemplo = ejemplos[tipoId];
  if (!ejemplo) return false;
  if (!$('incTitulo').value.trim()) $('incTitulo').value = ejemplo.titulo;
  if (!$('incDescripcion').value.trim()) $('incDescripcion').value = ejemplo.descripcion;
  return true;
}

export function seleccionarIconoDeTipo(pickerId, icono) {
  if (!icono) return;
  seleccionarIcono(pickerId, icono, null);
}

function plantillaEvidencia(elemento, indice, accion) {
  const esImagen = elemento.tipo?.startsWith('image/');
  const esVideo = elemento.tipo?.startsWith('video/');
  return `
    <div class="evidence-item">
      ${
        esImagen
          ? `<img src="${esc(elemento.url || elemento.vistaPrevia)}" alt="${esc(elemento.nombre)}">`
          : esVideo
            ? `<video src="${esc(elemento.url || elemento.vistaPrevia)}" muted preload="metadata"></video>`
            : `<div class="ev-file"><i class="bi bi-file-earmark-fill"></i></div>`
      }
      <div class="ev-name" title="${esc(elemento.nombre)}">${esc(elemento.nombre)}</div>
      <button class="ev-remove" data-action="${accion}" data-id="${indice}">&times;</button>
    </div>`;
}

export function renderEvidencia(lista = []) {
  const contenedor = $('evidenceList');
  if (!contenedor) return;
  contenedor.innerHTML = lista
    .map((elemento, i) => plantillaEvidencia(elemento, i, 'incidencias:quitarEvidencia'))
    .join('');
}

export function renderEvidenciaResolver(lista = []) {
  const contenedor = $('resolverEvidenceList');
  if (!contenedor) return;
  contenedor.innerHTML = lista
    .map((elemento, i) => plantillaEvidencia(elemento, i, 'incidencias:quitarEvidenciaResolver'))
    .join('');
}

export function abrirResolver(id) {
  $('resolverId').value = id;
  $('resolverTexto').value = '';
  $('resolverEvidenceList').innerHTML = '';
}

export function leerResolver() {
  return {
    id: $('resolverId').value,
    texto: $('resolverTexto').value.trim()
  };
}

/** Entradas de archivo de cada modal (el controlador las dispara). */
export function entradaEvidencia() {
  return $('incEvidencia');
}

export function entradaEvidenciaResolver() {
  return $('resolverEvidencia');
}
