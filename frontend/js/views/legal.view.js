/** Vista del editor legal del administrador. */
import { $, esc, fmtFecha } from '../core/utils.js';

export function renderDocumento({ documento, historial = [] } = {}) {
  if (!documento) return;
  const titulo = $('legalTitulo');
  const editor = $('legalEditor');
  const estado = $('legalEstado');
  const preview = $('legalPreview');
  if (titulo) titulo.value = documento.titulo || '';
  if (editor) editor.value = documento.htmlBorrador || '';
  if (estado) {
    estado.textContent = documento.versionPublicada
      ? `Publicado v${documento.versionPublicada}${documento.publicadoEn ? ` · ${fmtFecha(documento.publicadoEn)}` : ''}`
      : 'Sin publicar';
  }
  if (preview) preview.innerHTML = documento.htmlBorrador || '<p>Sin contenido.</p>';
  renderHistorial(historial);
}

export function renderPreview() {
  const editor = $('legalEditor');
  const preview = $('legalPreview');
  if (preview && editor) preview.innerHTML = editor.value || '<p>Sin contenido.</p>';
}

export function valores() {
  return {
    titulo: $('legalTitulo')?.value?.trim() || '',
    html: $('legalEditor')?.value?.trim() || ''
  };
}

export function insertarFormato(etiqueta) {
  const editor = $('legalEditor');
  if (!editor) return;
  const inicio = editor.selectionStart;
  const fin = editor.selectionEnd;
  const seleccion = editor.value.slice(inicio, fin) || 'Texto';
  const mapa = {
    h2: `<h2>${seleccion}</h2>`,
    h3: `<h3>${seleccion}</h3>`,
    strong: `<strong>${seleccion}</strong>`,
    em: `<em>${seleccion}</em>`,
    ul: `<ul>\n  <li>${seleccion}</li>\n</ul>`,
    ol: `<ol>\n  <li>${seleccion}</li>\n</ol>`,
    a: `<a href="https://">${seleccion}</a>`
  };
  const texto = mapa[etiqueta] || seleccion;
  editor.setRangeText(texto, inicio, fin, 'end');
  editor.focus();
  renderPreview();
}

export function renderHistorial(historial = []) {
  const contenedor = $('legalHistorial');
  if (!contenedor) return;
  if (!historial.length) {
    contenedor.innerHTML = '<p class="campo-nota">Todavía no hay versiones publicadas.</p>';
    return;
  }
  contenedor.innerHTML = `
    <div class="u-scroll-x">
      <table class="data-table">
        <thead><tr><th>Versión</th><th>Título</th><th>Publicada</th><th>Por</th><th></th></tr></thead>
        <tbody>
          ${historial
            .map(
              (v) => `<tr>
                <td>v${v.version}</td>
                <td>${esc(v.titulo)}</td>
                <td>${fmtFecha(v.publicadoEn)}</td>
                <td>${esc(v.publicadoPor || '—')}</td>
                <td><button class="btn btn-outline btn-sm" data-action="legal:restaurar" data-valor="${v.version}">
                  <i class="bi bi-arrow-counterclockwise"></i> Usar como borrador
                </button></td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}
