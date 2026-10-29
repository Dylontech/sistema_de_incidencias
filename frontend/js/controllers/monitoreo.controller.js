/**
 * Monitoreo en vivo de incidencias para el personal.
 *
 * Reutiliza el listado ya cargado (con el alcance territorial del usuario) y
 * lo repinta cada 30 s mientras el modal está abierto. Los auditores y enlaces
 * lo ven en solo lectura; los botones de estado solo aparecen si la cuenta
 * puede escribir.
 */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, modalAbierto, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { $, esc, textoDias, etiquetaEstado } from '../core/utils.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { incidenciasService } from '../services/incidencias.service.js';
import * as aplicacion from '../core/aplicacion.js';

const INTERVALO_MS = 30000;
const ETIQUETAS_AMBITO = {
  urbano: 'Urbana',
  carretera_estatal: 'Carretera estatal',
  carretera_federal: 'Carretera federal',
  autopista: 'Autopista',
  camino_rural: 'Camino rural',
  otro: 'Otra vía'
};

let temporizador = null;

function filtros() {
  return {
    estado: $('monFiltroEstado')?.value || 'todos',
    ambito: $('monFiltroAmbito')?.value || 'todos',
    antiguedad: $('monFiltroAntiguedad')?.value || 'todos'
  };
}

function visibles() {
  const { estado, ambito, antiguedad } = filtros();
  return (store.estado.incidencias || [])
    .filter((inc) => estado === 'todos' || inc.estado === estado)
    .filter((inc) => ambito === 'todos' || (inc.ambito || 'urbano') === ambito)
    .filter((inc) => {
      if (antiguedad === 'todos') return true;
      const dias = Number(inc.dias) || 0;
      return dias > Number(antiguedad) && inc.estado !== 'resuelta';
    })
    .sort((a, b) => (Number(b.dias) || 0) - (Number(a.dias) || 0));
}

function kpi(etiqueta, valor, clase = '') {
  return `<div class="monitoreo-kpi ${clase}">
      <div class="monitoreo-kpi-valor">${valor}</div>
      <div class="monitoreo-kpi-etiqueta">${esc(etiqueta)}</div>
    </div>`;
}

function pintar() {
  const lista = visibles();
  const total = lista.length;
  const resueltas = lista.filter((i) => i.estado === 'resuelta').length;
  const enProceso = lista.filter((i) => i.estado === 'en_proceso').length;
  const reportadas = lista.filter((i) => i.estado === 'reportada').length;
  const criticas = lista.filter((i) => i.estado !== 'resuelta' && Number(i.dias) > 30).length;
  const viales = lista.filter((i) => (i.ambito || 'urbano') !== 'urbano').length;

  const kpis = $('monitoreoKpis');
  if (kpis) {
    kpis.innerHTML = [
      kpi('Total', total),
      kpi('Reportadas', reportadas, 'kpi-amarillo'),
      kpi('En proceso', enProceso, 'kpi-naranja'),
      kpi('Resueltas', resueltas, 'kpi-verde'),
      kpi('Críticas (+30 días)', criticas, 'kpi-rojo'),
      kpi('Viales', viales, 'kpi-azul')
    ].join('');
  }

  const cuerpo = $('monitoreoTabla');
  if (!cuerpo) return;

  if (!lista.length) {
    cuerpo.innerHTML =
      '<tr><td colspan="6" class="celda-vacia u-p-20">No hay incidencias con esos filtros.</td></tr>';
    return;
  }

  const municipios = store.estado.municipios || [];
  const puedeEscribir = sesion.puedeEscribir();

  cuerpo.innerHTML = lista
    .slice(0, 300)
    .map((inc) => {
      const municipio = municipios.find((m) => m.id === inc.municipioId);
      const tipo = (store.estado.tipos || []).find((t) => t.id === inc.tipoId);
      const ambito = inc.ambito && inc.ambito !== 'urbano'
        ? `<div class="campo-nota">${esc(ETIQUETAS_AMBITO[inc.ambito] || inc.ambito)}${
            inc.viaNombre ? ' · ' + esc(inc.viaNombre) : ''
          }</div>`
        : '';
      return `<tr>
        <td>
          <strong>${esc(inc.titulo)}</strong>
          ${ambito}
        </td>
        <td>${esc(tipo ? tipo.nombre : '—')}</td>
        <td>${esc(municipio ? `${municipio.nombre}, ${municipio.estado}` : inc.municipioId || '—')}</td>
        <td><span class="inc-badge badge-${inc.color || 'amarillo'}">${etiquetaEstado(inc.estado)}</span></td>
        <td>${esc(textoDias(inc.dias))}</td>
        <td class="u-nowrap">
          <button class="btn btn-sm btn-outline" data-action="detalle:abrir" data-id="${esc(inc.id)}" title="Ver detalle">
            <i class="bi bi-eye"></i>
          </button>
          ${
            puedeEscribir && inc.estado === 'reportada'
              ? `<button class="btn btn-sm btn-outline" data-action="monitoreo:estado" data-id="${esc(inc.id)}" data-valor="en_proceso" title="Marcar en proceso">
                   <i class="bi bi-play-fill"></i>
                 </button>`
              : ''
          }
        </td>
      </tr>`;
    })
    .join('');

  const nota = $('monitoreoNota');
  if (nota) {
    nota.textContent = `${lista.length} incidencias · actualizado ${new Date().toLocaleTimeString('es-MX')} · refresco cada 30 s`;
  }
}

async function refrescar() {
  await aplicacion.recargarIncidencias();
  pintar();
}

function iniciarTemporizador() {
  detenerTemporizador();
  temporizador = window.setInterval(async () => {
    // Si el modal se cerró (por la X, Escape o el botón), el ciclo termina.
    if (!modalAbierto('modalMonitoreo')) {
      detenerTemporizador();
      return;
    }
    if (document.hidden) return;
    try {
      await refrescar();
    } catch {
      /* el refresco silencioso no interrumpe al usuario */
    }
  }, INTERVALO_MS);
}

function detenerTemporizador() {
  if (temporizador) window.clearInterval(temporizador);
  temporizador = null;
}

export function registrar() {
  registrarAcciones({
    'monitoreo:abrir': () =>
      intentar(async () => {
        if (!sesion.esEmpleado()) {
          toast('El monitoreo es solo para el personal', 'err');
          return;
        }
        pintar();
        abrirModal('modalMonitoreo');
        iniciarTemporizador();
        // Un primer refresco en segundo plano por si el listado está viejo.
        refrescar().catch(() => {});
      }),

    'monitoreo:filtros': () => pintar(),

    'monitoreo:refrescar': () =>
      intentar(async () => {
        await refrescar();
        toast('Monitoreo actualizado', 'ok');
      }),

    'monitoreo:estado': ({ id, valor }) =>
      intentar(async () => {
        if (!sesion.puedeEscribir()) {
          toast('Tu cuenta es de solo lectura', 'err');
          return;
        }
        await incidenciasService.cambiarEstado(id, valor);
        await refrescar();
        toast('Estado actualizado', 'ok');
      })
  });
}
