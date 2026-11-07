/**
 * Vista del formulario de incidencia (reportar/editar) y del modal de resolución.
 * El estado temporal (ubicación, zona, evidencia) lo guarda el controlador en
 * el store; aquí solo se pinta.
 */
import { $, esc } from '../core/utils.js';
import { esPersonal } from '../core/roles.js';
import { seleccionarIcono, limpiarPicker, iconoSeleccionado } from './tipos.view.js';

const ICONOS_STATUS = {
  ok: 'bi-check-circle-fill',
  error: 'bi-exclamation-triangle-fill',
  loading: 'bi-hourglass-split'
};

/** Deja el formulario listo para un reporte nuevo. */
export function prepararAlta(usuario = null, municipios = [], municipioActivo = null) {
  $('modalIncTitle').textContent = 'Reportar incidencia';
  $('incGuardarTexto').textContent = 'Enviar reporte';

  // El municipio de la sesión ya viene elegido: no se vuelve a preguntar salvo
  // que la persona marque «Estoy reportando en otro municipio».
  renderSelectMunicipios(municipios, municipioActivo?.id || '', usuario);
  const selector = $('incMunicipio');
  if (selector) selector.disabled = false;
  const otro = $('incOtroMunicipio');
  if (otro) otro.checked = false;
  $('incMunicipioBox')?.classList.add('u-oculto');
  const cajaOtro = $('incOtroMunicipioBox');
  if (cajaOtro) {
    cajaOtro.classList.toggle(
      'u-oculto',
      municipiosPermitidos(usuario, municipios).length <= 1
    );
  }
  actualizarResumenMunicipio(municipioActivo);

  $('incTipo').value = '';
  $('incTitulo').value = '';
  $('incDescripcion').value = '';
  $('incIndicaciones').value = '';
  $('incCoordsTexto').value = '';
  renderAmbito('urbano');
  const bloqueVia = document.querySelector('.bloque-opcional');
  if (bloqueVia) bloqueVia.open = false;
  $('ejemploTipoBox').style.display = 'none';
  renderAviso(null);
  $('locStatus').style.display = 'none';
  $('evidenceList').innerHTML = '';
  renderIconoBox('');
  renderZonaBadge(null);
  renderFirma(usuario);
}

/**
 * Municipios que el usuario puede elegir en el formulario.
 * El personal municipal solo ve los que tiene asignados; el resto, el catálogo.
 */
export function municipiosPermitidos(usuario = null, municipios = []) {
  const asignados = Array.isArray(usuario?.municipios) ? usuario.municipios : [];
  if (esPersonal(usuario) && asignados.length) {
    return municipios.filter((m) => asignados.map(String).includes(String(m.id)));
  }
  return municipios;
}

/** Pinta el municipio que se usará si no se marca «otro municipio». */
export function actualizarResumenMunicipio(municipio = null) {
  const resumen = $('incMunicipioResumen');
  if (!resumen) return;
  resumen.textContent = municipio
    ? `${municipio.nombre}${municipio.estado ? `, ${municipio.estado}` : ''}`
    : 'Sin municipio seleccionado';
}

/**
 * Puebla el municipio del reporte, agrupado por estado.
 *
 * No se marca ninguna opción por defecto: el usuario debe elegir. Es el punto
 * que antes se autoseleccionaba con el municipio activo de la barra superior.
 */
export function renderSelectMunicipios(municipios = [], seleccionado = '', usuario = null) {
  const select = $('incMunicipio');
  if (!select) return;

  const disponibles = municipiosPermitidos(usuario, municipios);
  const porEstado = new Map();
  for (const municipio of disponibles) {
    const estado = municipio.estado || 'Sin estado';
    if (!porEstado.has(estado)) porEstado.set(estado, []);
    porEstado.get(estado).push(municipio);
  }

  const grupos = [...porEstado.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b), 'es'))
    .map(
      ([estado, lista]) =>
        `<optgroup label="${esc(estado)}">${lista
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
          .map(
            (m) =>
              `<option value="${esc(m.id)}"${m.id === seleccionado ? ' selected' : ''}>${esc(m.nombre)}</option>`
          )
          .join('')}</optgroup>`
    )
    .join('');

  select.innerHTML = '<option value="">— Selecciona un municipio —</option>' + grupos;
  select.value = seleccionado || '';
}

/** Concepto que sí deja elegir icono: los demás usan el de su tipo. */
const TIPO_OTRO = 'otro';

