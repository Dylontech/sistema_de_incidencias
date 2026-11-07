/**
 * Panel de mapas descargados en el dispositivo.
 *
 * Es la vista de gestión del mapa sin conexión: lista lo que ya está guardado,
 * permite descargar otro municipio, volver a descargarlo (actualizarlo), abrir
 * su mapa y borrarlo. Todo ocurre en el navegador; el servidor solo aporta el
 * contorno del municipio cuando hace falta.
 */
import { registrarAcciones } from '../core/eventos.js';
import { $, esc, fmtFecha, formatoBytes } from '../core/utils.js';
import { cerrarModal, preguntar, toast } from '../core/ui.js';
import { intentar, mensajeDeError } from '../core/errores.js';
import { store } from '../core/store.js';
import { catalogosService } from '../services/catalogos.service.js';
import * as aplicacion from '../core/aplicacion.js';
import * as mapaOffline from '../map/mapa-offline.js';

function municipiosDelCatalogo() {
  return (store.estado.municipios || []).slice().sort((a, b) =>
    String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
  );
}

function llenarSelector() {
  const select = $('mapaNuevoMunicipio');
  if (!select) return;
  const valor = select.value;
  select.innerHTML = municipiosDelCatalogo()
    .map((m) => `<option value="${esc(m.id)}">${esc(m.nombre)}${m.estado ? ` — ${esc(m.estado)}` : ''}</option>`)
    .join('');
  if (valor) select.value = valor;
}

async function pintarResumen() {
  const resumen = mapaOffline.resumen();
  const total = resumen.reduce((suma, mapa) => suma + (mapa.bytes || 0), 0);
  const uso = await mapaOffline.cuota();
  const caja = $('mapasResumen');
  if (!caja) return;
  caja.textContent = resumen.length
    ? `${resumen.length} mapa(s) descargado(s) · ${formatoBytes(total)}.${
        uso?.quota
          ? ` El dispositivo usa ${formatoBytes(uso.usage)} de ${formatoBytes(uso.quota)}.`
          : ''
      }`
    : 'Todavía no hay mapas descargados en este dispositivo.';
}

function pintarLista() {
  const caja = $('mapasLista');
  if (!caja) return;
  const resumen = mapaOffline.resumen();
  if (!resumen.length) {
    caja.innerHTML =
      '<p class="campo-nota u-p-12">Elige un municipio y pulsa «Descargar» para guardarlo sin conexión.</p>';
    return;
  }
  caja.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead>
          <tr><th>Municipio</th><th>Capa</th><th>Teselas</th><th>Tamaño</th><th>Zooms</th><th>Actualizado</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          ${resumen
            .map(
              (mapa) => `<tr>
                <td>${esc(mapa.nombre || mapa.id)}</td>
                <td>${esc(mapa.capa || '—')}</td>
                <td>${esc(String(mapa.teselas || 0))}</td>
                <td>${esc(formatoBytes(mapa.bytes || 0))}</td>
                <td>${esc(`${mapa.zoomMin}–${mapa.zoomMax}`)}</td>
                <td class="u-fs-11px">${esc(fmtFecha(mapa.actualizadoEn))}</td>
                <td>
                  <div class="u-fila-env">
                    <button class="btn btn-sm btn-outline" data-action="mapas:abrir" data-id="${esc(mapa.id)}" title="Ir a este municipio">
                      <i class="bi bi-geo-alt"></i> Abrir
                    </button>
                    <button class="btn btn-sm btn-outline" data-action="mapas:actualizar" data-id="${esc(mapa.id)}" title="Volver a descargar">
                      <i class="bi bi-arrow-repeat"></i> Actualizar
                    </button>
                    <button class="btn btn-sm btn-danger" data-action="mapas:borrar" data-id="${esc(mapa.id)}" title="Borrar del dispositivo">
                      <i class="bi bi-trash3"></i> Borrar
                    </button>
                  </div>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function pintarProgreso({ estado, descargadas = 0, total = 0, bytes = 0 } = {}) {
  const barra = $('mapasProgreso');
  const texto = $('mapasEstado');
  const cancelar = $('mapasCancelar');
  const descargando = estado === 'descargando';
  const pct = total ? Math.round((descargadas / total) * 100) : 0;
  if (barra) {
    barra.classList.toggle('u-oculto', !descargando);
    barra.value = pct;
  }
  if (cancelar) cancelar.classList.toggle('u-oculto', !descargando);
  if (texto && descargando) {
    texto.textContent = `Descargando ${descargadas}/${total} (${pct} %) · ${formatoBytes(bytes)}`;
  }
}

export async function cargar() {
  llenarSelector();
  pintarLista();
  await pintarResumen();
}

async function municipioCompleto(id) {
  const { municipio } = await catalogosService.municipio(id);
  if (!municipio) throw new Error('No se encontró el municipio');
  return municipio;
}

async function descargar(id) {
  const municipio = await municipioCompleto(id);
  const ya = mapaOffline.mapaDescargado(municipio.id);
  if (
    !(await preguntar(
      ya
        ? `Ya tienes el mapa de ${municipio.nombre}. ¿Volver a descargarlo?`
        : `¿Descargar el mapa de ${municipio.nombre} para verlo sin conexión? Se guardará en este dispositivo (máximo 20 MB).`
    ))
  ) {
    return;
  }
  toast(`Descargando el mapa de ${municipio.nombre}. Puedes seguir usando la app.`, 'info');
  try {
    const resultado = await mapaOffline.descargarMunicipio(municipio, {
      alProgreso: pintarProgreso
    });
    if (resultado) {
      toast(
        `Mapa de ${municipio.nombre} listo: ${resultado.teselas} teselas (${formatoBytes(resultado.bytes)})`,
        'ok'
      );
    }
  } finally {
    const texto = $('mapasEstado');
    if (texto) texto.textContent = '';
    $('mapasCancelar')?.classList.add('u-oculto');
    await cargar();
  }
}

export function registrar() {
  registrarAcciones({
    'mapas:recargar': () => intentar(() => cargar()),

    'mapas:descargar': () =>
      intentar(async () => {
        const id = $('mapaNuevoMunicipio')?.value;
        if (!id) return toast('Elige un municipio', 'err');
        await descargar(id);
      }),

    'mapas:actualizar': ({ id }) => intentar(() => descargar(id)),

    'mapas:abrir': ({ id }) =>
      intentar(async () => {
        if (!id) return;
        await aplicacion.cambiarMunicipio(id);
        cerrarModal('modalAdmin');
        toast('Municipio activo actualizado', 'ok');
      }),

    'mapas:borrar': ({ id }) =>
      intentar(async () => {
        if (!id) return;
        const mapa = mapaOffline.mapaDescargado(id);
        if (
          !(await preguntar(
            `¿Borrar el mapa de ${mapa?.nombre || 'este municipio'} de este dispositivo? Podrás descargarlo otra vez.`
          ))
        ) {
          return;
        }
        await mapaOffline.borrarMunicipio(id);
        await cargar();
        toast('Mapa borrado del dispositivo', 'info');
      }),

    'mapas:borrarTodo': () =>
      intentar(async () => {
        if (!mapaOffline.resumen().length) return toast('No hay mapas descargados', 'info');
        if (!(await preguntar('¿Borrar todos los mapas descargados de este dispositivo?'))) return;
        await mapaOffline.borrarTodo();
        await cargar();
        toast('Mapas borrados del dispositivo', 'info');
      }),

    'mapas:cancelar': () => {
      mapaOffline.cancelar();
      toast('Descarga cancelada', 'info');
    }
  });
}

export { pintarProgreso };
