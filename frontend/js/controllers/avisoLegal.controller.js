/** Visor público de términos y aviso de privacidad en modal. */
import { registrarAcciones } from '../core/eventos.js';
import { intentar } from '../core/errores.js';
import { $ } from '../core/utils.js';
import { abrirModal, cerrarModal } from '../core/ui.js';
import { legalService } from '../services/legal.service.js';

const CLAVES = ['terminos', 'privacidad'];
let claveActual = 'terminos';

function normalizarClave(valor) {
  return CLAVES.includes(valor) ? valor : 'terminos';
}

function pintar(documento) {
  const titulo = $('avisoLegalTitulo');
  const version = $('avisoLegalVersion');
  const contenido = $('avisoLegalContenido');
  if (titulo) titulo.textContent = documento.titulo || 'Aviso legal';
  if (version) {
    version.textContent = documento.version
      ? `Versión ${documento.version}${
          documento.publicadoEn
            ? ` · ${new Date(documento.publicadoEn).toLocaleDateString('es-MX')}`
            : ''
        }`
      : 'Versión informativa';
  }
  if (contenido) contenido.innerHTML = documento.html || '<p>Contenido no disponible.</p>';
  document.querySelectorAll('[data-action="avisoLegal:doc"]').forEach((boton) => {
    boton.classList.toggle('active', boton.dataset.valor === documento.clave);
  });
}

export async function cargar(clave = claveActual) {
  claveActual = normalizarClave(clave);
  const { documento } = await legalService.publicado(claveActual);
  pintar(documento);
}

export function abrir({ clave = 'terminos' } = {}) {
  claveActual = normalizarClave(clave);
  abrirModal('modalAvisoLegal', { nested: true });
  cargar(claveActual).catch((error) => {
    const contenido = $('avisoLegalContenido');
    if (contenido) {
      contenido.textContent = `No se pudo cargar el documento: ${error.message || 'error de red'}`;
    }
  });
}

export function registrar() {
  registrarAcciones({
    'avisoLegal:abrir': ({ valor }) => abrir({ clave: valor || 'terminos' }),
    'avisoLegal:doc': ({ valor }) => intentar(() => cargar(valor)),
    'avisoLegal:cerrar': () => cerrarModal('modalAvisoLegal')
  });
}
