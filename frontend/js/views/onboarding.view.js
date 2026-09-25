/**
 * Vista del paso previo a la aplicación: municipio y aceptación de términos.
 * No decide nada: el controlador le dice qué paso mostrar.
 */
import { $ } from '../core/utils.js';
import { opcionesMunicipios } from './login.view.js';

export function renderMunicipios(municipios = [], activoId = null) {
  const selector = $('obMunicipioSelect');
  if (!selector) return;
  selector.innerHTML = opcionesMunicipios(municipios);
  // Solo se preselecciona si el municipio guardado sigue en el catálogo.
  if (activoId && municipios.some((m) => m.id === activoId)) selector.value = activoId;
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
        ? 'Elige el municipio en el que vas a reportar.'
        : 'Lee y acepta los términos para continuar.';
  }
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
