/**
 * Modal de solicitud de informes.
 *
 * Sustituye la página /informes. La solicitud sigue enviándose al endpoint
 * público, pero exige una cuenta registrada; el modal muestra el aviso de
 * acceso antes de permitir llenar el formulario.
 */
import { registrarAcciones } from '../core/eventos.js';
import { $, esc } from '../core/utils.js';
import { api } from '../core/api.js';
import { sesion } from '../core/session.js';
import { store } from '../core/store.js';
import { consentimiento } from '../core/consentimiento.js';
import { abrirModal, cerrarModal, loading, toast } from '../core/ui.js';
import { intentar, mensajeDeError } from '../core/errores.js';
import { configuracionService } from '../services/configuracion.service.js';
import { crearSelectorTerritorialPorEstado } from '../core/selector-territorial-bloques.js';

let selectorTerritorio = null;

function tieneCuenta() {
  return Boolean(sesion.usuario && sesion.usuario.rol !== 'anonimo');
}

/** Consulta pública sin adjuntar el token (también funciona con token caducado). */
async function pedirPublico(ruta) {
  const respuesta = await fetch(`/api${ruta}`, { headers: { Accept: 'application/json' } });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error || `Error ${respuesta.status}`);
  return datos;
}

function mostrarEstado(id, texto, tipo = 'info') {
  const caja = $(id);
  if (!caja) return;
  caja.className = `publico-msg ${tipo}`;
  caja.textContent = texto;
  caja.classList.remove('u-oculto');
}

function prepararTerritorio() {
  if (!selectorTerritorio) {
    selectorTerritorio = crearSelectorTerritorialPorEstado({
      contenedor: 'solInformeTerritorio',
      municipios: store.estado.municipios || [],
      catalogoEstados: store.estado.estados || []
    });
  } else {
    selectorTerritorio.limpiar();
  }
}

function llenarTipos() {
  const select = $('solInformeTipos');
  if (!select) return;
  select.innerHTML = (store.estado.tipos || [])
    .map((tipo) => `<option value="${esc(tipo.id)}">${esc(tipo.icono || '')} ${esc(tipo.nombre)}</option>`)
    .join('');
}

async function prepararFechas() {
  try {
    const { configuracion } = await configuracionService.publica();
    const limites = configuracion?.informes || {};
    const hoy = new Date().toISOString().slice(0, 10);
    for (const id of ['solInformeDesde', 'solInformeHasta']) {
      const campo = $(id);
      if (!campo) continue;
      campo.max = hoy;
      if (id === 'solInformeDesde' && limites.fechaMinima) campo.min = limites.fechaMinima;
    }
    const nota = $('solInformeRangoNota');
    if (nota) {
      nota.textContent = `No se permiten fechas futuras. Rango máximo: ${
        limites.maxMeses || 24
      } meses.`;
    }
  } catch {
    // El formulario funciona con las fechas nativas si la configuración falla.
  }
}

function prepararFormulario() {
  prepararTerritorio();
  llenarTipos();
  if ($('solInformeNombre') && sesion.usuario?.nombre) $('solInformeNombre').value = sesion.usuario.nombre;
  if ($('solInformeCorreo') && sesion.usuario?.correo) $('solInformeCorreo').value = sesion.usuario.correo;
  const aviso = $('solInformeAvisoEstado');
  if (aviso) {
    const fecha = consentimiento.fecha();
    aviso.textContent = fecha
      ? `Has aceptado los términos y el aviso de privacidad (${new Date(fecha).toLocaleDateString('es-MX')}).`
      : 'Has aceptado los términos y el aviso de privacidad.';
  }
  prepararFechas().catch(() => {});
}

function aplicarAcceso() {
  const bloqueo = $('solicitudInformeBloqueo');
  const formulario = $('formSolicitudInforme');
  const enviar = $('btnSolicitudInformeEnviar');
  const permitido = tieneCuenta();
  if (bloqueo) {
    bloqueo.hidden = permitido;
    bloqueo.classList.toggle('u-oculto', permitido);
  }
  if (formulario) {
    formulario.hidden = !permitido;
    formulario.classList.toggle('u-oculto', !permitido);
  }
  if (enviar) enviar.hidden = !permitido;
  return permitido;
}

function datosSolicitud() {
  const municipios = selectorTerritorio?.municipios() || [];
  const estados = selectorTerritorio?.estados() || [];
  const tiposTodos = $('solInformeTodosTipos')?.checked === true;
  const ambito = $('solInformeAmbito')?.value || 'todos';
  return {
    nombre: $('solInformeNombre')?.value.trim() || '',
    correo: $('solInformeCorreo')?.value.trim() || '',
    telefono: '',
    municipios,
    estados,
    desde: $('solInformeDesde')?.value || null,
    hasta: $('solInformeHasta')?.value || null,
    ambito,
    ambitos: ambito !== 'todos' ? [ambito] : [],
    tiposTodos,
    tipos: tiposTodos
      ? []
      : [...($('solInformeTipos')?.selectedOptions || [])].map((o) => o.value).filter(Boolean),
    formato: $('solInformeFormato')?.value || 'pdf',
    mensaje: $('solInformeMensaje')?.value.trim() || '',
    // La aceptación se verifica en el servidor con el registro versionado;
    // el formulario no vuelve a pedir una casilla duplicada.
    aceptaTerminos: true
  };
}

