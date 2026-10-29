/** Página pública de términos, privacidad y acerca de. */
import { legalService } from './services/legal.service.js';

const CLAVES = ['terminos', 'privacidad', 'acerca'];
const TITULOS = {
  terminos: 'Términos y condiciones',
  privacidad: 'Aviso de privacidad',
  acerca: 'Acerca de este sistema'
};

function claveDeUrl() {
  const clave = new URLSearchParams(location.search).get('doc');
  return CLAVES.includes(clave) ? clave : 'terminos';
}

function pintar(doc) {
  const titulo = document.getElementById('legalTitulo');
  const version = document.getElementById('legalVersion');
  const contenido = document.getElementById('legalContenido');
  if (titulo) titulo.textContent = doc.titulo || TITULOS[doc.clave];
  if (version) {
    version.textContent = doc.version
      ? `Versión publicada ${doc.version}${doc.publicadoEn ? ` · ${new Date(doc.publicadoEn).toLocaleDateString('es-MX')}` : ''}`
      : 'Versión informativa';
  }
  if (contenido) contenido.innerHTML = doc.html || '<p>Contenido no disponible.</p>';
  document.title = `${doc.titulo || TITULOS[doc.clave]} — Sistema de Incidencias Municipales`;
  document.querySelectorAll('[data-doc]').forEach((enlace) => {
    enlace.classList.toggle('activo', enlace.dataset.doc === doc.clave);
  });
}

async function cargar() {
  const clave = claveDeUrl();
  try {
    const { documento } = await legalService.publicado(clave);
    pintar(documento);
  } catch (error) {
    const contenido = document.getElementById('legalContenido');
    if (contenido) contenido.innerHTML = '<p>No se pudo cargar el documento.</p>';
    console.error(error);
  }
}

cargar();
