/**
 * Contacto ciudadano, sugerencias y bandeja de mensajes del personal.
 */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, loading, preguntar, toast } from '../core/ui.js';
import { intentar, mensajeDeError } from '../core/errores.js';
import { $, esc, fmtFecha } from '../core/utils.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { api, urlPrivada } from '../core/api.js';
import { verAdjunto } from '../core/visor-adjunto.js';
import { catalogosService } from '../services/catalogos.service.js';
import { contactosFuncionariosService } from '../services/contactos-funcionarios.service.js';
import { bloqueosService } from '../services/bloqueos.service.js';
import { firmasService } from '../services/firmas.service.js';

let hiloActivo = null;
let contactoDirectoActivo = null;
let hilosCache = [];
let bloqueosCache = [];

function mensaje(caja, texto, tipo = 'info') {
  const elemento = $(caja);
  if (!elemento) return;
  elemento.className = `publico-msg ${tipo}`;
  elemento.textContent = texto;
  elemento.classList.remove('u-oculto');
}

function limpiarMensaje(caja) {
  $(caja)?.classList.add('u-oculto');
}

/* ------------------------------- contacto -------------------------------- */

function estadosDeMunicipios() {
  const municipios = store.estado.municipios || [];
  return [...new Set(municipios.map((m) => m.estado).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), 'es')
  );
}

function llenarEstadosContacto(seleccionado = '') {
  const select = $('conEstado');
  if (!select) return;
  select.innerHTML =
    '<option value="">— Selecciona un estado —</option>' +
    estadosDeMunicipios()
      .map(
        (estado) =>
          `<option value="${esc(estado)}"${estado === seleccionado ? ' selected' : ''}>${esc(estado)}</option>`
      )
      .join('');
}

function llenarMunicipiosContacto(estado = '', seleccionado = '') {
  const select = $('conMunicipio');
  if (!select) return;
  const municipios = (store.estado.municipios || [])
    .filter((m) => !estado || m.estado === estado)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  select.innerHTML =
    '<option value="">— Selecciona un municipio —</option>' +
    municipios
      .map(
        (m) =>
          `<option value="${esc(m.id)}"${m.id === seleccionado ? ' selected' : ''}>${esc(m.nombre)}</option>`
      )
      .join('');
}

function limpiarFuncionarios() {
  const contenedor = $('conFuncionarios');
  if (contenedor) {
    contenedor.innerHTML =
      '<p class="campo-nota">Elige el estado y el municipio para ver a sus funcionarios.</p>';
  }
  $('conSinFuncionario')?.classList.add('u-oculto');
}

async function cargarFuncionariosContacto() {
  const municipioId = $('conMunicipio')?.value;
  const contenedor = $('conFuncionarios');
  if (!municipioId || !contenedor) return limpiarFuncionarios();
  contenedor.innerHTML = '<p class="campo-nota">Buscando funcionarios…</p>';
  $('conSinFuncionario')?.classList.add('u-oculto');
  try {
    const { funcionarios = [] } = await contactosFuncionariosService.funcionarios(municipioId);
    if (!funcionarios.length) {
      contenedor.innerHTML = '<p class="campo-nota">Sin funcionarios disponibles.</p>';
      $('conSinFuncionario')?.classList.remove('u-oculto');
      return;
    }
    contenedor.innerHTML = funcionarios
      .map(
        (f) => `
        <label class="check-line">
          <input type="checkbox" class="contacto-funcionario" value="${esc(f.id)}">
          <span>${esc(f.nombre)} <span class="campo-nota">${esc(f.rol)}</span></span>
        </label>`
      )
      .join('');
  } catch (error) {
    contenedor.innerHTML = `<p class="campo-nota">${esc(mensajeDeError(error))}</p>`;
  }
}

function abrirContacto() {
  limpiarMensaje('conEstadoMensaje');
  const anonimo = sesion.esAnonimo();
  $('conAnonimo')?.classList.toggle('u-oculto', !anonimo);
  const formulario = $('formContacto');
  if (formulario) formulario.classList.toggle('u-oculto', anonimo);
  if (anonimo) {
    abrirModal('modalContacto');
    return;
  }
  const activo = store.estado.municipioActivo;
  llenarEstadosContacto(activo?.estado || '');
  llenarMunicipiosContacto(activo?.estado || '', activo?.id || '');
  limpiarFuncionarios();
  if (activo?.id) cargarFuncionariosContacto();
  abrirModal('modalContacto');
}

