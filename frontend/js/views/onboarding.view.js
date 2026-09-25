/**
 * Vista del paso previo a la aplicación: municipio y aceptación de términos.
 * No decide nada: el controlador le dice qué paso mostrar.
 */
import { $ } from '../core/utils.js';
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
  if (login) login.style.display = 'none';
  overlay.style.display = 'flex';

  const cerrar = $('obCerrar');
  if (cerrar) cerrar.style.display = soloLectura ? 'block' : 'none';

  const volver = $('obVolver');
  if (volver) volver.style.display = !soloLectura && conMunicipio ? 'inline-flex' : 'none';

  paso(conMunicipio ? 'municipio' : 'terminos');
}

export function ocultar() {
  const overlay = $('onboarding');
  if (overlay) overlay.style.display = 'none';
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