async function enviar() {
  if (!tieneCuenta()) {
    aplicarAcceso();
    mostrarEstado('solInformeMensajeEstado', 'Inicia sesión o crea una cuenta para solicitar el informe.', 'err');
    return;
  }
  const datos = datosSolicitud();
  if (!datos.nombre || !datos.correo) {
    return mostrarEstado('solInformeMensajeEstado', 'Escribe tu nombre y tu correo.', 'err');
  }
  if (!datos.estados.length && !datos.municipios.length) {
    return mostrarEstado(
      'solInformeMensajeEstado',
      'Elige al menos un estado o un municipio para el informe.',
      'err'
    );
  }
  if (!datos.tiposTodos && !datos.tipos.length) {
    return mostrarEstado('solInformeMensajeEstado', 'Elige al menos un tipo de incidencia o marca «Todos».', 'err');
  }
  loading(true, 'Registrando solicitud…');
  try {
    const respuesta = await api.post('/publico/solicitudes-informe', datos);
    mostrarEstado(
      'solInformeMensajeEstado',
      `Solicitud ${respuesta.folio} registrada. Revisa ${respuesta.correo} y confirma el enlace para recibir el informe.`,
      'ok'
    );
    toast('Solicitud de informe registrada', 'ok');
  } catch (error) {
    mostrarEstado('solInformeMensajeEstado', mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

async function consultar() {
  const folio = $('solInformeFolioConsulta')?.value.trim() || '';
  const correo = $('solInformeCorreoConsulta')?.value.trim() || '';
  if (!folio || !correo) {
    return mostrarEstado('solInformeConsultaEstado', 'Escribe el folio y el correo de la solicitud.', 'err');
  }
  loading(true, 'Consultando…');
  try {
    const datos = await pedirPublico(
      `/publico/solicitudes-informe/${encodeURIComponent(folio)}?correo=${encodeURIComponent(correo)}`
    );
    const estados = {
      pendiente_verificacion: 'Falta confirmar el correo',
      pendiente: 'Confirmada, en cola para generarse',
      procesando: 'Generando el informe',
      generada: 'Generada, lista para enviarse',
      enviada: 'Enviada al correo',
      error: 'Error al generar el informe',
      rechazada: 'Rechazada'
    };
    mostrarEstado(
      'solInformeConsultaEstado',
      `Folio ${datos.folio}: ${estados[datos.estado] || datos.estado}.`,
      datos.estado === 'enviada' ? 'ok' : 'info'
    );
  } catch (error) {
    mostrarEstado('solInformeConsultaEstado', mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

async function verificar(token) {
  if (!token) return;
  try {
    const datos = await pedirPublico(`/publico/solicitudes-informe/verificar/${encodeURIComponent(token)}`);
    mostrarEstado(
      'solicitudInformeVerificacion',
      datos.yaVerificada
        ? `La solicitud ${datos.folio} ya estaba confirmada.`
        : `Solicitud ${datos.folio} confirmada. Te enviaremos el informe al correo registrado.`,
      'ok'
    );
  } catch (error) {
    mostrarEstado('solicitudInformeVerificacion', mensajeDeError(error), 'err');
  }
}

export async function abrir({ verificar: token = null, folio = null } = {}) {
  const permitido = aplicarAcceso();
  if (permitido) prepararFormulario();
  abrirModal('modalSolicitudInforme');
  if (folio && $('solInformeFolioConsulta')) {
    $('solInformeFolioConsulta').value = folio;
    const detalle = $('consultaInformeDetalle');
    if (detalle) detalle.open = true;
  }
  if (token) {
    loading(true, 'Confirmando solicitud…');
    try {
      await verificar(token);
    } finally {
      loading(false);
    }
  }
}

export function registrar() {
  registrarAcciones({
    'solicitudInforme:abrir': () => abrir(),
    'solicitudInforme:cerrar': () => cerrarModal('modalSolicitudInforme'),
    'solicitudInforme:todosTipos': ({ elemento }) => {
      const select = $('solInformeTipos');
      if (!select) return;
      select.disabled = elemento?.checked === true;
      if (select.disabled) [...select.options].forEach((opcion) => (opcion.selected = false));
    },
    'solicitudInforme:enviar': () => intentar(enviar),
    'solicitudInforme:consultar': () => intentar(consultar)
  });
}
