/**
 * Reclamaciones de incidencias resueltas.
 *
 * La ciudadanía reclama desde el detalle de la incidencia; el personal con
 * `gestionar_reclamaciones` las revisa en el panel, puede delegar la decisión
 * (solo la administración) y descargar el informe preliminar en PDF.
 */
import { registrarAcciones } from '../core/eventos.js';
import { $, esc, descargar, fmtFecha } from '../core/utils.js';
import { abrirModal, cerrarModal, toast } from '../core/ui.js';
import { intentar, mensajeDeError } from '../core/errores.js';
import { sesion } from '../core/session.js';
import { esAlgunaAdmin } from '../core/roles.js';
import { incidenciasService } from '../services/incidencias.service.js';
import { reclamacionesService } from '../services/reclamaciones.service.js';
import { elegirVersionPdf } from './versionPdf.controller.js';
import * as adminView from '../views/admin.view.js';

/** Reclamación abierta en el modal de decisión. */
let reclamacionActiva = null;

const ETIQUETAS_MOTIVO = {
  no_resuelta: 'La incidencia no quedó resuelta',
  solucion_incompleta: 'La solución fue incompleta',
  danos_no_reparados: 'Los daños siguen sin repararse',
  otro: 'Otro motivo'
};

const ETIQUETAS_ESTADO = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  resuelta: 'Aceptada',
  rechazada: 'Rechazada'
};

export async function cargar() {
  if (!sesion.puede('gestionar_reclamaciones')) return [];
  const estado = $('reclamacionesEstado')?.value ?? 'pendiente';
  const { reclamaciones } = await reclamacionesService.listar({ estado });
  adminView.renderReclamaciones(reclamaciones || [], {
    puedeGestionar: sesion.puede('gestionar_reclamaciones')
  });
  return reclamaciones || [];
}

/** Abre el formulario de reclamación desde el detalle de la incidencia. */
async function abrirReclamacion(incidenciaId) {
  if (!incidenciaId) return;
  if (sesion.esAnonimo() || !sesion.usuario) {
    return toast('Crea una cuenta para reclamar', 'err');
  }
  const { incidencia } = await incidenciasService.obtener(incidenciaId);
  if ($('reclamacionIncidencia')) $('reclamacionIncidencia').value = incidencia.id;
  if ($('reclamacionResumen')) {
    $('reclamacionResumen').textContent = `${incidencia.titulo} · Resuelta el ${fmtFecha(
      incidencia.fechaResolucion
    )}. Solución: ${incidencia.solucion || 'sin descripción'}`;
  }
  if ($('reclamacionDetalle')) $('reclamacionDetalle').value = '';
  if ($('reclamacionMotivo')) $('reclamacionMotivo').value = 'no_resuelta';
  abrirModal('modalReclamacion', { nested: true });
}

async function enviarReclamacion() {
  const incidenciaId = $('reclamacionIncidencia')?.value;
  const motivo = $('reclamacionMotivo')?.value || '';
  const detalle = ($('reclamacionDetalle')?.value || '').trim();
  if (!incidenciaId) return;
  if (detalle.length < 10) {
    return toast('Explica en al menos 10 caracteres qué falta', 'err');
  }
  await reclamacionesService.crear(incidenciaId, { motivo, detalle });
  cerrarModal('modalReclamacion');
  toast('Reclamación enviada; el municipio y la administración la revisarán', 'ok');
}

/** Muestra la reclamación y, si corresponde, los controles de decisión. */
async function verReclamacion(id) {
  const { reclamacion } = await reclamacionesService.obtener(id);
  reclamacionActiva = reclamacion;
  if ($('reclamacionResolverId')) $('reclamacionResolverId').value = reclamacion.id;
  const detalle = $('reclamacionResolverDetalle');
  if (detalle) {
    detalle.innerHTML = `
      <p><strong>${esc(reclamacion.incidenciaTitulo)}</strong></p>
      <p class="campo-nota">
        ${esc(reclamacion.nombre)} · ${esc(fmtFecha(reclamacion.creadoEn))} ·
        ${esc(ETIQUETAS_ESTADO[reclamacion.estado] || reclamacion.estado)}
      </p>
      <p><strong>Motivo:</strong> ${esc(ETIQUETAS_MOTIVO[reclamacion.motivo] || reclamacion.motivo)}</p>
      <p>${esc(reclamacion.detalle)}</p>
      ${
        reclamacion.respuesta
          ? `<p class="campo-nota"><strong>Respuesta:</strong> ${esc(reclamacion.respuesta)}</p>`
          : ''
      }
      ${
        reclamacion.delegadoA
          ? `<p class="campo-nota"><strong>Delegada a:</strong> ${esc(reclamacion.delegadoA)}</p>`
          : ''
      }`;
  }
  const gestionar = sesion.puede('gestionar_reclamaciones');
  const abierta = ['pendiente', 'en_revision'].includes(reclamacion.estado);
  $('reclamacionResolverAcciones')?.classList.toggle('u-oculto', !(gestionar && abierta));
  $('reclamacionDelegarBox')?.classList.toggle('u-oculto', !esAlgunaAdmin(sesion.usuario));
  if ($('reclamacionDecision')) $('reclamacionDecision').value = 'mantener';
  if ($('reclamacionRespuesta')) $('reclamacionRespuesta').value = '';
  if ($('reclamacionDelegado')) $('reclamacionDelegado').value = '';
  abrirModal('modalReclamacionResolver', { nested: true });
}

async function confirmarDecision() {
  const id = $('reclamacionResolverId')?.value;
  const decision = $('reclamacionDecision')?.value || 'mantener';
  const respuesta = ($('reclamacionRespuesta')?.value || '').trim();
  if (!id) return;
  if (respuesta.length < 5) return toast('Escribe una respuesta para las partes', 'err');
  await reclamacionesService.resolver(id, { decision, respuesta });
  cerrarModal('modalReclamacionResolver');
  await cargar();
  toast('Decisión guardada y avisada a las partes', 'ok');
}

async function delegar() {
  const id = $('reclamacionResolverId')?.value;
  const delegadoA = ($('reclamacionDelegado')?.value || '').trim();
  if (!id || !delegadoA) return toast('Escribe el usuario del funcionario', 'err');
  await reclamacionesService.delegar(id, delegadoA);
  await cargar();
  toast('Reclamación delegada', 'ok');
}

async function descargarInforme(id) {
  if (!id) return;
  const motor = await elegirVersionPdf();
  if (!motor) return;
  const blob = await reclamacionesService.informe(id, motor);
  descargar(blob, `informe-reclamacion-${id.slice(0, 8)}.pdf`, 'application/pdf');
  toast('Informe preliminar descargado', 'ok');
}

/** Abre una reclamación concreta (enlaces de avisos). */
export async function verReclamacionPorId(id) {
  if (!id) return;
  await intentar(() => verReclamacion(id));
}

export function registrar() {
  registrarAcciones({
    'reclamacion:abrir': ({ id }) => intentar(() => abrirReclamacion(id)),
    'reclamacion:enviar': () => intentar(() => enviarReclamacion()),
    'reclamacion:ver': ({ id }) => intentar(() => verReclamacion(id)),
    'reclamacion:confirmar': () => intentar(() => confirmarDecision()),
    'reclamacion:delegar': () => intentar(() => delegar()),
    'reclamacion:informe': ({ id }) =>
      intentar(() => descargarInforme(id || $('reclamacionResolverId')?.value)),
    'reclamaciones:recargar': () => intentar(() => cargar()),
    'reclamaciones:filtrar': () => intentar(() => cargar())
  });
}
