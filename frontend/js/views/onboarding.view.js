/**
 * Vista del paso previo a la aplicación: municipio y aceptación de términos.
 * No decide nada: el controlador le dice qué paso mostrar.
 */
import { $, esc } from '../core/utils.js';
import { crearBuscador } from '../core/buscador.js';
import { opcionesMunicipios } from './login.view.js';

/** Buscador del municipio del paso previo (se crea la primera vez que se usa). */
let buscador = null;
function comboMunicipio() {
  if (!buscador) {
    buscador = crearBuscador({
      entrada: 'obMunicipioBuscar',
      lista: 'obMunicipioOpciones',
      fuente: 'obMunicipioSelect'
    });
  }
  return buscador;
}

/**
 * Rellena el catálogo del paso previo.
 * El `<select>` va oculto (es la fuente de verdad del valor elegido) y el
 * buscador es lo que se ve.
 */
export function renderMunicipios(municipios = [], activoId = null) {
  const selector = $('obMunicipioSelect');
  if (!selector) return;

  selector.innerHTML = opcionesMunicipios(municipios);
  // Solo se preselecciona si el municipio guardado sigue en el catálogo.
  selector.value = activoId && municipios.some((m) => m.id === activoId) ? activoId : '';

  comboMunicipio()?.cargar(municipios);
}

/** Pinta los términos y el aviso de privacidad publicados. */
export function renderTerminos(documentos = []) {
  const contenedor = $('obTerminosContenido');
  const estatico = $('obTerminosEstatico');
  const version = $('obTerminosVersion');
  if (!contenedor) return;

  if (!documentos.length) {
    contenedor.innerHTML = '';
    estatico?.classList.remove('u-oculto');
    if (version) version.textContent = 'No se pudo cargar la versión publicada.';
    return;
  }

  estatico?.classList.add('u-oculto');
  contenedor.innerHTML = documentos
    .map(
      (documento) => `
      <section class="terminos-doc">
        <h3>${esc(documento.titulo || documento.clave)}</h3>
        <div class="terminos-doc-html">${documento.html || ''}</div>
      </section>`
    )
    .join('');
  if (version) {
    version.textContent = documentos
      .map((documento) => `${documento.titulo || documento.clave}: versión ${documento.version || 0}`)
      .join(' · ');
  }
  contenedor.scrollTop = 0;
}

/** Muestra un paso: 'municipio' | 'terminos'. */
export function paso(nombre) {
  const municipio = $('obMunicipio');
  const terminos = $('obTerminos');
  if (municipio) municipio.style.display = nombre === 'municipio' ? 'block' : 'none';
  if (terminos) terminos.style.display = nombre === 'terminos' ? 'block' : 'none';

  const sub = $('obSubtitulo');
  if (sub) {
    sub.textContent =
      nombre === 'municipio'
        ? 'Escribe y elige el municipio en el que vas a reportar.'
        : 'Lee y acepta los términos para continuar.';
  }

  // El buscador queda listo para escribir en cuanto se abre el paso.
  if (nombre === 'municipio') $('obMunicipioBuscar')?.focus();
  if (nombre === 'terminos') $('obTerminosContenido')?.scrollTo?.({ top: 0 });
}

/**
 * Abre el paso previo. Con `soloLectura` (relectura desde la aplicación) se
 * muestra la «×» para cerrarlo; en la entrada obligatoria no hay forma de
 * saltárselo.
 */
export function mostrar({ conMunicipio = true, soloLectura = false } = {}) {
  const overlay = $('onboarding');
  if (!overlay) return;
  // La pantalla de acceso (si estaba abierta) queda detrás y estorba: el paso
  // previo la sustituye hasta que la aplicación arranca.
  const login = $('loginScreen');
  if (login) login.hidden = true;
  overlay.hidden = false;

  const cerrar = $('obCerrar');
  if (cerrar) {
    cerrar.hidden = !soloLectura;
    cerrar.classList.toggle('u-oculto', !soloLectura);
  }

  const volver = $('obVolver');
  if (volver) volver.hidden = soloLectura || !conMunicipio;

  paso(conMunicipio ? 'municipio' : 'terminos');
}

export function ocultar() {
  const overlay = $('onboarding');
  if (overlay) overlay.hidden = true;
}

export function valorMunicipio() {
  return $('obMunicipioSelect')?.value || null;
}

export function aceptado() {
  return $('obAcepto')?.checked === true;
}

export function marcarAceptado(valor) {
  const casilla = $('obAcepto');
  if (casilla) casilla.checked = valor === true;
}