/**
 * Bloque del icono.
 *
 * Solo «Otro» permite elegir icono (los demás conceptos ya traen el suyo, y así
 * todos los reportes del mismo tipo se ven igual en el mapa y en el listado).
 * Cuando no aplica, el bloque se oculta y el selector se vacía para que no se
 * envíe ningún icono propio.
 */
export function renderIconoBox(tipoId, tipo = null) {
  const caja = $('iconoBox');
  const esOtro = tipoId === TIPO_OTRO;
  if (caja) caja.style.display = esOtro ? 'block' : 'none';

  if (esOtro && tipo?.icono) seleccionarIcono('iconPicker', tipo.icono, null);
  else limpiarPicker('iconPicker');
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

/**
 * Selecciona el ámbito y muestra u oculta los datos de la vía.
 * `urbano` mantiene la geocerca municipal; el resto permite puntos de carretera.
 */
export function renderAmbito(ambito = 'urbano') {
  const selector = $('incAmbito');
  if (selector) selector.value = ambito || 'urbano';
  const caja = $('viaBox');
  if (caja) caja.classList.toggle('u-oculto', (ambito || 'urbano') === 'urbano');
}

/** ¿El ámbito elegido es una vialidad fuera del polígono urbano? */
export function ambitoVial() {
  return ($('incAmbito')?.value || 'urbano') !== 'urbano';
}

/** Rellena el formulario con una incidencia existente. */
export function prepararEdicion(incidencia, municipios = []) {
  $('modalIncTitle').textContent = 'Editar incidencia';
  $('incGuardarTexto').textContent = 'Guardar cambios';
  renderSelectMunicipios(municipios, incidencia.municipioId || '');
  const selector = $('incMunicipio');
  // El municipio no se cambia al editar: la incidencia ya tiene su geocerca.
  if (selector) selector.disabled = true;
  $('incOtroMunicipioBox')?.classList.add('u-oculto');
  const caja = $('incMunicipioBox');
  if (caja) caja.classList.remove('u-oculto');
  actualizarResumenMunicipio(
    municipios.find((m) => String(m.id) === String(incidencia.municipioId)) || {
      nombre: incidencia.municipioNombre || incidencia.municipioId || '—'
    }
  );
  $('incTipo').value = incidencia.tipoId || '';
  $('incTitulo').value = incidencia.titulo || '';
  $('incDescripcion').value = incidencia.descripcion || '';
  $('incIndicaciones').value = incidencia.indicaciones || '';
  $('incCoordsTexto').value =
    incidencia.lat != null ? `${incidencia.lat.toFixed(6)}, ${incidencia.lng.toFixed(6)}` : '';
  renderAmbito(incidencia.ambito || 'urbano');
  $('incViaNombre').value = incidencia.viaNombre || '';
  $('incViaClave').value = incidencia.viaClave || '';
  $('incKilometro').value = incidencia.kilometro ?? '';
  $('incSentido').value = incidencia.sentido || '';
  $('incTramo').value = incidencia.tramo || '';
  $('incDependencia').value = incidencia.dependencia || '';
  // El icono propio de un reporte antiguo solo se conserva si es de «Otro».
  renderIconoBox(incidencia.tipoId);
  if (incidencia.tipoId === TIPO_OTRO && incidencia.iconoCustom) {
    seleccionarIcono('iconPicker', incidencia.iconoCustom, null);
  }
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
    municipioId: $('incMunicipio')?.value || null,
    ambito: $('incAmbito')?.value || 'urbano',
    viaNombre: $('incViaNombre')?.value.trim() || '',
    viaClave: $('incViaClave')?.value.trim() || '',
    kilometro: $('incKilometro')?.value === '' ? null : Number($('incKilometro').value),
    sentido: $('incSentido')?.value.trim() || '',
    tramo: $('incTramo')?.value.trim() || '',
    dependencia: $('incDependencia')?.value.trim() || '',
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
export function aplicarUbicacion({ lat, lng, zona, dentro = true, fueraPoligono = false, vial = false }) {
  const texto = $('incCoordsTexto');
  if (texto && lat != null) texto.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  if (!dentro) {
    mostrarLocStatus(
      'Ubicación fuera del municipio seleccionado. Elige un punto dentro del área marcada en el mapa.',
      'error'
    );
    renderZonaBadge(null);
    return;
  }

  if (vial && fueraPoligono) {
    mostrarLocStatus(
      'Punto de vialidad fuera del polígono municipal: se guardará con el municipio de referencia.',
      'ok'
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
    <span class="u-opacidad-80 u-capitalizar">(${esc(zona.tipo)})</span>`;
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

/**
 * Aviso del concepto.
 *
 * Algunos conceptos son delicados y traen su propio `aviso` (por ejemplo
 * «Sitio peligroso», que avisa de la inseguridad de una zona y aclara que no se
 * señala a nadie). Se muestra al elegir el tipo, tanto al reportar como al
 * abrir un reporte existente.
 */
export function renderAviso(tipo = null) {
  const caja = $('avisoTipoBox');
  if (!caja) return;
  const texto = tipo?.aviso || '';
  $('avisoTipoTexto').textContent = texto;
  caja.style.display = texto ? 'flex' : 'none';
}

/** Copia el ejemplo a los campos vacíos (equivale a `Incidencias.usarEjemplo`). */
export function usarEjemplo(tipoId, ejemplos = {}) {
  const ejemplo = ejemplos[tipoId];
  if (!ejemplo) return false;
  if (!$('incTitulo').value.trim()) $('incTitulo').value = ejemplo.titulo;
  if (!$('incDescripcion').value.trim()) $('incDescripcion').value = ejemplo.descripcion;
  return true;
}

function plantillaEvidencia(elemento, indice, accion) {
  const esImagen = elemento.tipo?.startsWith('image/');
  // Ya no se pueden adjuntar videos; la rama queda para evidencia antigua.
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
  if ($('resolverCosto')) $('resolverCosto').value = '';
  $('resolverEvidenceList').innerHTML = '';
  const desglose = $('resolverDesglose');
  if (desglose) desglose.innerHTML = '';
  agregarConceptoResolver();
}

function dinero(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '$0.00';
  return numero.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

/** Recalcula el total visible del desglose. */
export function actualizarTotalDesglose() {
  const total = [...document.querySelectorAll('#resolverDesglose [data-campo="monto"]')]
    .reduce((suma, campo) => {
      const numero = Number(campo.value);
      return suma + (Number.isFinite(numero) ? numero : 0);
    }, 0);
  const etiqueta = $('resolverDesgloseTotal');
  if (etiqueta) etiqueta.textContent = dinero(total);
}

/** Agrega una fila de concepto al desglose de la resolución. */
export function agregarConceptoResolver(concepto = '', monto = '', nota = '') {
  const contenedor = $('resolverDesglose');
  if (!contenedor) return;
  const fila = document.createElement('div');
  fila.className = 'resolver-concepto filter-row u-mb-6';
  fila.innerHTML = `
    <div class="form-group">
      <label>Concepto</label>
      <input type="text" data-campo="concepto" maxlength="80" autocomplete="off"
             placeholder="Ej. Materiales" value="${esc(concepto)}">
    </div>
    <div class="form-group">
      <label>Monto (MXN)</label>
      <input type="number" data-campo="monto" min="0" step="0.01" data-input="resolver:calcular"
             placeholder="0.00" value="${esc(monto)}">
    </div>
    <div class="form-group">
      <label>Nota</label>
      <input type="text" data-campo="nota" maxlength="300" autocomplete="off"
             placeholder="Opcional" value="${esc(nota)}">
    </div>
    <div class="form-group u-flex-end">
      <button type="button" class="btn btn-outline btn-sm" data-action="resolver:quitarConcepto"
              title="Quitar concepto" aria-label="Quitar concepto"><i class="bi bi-trash"></i></button>
    </div>`;
  contenedor.append(fila);
  actualizarTotalDesglose();
}

/** Quita la fila de concepto a la que pertenece el botón. */
export function quitarConceptoResolver(elemento) {
  elemento?.closest?.('.resolver-concepto')?.remove();
  actualizarTotalDesglose();
}

export function leerResolver() {
  const desglose = [...document.querySelectorAll('#resolverDesglose .resolver-concepto')]
    .map((fila) => ({
      concepto: fila.querySelector('[data-campo="concepto"]')?.value.trim() || '',
      monto: fila.querySelector('[data-campo="monto"]')?.value || '',
      nota: fila.querySelector('[data-campo="nota"]')?.value.trim() || ''
    }))
    .filter((item) => item.concepto || item.monto);
  return {
    id: $('resolverId').value,
    texto: $('resolverTexto').value.trim(),
    costo: $('resolverCosto')?.value || '',
    desglose
  };
}

/** Entradas de archivo de cada modal (el controlador las dispara). */
export function entradaEvidencia() {
  return $('incEvidencia');
}

export function entradaEvidenciaResolver() {
  return $('resolverEvidencia');
}

export function entradaDocumentosReparacion() {
  return $('reparacionDocumentos');
}
