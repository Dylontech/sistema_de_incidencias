/** Controlador de solicitudes públicas de informe. */
import { registrarAcciones } from '../core/eventos.js';
import { api, BASE, token } from '../core/api.js';
import { intentar } from '../core/errores.js';
import { abrirModal, cerrarModal, preguntar, toast } from '../core/ui.js';
import * as vista from '../views/solicitudesInforme.view.js';

let solicitudes = [];
let visor = { url: null, blob: null, nombre: '', tipo: '' };

export async function cargar() {
  const estado = document.getElementById('solicitudesInformeEstado')?.value || '';
  const { solicitudes: lista } = await api.get(
    `/admin/solicitudes-informe?limite=500${estado ? `&estado=${encodeURIComponent(estado)}` : ''}`
  );
  solicitudes = lista || [];
  pintar();
}

function pintar() {
  vista.renderizar(solicitudes, {
    texto: document.getElementById('solicitudesInformeTexto')?.value || '',
    estado: document.getElementById('solicitudesInformeEstado')?.value || ''
  });
}

/**
 * Abre el resumen completo de una solicitud. Es el destino de la notificación
 * `solicitud_informe_*` y de la acción «Detalle» de la tabla.
 */
export async function abrirDetalle(id) {
  if (!id) return;
  try {
    const { solicitud } = await api.get(`/admin/solicitudes-informe/${id}`);
    vista.renderizarDetalle(solicitud);
    abrirModal('modalSolicitudInformeDetalle', { nested: true });
  } catch (error) {
    toast(error?.message || 'No se pudo abrir la solicitud', 'err');
  }
}

function limpiarVisor() {
  if (visor.url) URL.revokeObjectURL(visor.url);
  visor = { url: null, blob: null, nombre: '', tipo: '' };
  const marco = document.getElementById('visorInformeFrame');
  const texto = document.getElementById('visorInformeTexto');
  const pdf = document.getElementById('visorInformePdf');
  if (marco) {
    marco.removeAttribute('src');
    marco.hidden = true;
  }
  if (texto) {
    texto.textContent = '';
    texto.hidden = true;
  }
  if (pdf) pdf.hidden = true;
}

/** Electron/VS Code no siempre trae el visor PDF de Chromium: se ofrece abrirlo fuera. */
function sinVisorPdfIntegrado() {
  return /Electron|Code\//i.test(navigator.userAgent);
}

function nombreDeRespuesta(respuesta, id, tipo) {
  const disposicion = respuesta.headers.get('content-disposition') || '';
  const coincidencia = /filename="?([^";]+)"?/i.exec(disposicion);
  if (coincidencia) return coincidencia[1];
  return `informe-${id}.${tipo.includes('csv') ? 'csv' : 'pdf'}`;
}

async function pedirArchivo(id, { formato = null, descargar = false } = {}) {
  const ruta = formato
    ? `${BASE}/admin/solicitudes-informe/${id}/vista-previa?formato=${encodeURIComponent(formato)}`
    : `${BASE}/admin/solicitudes-informe/${id}/archivo`;
  const respuesta = await fetch(ruta, {
    headers: { Authorization: `Bearer ${token.leer()}` }
  });
  if (!respuesta.ok) {
    throw new Error(formato ? 'No se pudo generar la vista previa' : 'No se pudo abrir el archivo');
  }
  const tipo = respuesta.headers.get('content-type') || '';
  const folio = respuesta.headers.get('x-solicitud-folio') || '';
  const blob = await respuesta.blob();
  const nombre = nombreDeRespuesta(respuesta, id, tipo);

  if (descargar) {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  limpiarVisor();
  visor = { url: null, blob, nombre, tipo };

  const marco = document.getElementById('visorInformeFrame');
  const texto = document.getElementById('visorInformeTexto');
  const titulo = document.getElementById('visorInformeTitulo');
  const meta = document.getElementById('visorInformeMeta');
  if (titulo) titulo.textContent = tipo.includes('csv') ? 'Vista previa CSV' : 'Vista previa PDF';
  if (meta) {
    meta.textContent = `${folio ? `Folio ${folio} · ` : ''}${nombre}${formato ? ' · vista previa sin guardar' : ' · archivo generado'}`;
  }

  if (tipo.includes('csv')) {
    if (texto) {
      texto.textContent = await blob.text();
      texto.hidden = false;
    }
  } else {
    visor.url = URL.createObjectURL(blob);
    if (sinVisorPdfIntegrado()) {
      const pdf = document.getElementById('visorInformePdf');
      if (pdf) pdf.hidden = false;
    } else if (marco) {
      marco.src = visor.url;
      marco.hidden = false;
    }
  }
  abrirModal('modalVisorInforme', { nested: true });
}

function cerrarVisor() {
  limpiarVisor();
  cerrarModal('modalVisorInforme');
}

function descargarVisor() {
  if (!visor.blob) return;
  const url = URL.createObjectURL(visor.blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = visor.nombre || 'informe.pdf';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function registrar() {
  registrarAcciones({
    'solicitudesInforme:recargar': () => intentar(() => cargar()),
    'solicitudesInforme:buscar': () => intentar(() => cargar()),
    'solicitudesInforme:detalle': ({ id }) => abrirDetalle(id),
    'solicitudesInforme:vista': ({ id, valor }) =>
      intentar(() => pedirArchivo(id, { formato: valor })),
    'solicitudesInforme:archivo': ({ id }) => intentar(() => pedirArchivo(id)),
    'solicitudesInforme:descargar': ({ id }) =>
      intentar(() => pedirArchivo(id, { descargar: true })),
    'solicitudesInforme:descargarVisor': () => descargarVisor(),
    'solicitudesInforme:abrirPdf': () => {
      if (visor.url) window.open(visor.url, '_blank', 'noopener');
    },
    'solicitudesInforme:cerrarVisor': () => cerrarVisor(),
    'solicitudesInforme:generar': ({ id }) =>
      intentar(async () => {
        await api.post(`/admin/solicitudes-informe/${id}/generar`, {});
        await cargar();
        toast('Informe generado y guardado', 'ok');
        await pedirArchivo(id);
      }),
    'solicitudesInforme:enviar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Enviar este informe al correo del solicitante?'))) return;
        await api.post(`/admin/solicitudes-informe/${id}/enviar`, {});
        await cargar();
        toast('Informe enviado', 'ok');
      }),
    'solicitudesInforme:reintentar': ({ id }) =>
      intentar(async () => {
        await api.post(`/admin/solicitudes-informe/${id}/reintentar`, {});
        await cargar();
        toast('Solicitud reintentada', 'ok');
      }),
    'solicitudesInforme:rechazar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Rechazar esta solicitud de informe?'))) return;
        await api.post(`/admin/solicitudes-informe/${id}/rechazar`, { motivo: 'Rechazada desde el panel' });
        await cargar();
        toast('Solicitud rechazada', 'ok');
      })
  });
}

// La vista previa y el archivo generado comparten modal; al cerrar se libera
// el blob para no dejar memoria retenida.
