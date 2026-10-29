/**
 * Controlador de términos y condiciones (frontend).
 * Ajusta los imports según la estructura real de tu carpeta js/.
 */

async function apiGet(url) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function apiPut(url, body) {
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function aviso(msg, tipo) {
  if (typeof window.toast === 'function') return window.toast(msg, tipo);
  console.log('[' + (tipo || 'info') + '] ' + msg);
}

const ESTADO = { publicado: '', borrador: '' };

export async function cargarTerminos() {
  try {
    const { html } = await apiGet('/api/terminos');
    ESTADO.publicado = html || '';
    ESTADO.borrador  = ESTADO.publicado;
    const cont = document.querySelector('#obTerminos .terminos');
    if (cont && html) cont.innerHTML = html;
    return html;
  } catch (err) {
    console.error('[terminos] cargar:', err);
    return null;
  }
}

export async function abrirEditorTerminos() {
  await cargarTerminos();
  ESTADO.borrador = ESTADO.publicado;
  const preview = document.getElementById('terminosPreview');
  const editor  = document.getElementById('terminosEditor');
  const estado  = document.getElementById('terminosEstado');
  if (preview) preview.innerHTML = ESTADO.publicado;
  if (editor)  editor.value       = ESTADO.publicado;
  if (estado)  estado.textContent = 'Publicado: ' + new Date().toLocaleString('es-MX');
  const modal = document.getElementById('modalTerminos');
  if (modal) modal.classList.add('active');
}

export function cambiarVistaTerminos(vista) {
  const preview = document.getElementById('terminosPreview');
  const editor  = document.getElementById('terminosEditor');
  document.querySelectorAll('[data-action="terminos:vista"]').forEach(b =>
    b.classList.toggle('active', b.dataset.valor === vista)
  );
  if (vista === 'editor') {
    preview?.classList.add('u-oculto');
    editor?.classList.remove('u-oculto');
    if (editor) editor.value = ESTADO.borrador;
  } else {
    editor?.classList.add('u-oculto');
    preview?.classList.remove('u-oculto');
    if (editor && preview) {
      ESTADO.borrador = editor.value;
      preview.innerHTML = editor.value;
    }
  }
}

export async function publicarTerminos() {
  const editor = document.getElementById('terminosEditor');
  if (editor) ESTADO.borrador = editor.value;
  if (!ESTADO.borrador.trim()) { aviso('El contenido no puede estar vacío.', 'error'); return; }
  try {
    await apiPut('/api/terminos', { html: ESTADO.borrador });
    ESTADO.publicado = ESTADO.borrador;
    const cont = document.querySelector('#obTerminos .terminos');
    if (cont) cont.innerHTML = ESTADO.borrador;
    aviso('Términos publicados correctamente.', 'ok');
    document.getElementById('modalTerminos')?.classList.remove('active');
  } catch (err) {
    console.error('[terminos] publicar:', err);
    aviso('No se pudieron publicar los términos.', 'error');
  }
}

export function restaurarTerminos() {
  ESTADO.borrador = ESTADO.publicado;
  const editor  = document.getElementById('terminosEditor');
  const preview = document.getElementById('terminosPreview');
  if (editor)  editor.value = ESTADO.publicado;
  if (preview) preview.innerHTML = ESTADO.publicado;
  aviso('Se restauró la versión publicada.', 'info');
}
