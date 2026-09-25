/**
 * Vista del tutorial guiado.
 *
 * Pinta el foco (un recorte iluminado sobre el elemento del paso) y la tarjeta
 * que lo explica. No decide nada: el controlador le pasa el paso actual.
 *
 * El recorte se hace con un elemento del tamaño del objetivo y una sombra
 * enorme (`box-shadow: 0 0 0 9999px`) que oscurece todo lo demás; así no hacen
 * falta máscaras SVG ni recortar cuatro paneles.
 */
import { $ } from '../core/utils.js';

/** Márgenes que se dejan alrededor del objetivo iluminado y de la ventana. */
const AIRE = 6;
const BORDE = 14;

/** Último paso pintado (para recolocar al cambiar el tamaño de la ventana). */
let pasoActual = null;

/** Elemento objetivo del paso, si lo tiene y sigue en el documento. */
function objetivoDe(paso) {
  if (!paso?.objetivo) return null;
  return document.querySelector(paso.objetivo);
}

/**
 * Coloca el foco y la tarjeta.
 *
 * `colocacion` admite 'derecha', 'abajo', 'arriba', 'dentro-abajo' o 'auto'
 * (por omisión: debajo si cabe, si no encima).
 */
function posicionar() {
  const paso = pasoActual;
  if (!paso) return;

  const capa = $('tutorial');
  const foco = $('tutorialFoco');
  const tarjeta = $('tutorialTarjeta');
  const objetivo = objetivoDe(paso);

  // Paso sin objetivo (bienvenida, cierre): todo oscurecido y tarjeta centrada.
  if (!objetivo || paso.centrado) {
    capa.classList.add('sin-foco');
    foco.style.display = 'none';
    tarjeta.classList.add('centrada');
    tarjeta.style.top = '';
    tarjeta.style.left = '';
    return;
  }

  capa.classList.remove('sin-foco');
  foco.style.display = 'block';
  tarjeta.classList.remove('centrada');

  objetivo.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = objetivo.getBoundingClientRect();
  foco.style.top = `${r.top - AIRE}px`;
  foco.style.left = `${r.left - AIRE}px`;
  foco.style.width = `${r.width + AIRE * 2}px`;
  foco.style.height = `${r.height + AIRE * 2}px`;

  const ancho = tarjeta.offsetWidth;
  const alto = tarjeta.offsetHeight;
  const colocacion = paso.colocacion || 'auto';
  const cabeDebajo = window.innerHeight - r.bottom > alto + 24;

  let arriba;
  let izquierda;

  switch (colocacion) {
    case 'derecha':
      arriba = r.top;
      izquierda = r.right + 16;
      break;
    case 'izquierda':
      arriba = r.top;
      izquierda = r.left - ancho - 16;
      break;
    case 'abajo':
      arriba = r.bottom + 14;
      izquierda = r.left + r.width / 2 - ancho / 2;
      break;
    case 'arriba':
      arriba = r.top - alto - 14;
      izquierda = r.left + r.width / 2 - ancho / 2;
      break;
    case 'dentro-abajo':
      // Para objetivos grandes (el mapa): la tarjeta va dentro, abajo.
      arriba = Math.min(r.bottom - alto - 20, window.innerHeight - alto - BORDE);
      izquierda = r.left + r.width / 2 - ancho / 2;
      break;
    default:
      arriba = cabeDebajo ? r.bottom + 14 : r.top - alto - 14;
      izquierda = r.left + r.width / 2 - ancho / 2;
  }

  // Si el tooltip no cabe a la izquierda, se pasa a la derecha.
  if (izquierda < BORDE && colocacion === 'izquierda') izquierda = r.right + 16;

  // Nunca fuera de la pantalla.
  if (izquierda + ancho > window.innerWidth - BORDE) {
    izquierda = colocacion === 'derecha' ? r.left - ancho - 16 : window.innerWidth - ancho - BORDE;
  }
  arriba = Math.max(BORDE, Math.min(arriba, window.innerHeight - alto - BORDE));
  izquierda = Math.max(BORDE, Math.min(izquierda, window.innerWidth - ancho - BORDE));

  tarjeta.style.top = `${arriba}px`;
  tarjeta.style.left = `${izquierda}px`;
}

/** Pinta el paso indicado. */
export function renderizar({ paso, indice, total }) {
  pasoActual = paso;

  $('tutorialPaso').textContent = `Paso ${indice + 1} de ${total}`;
  $('tutorialTitulo').textContent = paso.titulo;
  $('tutorialTexto').textContent = paso.texto;
  $('tutorialPuntos').innerHTML = Array.from({ length: total })
    .map((_, i) => `<span class="tutorial-punto${i === indice ? ' activo' : ''}"></span>`)
    .join('');

  // En el primer paso no hay «Anterior»; en el último, el botón invita a cerrar.
  $('tutorialAnterior').style.visibility = indice === 0 ? 'hidden' : 'visible';
  $('tutorialSiguiente').textContent = indice === total - 1 ? '¡Listo!' : 'Siguiente →';

  $('tutorial').style.display = 'block';
  // El offsetWidth depende del contenido recién pintado: primero medir, luego colocar.
  posicionar();
  $('tutorialSiguiente').focus({ preventScroll: true });
}

/** Vuelve a colocar el foco (al girar el móvil o cambiar el tamaño de la ventana). */
export function recolocar() {
  if ($('tutorial')?.style.display === 'block') posicionar();
}

export function visible() {
  return $('tutorial')?.style.display === 'block';
}

export function ocultar() {
  pasoActual = null;
  const capa = $('tutorial');
  if (capa) {
    capa.style.display = 'none';
    capa.classList.remove('sin-foco');
  }
}