async function enviarContacto() {
  if (sesion.esAnonimo()) {
    return mensaje('conEstadoMensaje', 'Crea una cuenta para contactar a un funcionario.', 'err');
  }
  const seleccionados = [...document.querySelectorAll('.contacto-funcionario:checked')].map(
    (c) => c.value
  );
  const archivo = $('conArchivo')?.files?.[0] || null;
  const datos = {
    municipioId: $('conMunicipio').value,
    funcionarioIds: seleccionados,
    asunto: $('conAsunto').value.trim(),
    mensaje: $('conMensaje').value.trim(),
    adjuntos: []
  };
  if (!datos.municipioId || !seleccionados.length || !datos.asunto || (!datos.mensaje && !archivo)) {
    return mensaje(
      'conEstado',
      'Elige municipio y al menos un funcionario; escribe asunto y un mensaje o adjunto.',
      'err'
    );
  }
  loading(true, 'Enviando mensaje…');
  try {
    if (archivo) {
      const subida = await api.subir('/adjuntos', [archivo], { campo: 'archivo' });
      datos.adjuntos = [subida.adjunto.id];
    }
    const { contacto } = await contactosFuncionariosService.crear(datos);
    mensaje(
      'conEstadoMensaje',
      `Mensaje enviado. Folio ${contacto.folio}. Los funcionarios seleccionados lo verán en su bandeja.`,
      'ok'
    );
    $('formContacto').reset();
    limpiarFuncionarios();
  } catch (error) {
    mensaje('conEstadoMensaje', mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

async function solicitarAdminContacto() {
  const municipioId = $('conMunicipio')?.value;
  if (!municipioId) {
    return mensaje('conEstadoMensaje', 'Elige un municipio para avisar al administrador.', 'err');
  }
  try {
    const { solicitud } = await contactosFuncionariosService.solicitarAdmin({
      municipioId,
      mensaje: $('conMensaje')?.value?.trim() || 'El municipio no tiene funcionarios disponibles.'
    });
    mensaje(
      'conEstadoMensaje',
      `Aviso enviado al administrador. Folio ${solicitud.folio}. También puedes crear una recolección de firmas.`,
      'ok'
    );
  } catch (error) {
    mensaje('conEstadoMensaje', mensajeDeError(error), 'err');
  }
}

async function crearRecoleccionContacto() {
  const municipioId = $('conMunicipio')?.value;
  if (!municipioId) {
    return mensaje('conEstadoMensaje', 'Elige un municipio para crear la recolección.', 'err');
  }
  const meta = Number($('conRecoleccionMeta')?.value) || 100;
  try {
    await firmasService.crearMunicipal({
      municipioId,
      titulo: `Funcionarios para ${$('conMunicipio')?.selectedOptions?.[0]?.textContent || 'el municipio'}`,
      descripcion: 'Solicitud ciudadana para que el municipio se sume al sistema y atienda las incidencias.',
      meta
    });
    mensaje(
      'conEstadoMensaje',
      'Recolección de firmas creada. Puedes compartirla para que más ciudadanos firmen.',
      'ok'
    );
  } catch (error) {
    mensaje('conEstadoMensaje', mensajeDeError(error), 'err');
  }
}

/* ------------------------------ sugerencias ------------------------------ */

function abrirSugerencia() {
  limpiarMensaje('sugEstado');
  limpiarMensaje('sugConsulta');
  abrirModal('modalSugerencia');
}

async function enviarSugerencia() {
  const datos = {
    tipo: $('sugTipo').value,
    nombre: $('sugNombre').value.trim(),
    correo: $('sugCorreo').value.trim(),
    mensaje: $('sugMensaje').value.trim(),
    municipioId: store.estado.municipioActivo?.id || null
  };
  if (!datos.mensaje) return mensaje('sugEstado', 'Escribe tu sugerencia.', 'err');
  loading(true, 'Enviando sugerencia…');
  try {
    const respuesta = await api.post('/publico/sugerencias', datos);
    mensaje(
      'sugEstado',
      `Gracias. Guarda el folio ${respuesta.folio} para consultar el estado.`,
      'ok'
    );
    $('formSugerencia').reset();
  } catch (error) {
    mensaje('sugEstado', mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

async function consultarSugerencia(evento) {
  evento.preventDefault();
  const folio = $('sugFolioConsulta').value.trim();
  const correo = $('sugCorreoConsulta').value.trim();
  if (!folio) return mensaje('sugConsulta', 'Escribe el folio.', 'err');
  loading(true, 'Consultando…');
  try {
    const datos = await api.get(
      `/publico/sugerencias/${encodeURIComponent(folio)}?correo=${encodeURIComponent(correo)}`
    );
    mensaje(
      'sugConsulta',
      `Folio ${datos.folio}: ${datos.estado}${datos.respuesta ? ` · ${datos.respuesta}` : ''}`,
      'info'
    );
  } catch (error) {
    mensaje('sugConsulta', mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

/* -------------------------------- bandeja -------------------------------- */

const ETIQUETAS_TIPO = {
  interno: 'Mensaje interno',
  difusion_municipio: 'Difusión municipal',
  difusion_estado: 'Difusión estatal'
};

/** Pie del modal: solo lo usa el formulario de mensaje nuevo. */
function limpiarPie() {
  const pie = $('bandejaPie');
  if (!pie) return;
  pie.innerHTML = '';
  pie.classList.add('u-oculto');
}

function htmlAdjuntoDirecto(adjunto) {
  if (!adjunto?.url) return '';
  const url = esc(urlPrivada(adjunto.url));
  const id = esc(adjunto.id || '');
  const tipo = esc(adjunto.tipo || '');
  const nombre = esc(adjunto.nombre || 'Archivo adjunto');
  if (String(adjunto.tipo || '').startsWith('image/')) {
    return `<button type="button" class="bandeja-adjunto-imagen" data-action="bandeja:verAdjunto" data-id="${id}" data-tipo="${tipo}" data-nombre="${nombre}" data-url="${url}" title="Ver ${nombre}"><img src="${url}" alt="${nombre}"></button>`;
  }
  const icono = String(adjunto.tipo || '') === 'application/pdf'
    ? 'bi-file-earmark-pdf'
    : 'bi-file-earmark-text';
  return `<button type="button" class="bandeja-adjunto" data-action="bandeja:verAdjunto" data-id="${id}" data-tipo="${tipo}" data-nombre="${nombre}" data-url="${url}" title="Ver ${nombre}"><i class="bi ${icono}"></i> ${nombre} <span class="bandeja-adjunto-ver">Ver</span></button>`;
}

/* ------------------------------- bloqueos -------------------------------- */

/** Botón para bloquear o desbloquear a la otra persona de la conversación. */
function botonBloqueo(username, nombre = '') {
  if (!username) return '';
  const bloqueo = bloqueosCache.find((b) => b.bloqueadoUsername === username);
  if (bloqueo) {
    return `<button type="button" class="btn btn-sm btn-outline" data-action="bandeja:desbloquear" data-valor="${esc(username)}" title="Volver a recibir sus mensajes">
      <i class="bi bi-unlock"></i> Desbloquear
    </button>`;
  }
  return `<button type="button" class="btn btn-sm btn-outline" data-action="bandeja:bloquear" data-valor="${esc(username)}" data-nombre="${esc(nombre || username)}" title="Dejar de recibir sus mensajes">
    <i class="bi bi-slash-circle"></i> Bloquear
  </button>`;
}

async function cargarBloqueos() {
  if (!sesion.usuario || sesion.esAnonimo()) {
    bloqueosCache = [];
    return;
  }
  try {
    const { bloqueos } = await bloqueosService.listar();
    bloqueosCache = bloqueos || [];
  } catch {
    bloqueosCache = [];
  }
}

function pintarBloqueados() {
  const caja = $('bandejaBloqueadosLista');
  if (!caja) return;
  if (!bloqueosCache.length) {
    caja.innerHTML = '<div class="vacio-suave u-p-12">No has bloqueado a ninguna cuenta.</div>';
    return;
  }
  caja.innerHTML = bloqueosCache
    .map(
      (bloqueo) => `<div class="bandeja-hilo">
        <div class="bandeja-hilo-titulo">${esc(bloqueo.bloqueadoNombre || bloqueo.bloqueadoUsername)}</div>
        <div class="bandeja-hilo-meta">${esc(bloqueo.bloqueadoUsername || '')} · ${esc(fmtFecha(bloqueo.creadoEn))}</div>
        ${bloqueo.motivo ? `<div class="bandeja-hilo-meta">${esc(bloqueo.motivo)}</div>` : ''}
        <div class="u-mt-6">
          <button type="button" class="btn btn-sm btn-outline" data-action="bandeja:desbloquear" data-valor="${esc(bloqueo.bloqueadoUsername || bloqueo.bloqueadoId)}">
            <i class="bi bi-unlock"></i> Desbloquear
          </button>
        </div>
      </div>`
    )
    .join('');
}

async function bloquearCuenta(username, nombre) {
  if (!username) return;
  const motivo = '';
  if (!(await preguntar(`¿Bloquear a ${nombre || username}? No volverás a recibir sus mensajes y no podrás escribirle hasta que lo deshagas.`))) {
    return;
  }
  loading(true, 'Bloqueando…');
  try {
    await bloqueosService.bloquear({ username, motivo });
    await cargarBloqueos();
    toast('Cuenta bloqueada', 'ok');
    await refrescarConversacion();
  } catch (error) {
    toast(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

async function desbloquearCuenta(username) {
  if (!username) return;
  loading(true, 'Desbloqueando…');
  try {
    await bloqueosService.desbloquear(username);
    await cargarBloqueos();
    toast('Cuenta desbloqueada', 'ok');
    await refrescarConversacion();
  } catch (error) {
    toast(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

/** Repinta el panel y la conversación abierta tras bloquear o desbloquear. */
async function refrescarConversacion() {
  pintarBloqueados();
  if (hiloActivo) await abrirHilo(hiloActivo);
  else if (contactoDirectoActivo) await abrirContactoDirecto(contactoDirectoActivo);
}

function pintarDirectos(contactos = []) {
  const caja = $('bandejaDirectosLista');
  if (!caja) return;
  if (!contactos.length) {
    caja.innerHTML = '<div class="vacio-suave u-p-12">No tienes contactos directos.</div>';
    return;
  }
  caja.innerHTML = contactos
    .map(
      (contacto) => `<div class="bandeja-hilo${contacto.id === contactoDirectoActivo ? ' activo' : ''}" data-action="bandeja:contacto" data-id="${esc(contacto.id)}">
        <div class="bandeja-hilo-titulo">${esc(contacto.asunto)}</div>
        <div class="bandeja-hilo-meta"><span class="bandeja-etiqueta">Contacto directo</span> · ${esc(contacto.folio)} · ${esc(contacto.estado)}</div>
        <div class="bandeja-hilo-meta">${esc(String(contacto.mensaje || '').slice(0, 90) || 'Con adjunto')}</div>
      </div>`
    )
    .join('');
}

function pintarContactoDirecto(contacto) {
  const caja = $('bandejaDirectoConversacion');
  if (!caja) return;
  const otro = contacto.contraparte || null;
  const inicial = contacto.mensaje || (contacto.adjuntos || []).length
    ? `<div class="bandeja-mensaje">
        <div class="bandeja-mensaje-meta">${esc(contacto.deNombre || 'Ciudadano')} · ${esc(fmtFecha(contacto.creadoEn))}</div>
        ${contacto.mensaje ? `<div class="bandeja-mensaje-cuerpo">${esc(contacto.mensaje)}</div>` : ''}
        <div class="bandeja-adjuntos">${(contacto.adjuntos || []).map(htmlAdjuntoDirecto).join('')}</div>
      </div>`
    : '';
  const cuerpo = inicial + (contacto.mensajes || [])
    .map((m) => `<div class="bandeja-mensaje${m.deUsuarioId === sesion.usuario?.id ? ' mio' : ''}">
        <div class="bandeja-mensaje-meta">${esc(m.deNombre)} · ${esc(fmtFecha(m.creadoEn))}</div>
        ${m.cuerpo ? `<div class="bandeja-mensaje-cuerpo">${esc(m.cuerpo)}</div>` : ''}
        <div class="bandeja-adjuntos">${(m.adjuntos || []).map(htmlAdjuntoDirecto).join('')}</div>
      </div>`)
    .join('');
  caja.innerHTML = `
    <div class="bandeja-directo-cabecera">
      <div><span class="bandeja-etiqueta">Contacto directo</span> <strong>${esc(contacto.asunto)}</strong></div>
      <div class="u-fila">
        <span class="campo-nota">${esc(contacto.folio)} · ${esc(contacto.estado)}</span>
        ${botonBloqueo(otro?.username, otro?.nombre)}
        <button type="button" class="btn btn-sm btn-outline" data-action="bandeja:reportar" data-canal="directo" data-id="${esc(contacto.id)}" title="Reportar esta conversación">
          <i class="bi bi-flag"></i> Reportar
        </button>
      </div>
    </div>
    <div class="bandeja-mensajes">${cuerpo || '<div class="vacio-suave">Sin mensajes.</div>'}</div>
    <div class="bandeja-form bandeja-form-adjunto">
      <textarea id="bandejaDirectoTexto" maxlength="4000" placeholder="Escribe tu respuesta…"></textarea>
      <label class="btn btn-outline btn-sm" for="bandejaDirectoArchivo" title="Adjuntar archivo"><i class="bi bi-paperclip"></i><input type="file" id="bandejaDirectoArchivo" class="u-oculto" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.docx,.xlsx,.pptx"></label>
      <button type="button" class="btn btn-primary" data-action="bandeja:directoResponder" data-id="${esc(contacto.id)}">
        <i class="bi bi-send"></i>
      </button>
    </div>`;
  limpiarPie();
}

async function cargarDirectos() {
  const { contactos } = sesion.esEmpleado()
    ? await contactosFuncionariosService.bandeja()
    : await contactosFuncionariosService.mios();
  pintarDirectos(contactos || []);
}

async function abrirContactoDirecto(id) {
  if (!sesion.usuario || sesion.esAnonimo()) return;
  contactoDirectoActivo = id;
  limpiarPie();
  const { contacto } = await contactosFuncionariosService.detalle(id);
  pintarContactoDirecto(contacto);
  await cargarDirectos();
}

async function responderContactoDirecto(id) {
  const texto = $('bandejaDirectoTexto')?.value.trim() || '';
  const archivo = $('bandejaDirectoArchivo')?.files?.[0] || null;
  if (!texto && !archivo) return toast('Escribe una respuesta o adjunta un archivo', 'err');
  loading(true, 'Enviando…');
  try {
    let adjuntos = [];
    if (archivo) {
      const subida = await api.subir('/adjuntos', [archivo], { campo: 'archivo' });
      adjuntos = [subida.adjunto.id];
    }
    await contactosFuncionariosService.responder(id, texto, adjuntos);
    await abrirContactoDirecto(id);
    toast('Respuesta enviada', 'ok');
  } catch (error) {
    toast(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

function pintarHilos(hilos = []) {
  hilosCache = hilos;
  const caja = $('bandejaHilos');
  if (!caja) return;
  if (!hilos.length) {
    caja.innerHTML = '<div class="vacio-suave u-p-12">No tienes mensajes todavía.</div>';
    return;
  }
  caja.innerHTML = hilos
    .map(
      (h) => `<div class="bandeja-hilo${h.hilo === hiloActivo ? ' activo' : ''}" data-action="bandeja:hilo" data-id="${esc(h.hilo)}">
        <div class="bandeja-hilo-titulo">${esc(h.asunto)}${h.noLeidos ? ` <span class="inc-badge badge-rojo">${h.noLeidos}</span>` : ''}</div>
        <div class="bandeja-hilo-meta"><span class="bandeja-etiqueta">${esc(ETIQUETAS_TIPO[h.tipo] || 'Mensaje interno')}</span></div>
        <div class="bandeja-hilo-meta">${esc(h.ultimoDe)} · ${esc(fmtFecha(h.ultimaFecha))}</div>
        <div class="bandeja-hilo-meta">${esc(h.ultimoMensaje || 'Archivo adjunto')}</div>
      </div>`
    )
    .join('');
}

function pintarConversacion(mensajes = []) {
  const caja = $('bandejaConversacion');
  if (!caja) return;
  if (!mensajes.length) {
    caja.innerHTML = '<div class="vacio-suave">Elige un hilo para ver la conversación.</div>';
    limpiarPie();
    return;
  }
  const resumen = hilosCache.find((h) => h.hilo === hiloActivo) || {};
  const otro = mensajes
    .map((m) => m.deUsuario)
    .find((usuario) => usuario && usuario !== sesion.usuario?.username);
  const cuerpo = mensajes
    .map((m) => {
      const mio = m.deUsuario === sesion.usuario?.username;
      return `<div class="bandeja-mensaje${mio ? ' mio' : ''}">
        <div class="bandeja-mensaje-meta">${esc(m.deNombre)} · ${esc(fmtFecha(m.creadoEn))}</div>
        ${m.cuerpo ? `<div class="bandeja-mensaje-cuerpo">${esc(m.cuerpo)}</div>` : ''}
        <div class="bandeja-adjuntos">${(m.adjuntos || []).map(htmlAdjuntoDirecto).join('')}</div>
      </div>`;
    })
    .join('');
  caja.innerHTML = `
    <div class="bandeja-directo-cabecera">
      <div><span class="bandeja-etiqueta">${esc(ETIQUETAS_TIPO[resumen.tipo] || 'Mensaje interno')}</span> <strong>${esc(resumen.asunto || 'Conversación')}</strong></div>
      <div class="u-fila">
        ${resumen.tipo === 'interno' ? botonBloqueo(otro, '') : ''}
        <button type="button" class="btn btn-sm btn-outline" data-action="bandeja:reportar" data-canal="mensaje" data-id="${esc(hiloActivo || '')}" title="Reportar esta conversación">
          <i class="bi bi-flag"></i> Reportar
        </button>
      </div>
    </div>
    <div class="bandeja-mensajes">${cuerpo}</div>
    <div class="bandeja-form">
      <textarea id="bandejaTexto" maxlength="4000" placeholder="Escribe tu respuesta…"></textarea>
      <label class="btn btn-outline btn-sm" for="bandejaArchivo" title="Adjuntar archivo"><i class="bi bi-paperclip"></i><input type="file" id="bandejaArchivo" class="u-oculto" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.docx,.xlsx,.pptx"></label>
      <button type="button" class="btn btn-primary" data-action="bandeja:responder">
        <i class="bi bi-send"></i>
      </button>
    </div>`;
  limpiarPie();
}

function pintarFormularioNuevo() {
  const caja = $('bandejaConversacion');
  if (!caja) return;
  const usuarios = (store.estado.usuarios || []).filter(
    (u) => u.username !== sesion.usuario?.username
  );
  caja.innerHTML = `
    <div class="form-group">
      <label for="msjPara">Destinatario</label>
      <select id="msjPara">
        <option value="">— Selecciona —</option>
        ${usuarios
          .map((u) => `<option value="${esc(u.username)}">${esc(u.nombre)} (${esc(u.rol)})</option>`)
          .join('')}
      </select>
    </div>
    <div class="form-group">
      <label for="msjAsunto">Asunto</label>
      <input type="text" id="msjAsunto" maxlength="160" autocomplete="off" placeholder="Motivo del mensaje">
    </div>
    <div class="form-group">
      <label for="msjCuerpo">Mensaje</label>
      <textarea id="msjCuerpo" rows="4" maxlength="4000" placeholder="Escribe el mensaje"></textarea>
    </div>
    <div class="form-group">
      <label for="msjArchivo">Adjunto (opcional)</label>
      <input type="file" id="msjArchivo" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.docx,.xlsx,.pptx">
      <p class="campo-nota">Imágenes, PDF o documentos de Office. Máximo 10 MB.</p>
    </div>`;
  const pie = $('bandejaPie');
  if (pie) {
    pie.innerHTML = `
      <button type="button" class="btn btn-outline" data-action="bandeja:recargar">Cancelar</button>
      <button type="button" class="btn btn-primary" data-action="bandeja:enviar">
        <i class="bi bi-send"></i> Enviar
      </button>`;
    pie.classList.remove('u-oculto');
  }
}

async function cargarHilos() {
  const { hilos } = await api.get('/mensajes');
  pintarHilos(hilos);
  const noLeidos = hilos.reduce((total, h) => total + (h.noLeidos || 0), 0);
  const badge = $('bandeja-badge');
  if (badge) {
    badge.textContent = String(noLeidos);
    badge.classList.toggle('u-oculto', noLeidos === 0);
  }
}

async function abrirHilo(hilo) {
  hiloActivo = hilo;
  limpiarPie();
  const { mensajes } = await api.get(`/mensajes/${encodeURIComponent(hilo)}`);
  pintarConversacion(mensajes);
  await cargarHilos();
}

async function enviarMensajeNuevo() {
  const archivo = $('msjArchivo')?.files?.[0] || null;
  const datos = {
    paraUsuario: $('msjPara').value,
    asunto: $('msjAsunto').value.trim(),
    cuerpo: $('msjCuerpo').value.trim(),
    adjuntos: []
  };
  if (!datos.paraUsuario || !datos.asunto || (!datos.cuerpo && !archivo)) {
    return toast('Completa destinatario, asunto y un mensaje o adjunto', 'err');
  }
  loading(true, 'Enviando…');
  try {
    if (archivo) {
      const subida = await api.subir('/adjuntos', [archivo], { campo: 'archivo' });
      datos.adjuntos = [subida.adjunto.id];
    }
    const { mensaje: creado } = await api.post('/mensajes', datos);
    toast('Mensaje enviado', 'ok');
    await abrirHilo(creado.hilo);
  } catch (error) {
    toast(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

async function responderHilo() {
  const cuerpo = $('bandejaTexto')?.value.trim() || '';
  const archivo = $('bandejaArchivo')?.files?.[0] || null;
  if (!cuerpo && !archivo) return toast('Escribe una respuesta o adjunta un archivo', 'err');
  loading(true, 'Enviando…');
  try {
    let adjuntos = [];
    if (archivo) {
      const subida = await api.subir('/adjuntos', [archivo], { campo: 'archivo' });
      adjuntos = [subida.adjunto.id];
    }
    await api.post('/mensajes', { hilo: hiloActivo, cuerpo, adjuntos });
    await abrirHilo(hiloActivo);
    toast('Respuesta enviada', 'ok');
  } catch (error) {
    toast(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

function pintarContacto(mensajes = []) {
  const caja = $('bandejaContactoLista');
  if (!caja) return;
  if (!mensajes.length) {
    caja.innerHTML = '<div class="vacio-suave u-p-12">No hay mensajes de contacto.</div>';
    return;
  }
  caja.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Folio</th><th>Persona</th><th>Asunto</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${mensajes
            .map(
              (m) => `<tr>
                <td><code>${esc(m.folio)}</code></td>
                <td>${esc(m.nombre)}<div class="campo-nota">${esc(m.correo)}</div></td>
                <td>${esc(m.asunto)}<div class="campo-nota">${esc(m.mensaje.slice(0, 120))}</div></td>
                <td>${esc(m.estado)}</td>
                <td>
                  <button class="btn btn-sm btn-outline" data-action="contacto:responder" data-id="${esc(m.id)}">
                    <i class="bi bi-reply"></i> Responder
                  </button>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function pintarSugerencias(lista = []) {
  const caja = $('bandejaSugerenciasLista');
  if (!caja) return;
  if (!lista.length) {
    caja.innerHTML = '<div class="vacio-suave u-p-12">No hay sugerencias.</div>';
    return;
  }
  caja.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Folio</th><th>Tipo</th><th>Sugerencia</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${lista
            .map(
              (s) => `<tr>
                <td><code>${esc(s.folio)}</code></td>
                <td>${esc(s.tipo)}</td>
                <td>${esc(s.mensaje.slice(0, 160))}<div class="campo-nota">${esc(s.correo || 'sin correo')}</div></td>
                <td>${esc(s.estado)}</td>
                <td>
                  <button class="btn btn-sm btn-outline" data-action="sugerencias:responder" data-id="${esc(s.id)}">
                    <i class="bi bi-reply"></i> Responder
                  </button>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

async function cargarContacto() {
  const { mensajes } = await api.get('/contacto');
  pintarContacto(mensajes);
}

async function cargarSugerencias() {
  if (!sesion.esAlgunaAdmin()) {
    pintarSugerencias([]);
    return;
  }
  const municipio = store.estado.filtroSugerenciasMunicipio || null;
  // El filtro del acceso rápido es de una sola vez: al reabrir la bandeja se
  // vuelve a ver todo lo que permite el ámbito.
  if (municipio) store.actualizar({ filtroSugerenciasMunicipio: null });
  const consulta = municipio ? `?municipio=${encodeURIComponent(municipio)}` : '';
  const { sugerencias } = await api.get(`/sugerencias${consulta}`);
  pintarSugerencias(sugerencias);
}

/** Muestra u oculta la copia de mensajes y explica la consecuencia. */
function aplicarIncluirMensajes() {
  const incluir = $('reporteConvIncluirMensajes')?.checked !== false;
  $('reporteConvMensajes')?.classList.toggle('u-oculto', !incluir);
  $('reporteConvMensajesTitulo')?.classList.toggle('u-oculto', !incluir);
  const aviso = $('reporteConvAvisoMensajes');
  if (aviso) {
    aviso.textContent = incluir
      ? 'Se adjuntarán los últimos cinco mensajes de cada persona con sus archivos. La descripción siempre es obligatoria.'
      : 'No se adjuntarán mensajes: la moderación solo verá tu descripción y puede no aplicar medidas. La descripción siempre es obligatoria.';
  }
}

/** Abre el formulario de reporte con la vista previa de los mensajes. */
async function abrirReporteConversacion(canal, id) {
  if (!canal || !id) return;
  loading(true, 'Preparando el reporte…');
  try {
    const contexto = await api.get(
      `/reportes-conversacion/contexto?canal=${encodeURIComponent(canal)}&conversacionId=${encodeURIComponent(id)}`
    );
    if ($('reporteConvCanal')) $('reporteConvCanal').value = canal;
    if ($('reporteConvId')) $('reporteConvId').value = id;
    if ($('reporteConvResumen')) {
      $('reporteConvResumen').textContent = `${contexto.asunto}${
        contexto.folio ? ` · ${contexto.folio}` : ''
      } · Se reporta a ${contexto.objetivo?.nombre || 'la otra persona'}.`;
    }
    const motivo = $('reporteConvMotivo');
    if (motivo) {
      const motivos = store.estado.catalogos?.motivosDenuncia || {};
      motivo.innerHTML = Object.entries(motivos)
        .map(([valor, etiqueta]) => `<option value="${esc(valor)}">${esc(etiqueta)}</option>`)
        .join('');
    }
    if ($('reporteConvDetalle')) $('reporteConvDetalle').value = '';
    if ($('reporteConvIncluirMensajes')) $('reporteConvIncluirMensajes').checked = true;
    aplicarIncluirMensajes();
    const caja = $('reporteConvMensajes');
    if (caja) {
      caja.innerHTML =
        (contexto.mensajes || [])
          .map(
            (m) => `<div class="bandeja-reporte-mensaje">
              <div class="bandeja-mensaje-meta">${esc(m.nombre)} · ${esc(fmtFecha(m.fecha))}</div>
              ${m.cuerpo ? `<div class="bandeja-mensaje-cuerpo">${esc(m.cuerpo)}</div>` : ''}
              ${
                (m.adjuntos || []).length
                  ? `<div class="campo-nota">${m.adjuntos
                      .map((a) => `📎 ${esc(a.nombre)}`)
                      .join(' · ')}</div>`
                  : ''
              }
            </div>`
          )
          .join('') || '<p class="campo-nota">No hay mensajes recientes.</p>';
    }
    abrirModal('modalReporteConversacion', { nested: true });
  } finally {
    loading(false);
  }
}

async function enviarReporteConversacion() {
  const canal = $('reporteConvCanal')?.value;
  const conversacionId = $('reporteConvId')?.value;
  const motivo = $('reporteConvMotivo')?.value;
  const detalle = $('reporteConvDetalle')?.value.trim() || '';
  const incluirMensajes = $('reporteConvIncluirMensajes')?.checked !== false;
  if (!canal || !conversacionId) return;
  if (!motivo) return toast('Elige un motivo para el reporte', 'err');
  if (detalle.length < 10) {
    return toast('Describe en al menos 10 caracteres qué ocurrió', 'err');
  }
  loading(true, 'Enviando reporte…');
  try {
    await api.post('/reportes-conversacion', {
      canal,
      conversacionId,
      motivo,
      detalle,
      incluirMensajes
    });
    cerrarModal('modalReporteConversacion');
    toast('Reporte enviado a la moderación', 'ok');
  } catch (error) {
    toast(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

/** Abre la bandeja directamente en sugerencias, opcionalmente de un municipio. */
export async function abrirSugerenciasDeMunicipio(municipioId = null) {
  store.actualizar({ filtroSugerenciasMunicipio: municipioId });
  await abrirBandeja();
  await cambiarTab('sugerencias');
}

function abrirResponder(tipo, id, titulo) {
  $('respuestaTipo').value = tipo;
  $('respuestaId').value = id;
  $('respuestaTitulo').textContent = titulo;
  $('respuestaTexto').value = '';
  abrirModal('modalRespuesta', { nested: true });
}

async function enviarRespuesta() {
  const tipo = $('respuestaTipo').value;
  const id = $('respuestaId').value;
  const respuesta = $('respuestaTexto').value.trim();
  if (!respuesta) return toast('Escribe la respuesta', 'err');

  loading(true, 'Enviando respuesta…');
  try {
    if (tipo === 'contacto') {
      await api.post(`/contacto/${encodeURIComponent(id)}/responder`, { respuesta });
    } else {
      await api.post(`/sugerencias/${encodeURIComponent(id)}/responder`, { respuesta });
    }
    cerrarModal('modalRespuesta');
    toast('Respuesta enviada', 'ok');
    if (tipo === 'contacto') await cargarContacto();
    else await cargarSugerencias();
  } catch (error) {
    toast(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

async function abrirBandeja() {
  if (!sesion.usuario || sesion.esAnonimo()) return;
  const empleado = sesion.esEmpleado();
  loading(true, 'Cargando bandeja…');
  try {
    if (empleado && sesion.esAlgunaAdmin() && !(store.estado.usuarios || []).length) {
      const { usuarios } = await catalogosService.usuarios();
      store.actualizar({ usuarios }, 'usuarios');
    }
    // El ciudadano solo ve sus contactos directos; el personal conserva todas
    // sus pestañas y además puede revisar los contactos ciudadanos.
    const visibles = empleado
      ? ['mensajes', 'contacto', 'directos', 'bloqueados', sesion.esAlgunaAdmin() ? 'sugerencias' : '']
      : ['directos', 'bloqueados'];
    document.querySelectorAll('#modalBandeja .login-tab').forEach((tab) => {
      tab.classList.toggle('u-oculto', !visibles.includes(tab.dataset.valor));
    });
    await cargarBloqueos();
    if (empleado) await cargarHilos();
    abrirModal('modalBandeja');
    await cambiarTab(empleado ? 'mensajes' : 'directos');
  } catch (error) {
    toast(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

/** Abre un contacto directo concreto (enlace profundo de notificaciones). */
export async function abrirContactoDirectoPanel(id) {
  if (!id || !sesion.usuario || sesion.esAnonimo()) return;
  await abrirBandeja();
  await cambiarTab('directos');
  await abrirContactoDirecto(id);
}

/** Actualiza el badge de la barra superior (se llama al arrancar la sesión). */
export async function actualizarBadge() {
  if (!sesion.esEmpleado()) return 0;
  try {
    const { noLeidos } = await api.get('/mensajes/no-leidos');
    const badge = $('bandeja-badge');
    if (badge) {
      badge.textContent = String(noLeidos);
      badge.classList.toggle('u-oculto', noLeidos === 0);
    }
    return noLeidos;
  } catch {
    return 0;
  }
}

async function cambiarTab(nombre) {
  const paneles = {
    mensajes: 'bandejaMensajes',
    contacto: 'bandejaContacto',
    directos: 'bandejaDirectos',
    bloqueados: 'bandejaBloqueados',
    sugerencias: 'bandejaSugerencias'
  };
  const tabs = document.querySelectorAll('#modalBandeja .login-tab');
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.valor === nombre));
  Object.entries(paneles).forEach(([clave, id]) => {
    $(id)?.classList.toggle('u-oculto', clave !== nombre);
  });

  try {
    if (nombre === 'contacto') await cargarContacto();
    if (nombre === 'directos') await cargarDirectos();
    if (nombre === 'bloqueados') {
      await cargarBloqueos();
      pintarBloqueados();
    }
    if (nombre === 'sugerencias') await cargarSugerencias();
    // Al cambiar de pestaña el formulario nuevo ya no está a la vista.
    limpiarPie();
  } catch (error) {
    toast(mensajeDeError(error), 'err');
  }
}

export function registrar() {
  registrarAcciones({
    'contacto:abrir': () => abrirContacto(),
    'contacto:enviar': () => enviarContacto(),
    'contacto:estado': () => {
      llenarMunicipiosContacto($('conEstado')?.value || '');
      limpiarFuncionarios();
    },
    'contacto:municipio': () => cargarFuncionariosContacto(),
    'contacto:solicitarAdmin': () => solicitarAdminContacto(),
    'contacto:crearRecoleccion': () => crearRecoleccionContacto(),
    'contacto:responder': ({ id }) =>
      abrirResponder('contacto', id, 'Responder mensaje de contacto'),

    'sugerencias:abrir': () => abrirSugerencia(),
    'sugerencias:enviar': () => enviarSugerencia(),
    'sugerencias:responder': ({ id }) =>
      abrirResponder('sugerencia', id, 'Responder sugerencia'),
    'respuesta:enviar': () => enviarRespuesta(),

    'bandeja:abrir': () => intentar(() => abrirBandeja()),
    'bandeja:tab': ({ valor }) => intentar(() => cambiarTab(valor)),
    'bandeja:hilo': ({ id }) => intentar(() => abrirHilo(id)),
    'bandeja:contacto': ({ id }) => intentar(() => abrirContactoDirecto(id)),
    'bandeja:directoResponder': ({ id }) => intentar(() => responderContactoDirecto(id)),
    'bandeja:nuevo': () => pintarFormularioNuevo(),
    'bandeja:enviar': () => intentar(() => enviarMensajeNuevo()),
    'bandeja:responder': () => intentar(() => responderHilo()),
    'bandeja:verAdjunto': ({ elemento }) =>
      verAdjunto({
        url: elemento?.dataset.url,
        tipo: elemento?.dataset.tipo || '',
        nombre: elemento?.dataset.nombre || 'Archivo adjunto'
      }),
    'bandeja:reportar': ({ elemento, id }) =>
      intentar(() => abrirReporteConversacion(elemento?.dataset.canal, id)),
    'bandeja:enviarReporte': () => intentar(() => enviarReporteConversacion()),
    'reporteConv:incluirMensajes': () => aplicarIncluirMensajes(),
    'bandeja:bloquear': ({ valor, elemento }) =>
      intentar(() => bloquearCuenta(valor, elemento?.dataset.nombre || '')),
    'bandeja:desbloquear': ({ valor }) => intentar(() => desbloquearCuenta(valor)),
    'bandeja:recargar': () =>
      intentar(async () => {
        limpiarPie();
        if (hiloActivo) await abrirHilo(hiloActivo);
        else pintarConversacion([]);
      })
  });

  $('formConsultaSugerencia')?.addEventListener('submit', consultarSugerencia);
}
