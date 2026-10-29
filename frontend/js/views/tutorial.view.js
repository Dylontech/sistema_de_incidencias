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
import { $, esc } from '../core/utils.js';

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

/** El foco puede abarcar una sección completa (por ejemplo, toda la tarjeta de alta). */
function focoDe(paso) {
  const selector = paso?.foco || paso?.objetivo;
  return selector ? document.querySelector(selector) : null;
}

/** ¿Otro overlay tapa el centro del área que queremos resaltar? */
function estaCubierto(elemento) {
  if (!elemento) return true;
  const r = elemento.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return true;
  const x = Math.max(1, Math.min(window.innerWidth - 1, r.left + r.width / 2));
  const y = Math.max(1, Math.min(window.innerHeight - 1, r.top + r.height / 2));
  const encima = document.elementFromPoint(x, y);
  if (!encima) return false;
  if (encima.closest('.tutorial-tarjeta')) return false;
  return !(encima === elemento || elemento.contains(encima));
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
  const focoEl = focoDe(paso) || objetivo;

  // Paso sin objetivo (bienvenida, cierre): todo oscurecido y tarjeta centrada.
  if (!focoEl || paso.centrado) {
    capa.classList.add('sin-foco');
    foco.style.display = 'none';
    tarjeta.classList.add('centrada');
    tarjeta.style.top = '';
    tarjeta.style.left = '';
    return;
  }

  focoEl.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = focoEl.getBoundingClientRect();
  const estilo = window.getComputedStyle(focoEl);
  const visible =
    r.width > 0 &&
    r.height > 0 &&
    estilo.display !== 'none' &&
    estilo.visibility !== 'hidden' &&
    Number(estilo.opacity) !== 0 &&
    !estaCubierto(focoEl);

  // Si el objetivo aún no está visible o está tapado por otro overlay, se
  // muestra la tarjeta centrada en lugar de dibujar un foco sobre otra vista.
  if (!visible) {
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

  // La tarjeta no debe tapar la sección enfocada: si la posición elegida se
  // solapa con el objetivo (típico en tarjetas de login grandes), se prueba
  // arriba, abajo y a los lados antes de aceptar el solapamiento.
  const seSolapan = (x, y) =>
    x < r.right && x + ancho > r.left && y < r.bottom && y + alto > r.top;
  if (colocacion !== 'dentro-abajo' && seSolapan(izquierda, arriba)) {
    const margen = 16;
    const candidatos = [
      { x: r.left + r.width / 2 - ancho / 2, y: r.bottom + margen },
      { x: r.left + r.width / 2 - ancho / 2, y: r.top - alto - margen },
      { x: r.right + margen, y: r.top },
      { x: r.left - ancho - margen, y: r.top }
    ];
    const visible = candidatos.find(
      (c) =>
        c.x >= BORDE &&
        c.y >= BORDE &&
        c.x + ancho <= window.innerWidth - BORDE &&
        c.y + alto <= window.innerHeight - BORDE &&
        !seSolapan(c.x, c.y)
    );
    if (visible) {
      izquierda = visible.x;
      arriba = visible.y;
    }
  }

  tarjeta.style.top = `${arriba}px`;
  tarjeta.style.left = `${izquierda}px`;
}

/** Pinta el paso indicado. */
export function renderizar({ paso, indice, total }) {
  pasoActual = paso;

  $('tutorialPaso').textContent = `Paso ${indice + 1} de ${total}`;
  $('tutorialTitulo').textContent = paso.titulo;
  $('tutorialTexto').textContent = paso.texto;
  const avisoDemo = $('tutorialSimulacion');
  if (avisoDemo) {
    avisoDemo.textContent = paso.simulacion
      ? 'Demo interactiva: los datos son de ejemplo y no se guardan.'
      : '';
    avisoDemo.classList.toggle('u-oculto', !paso.simulacion);
  }
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

/* --------------------------- enciclopedia -------------------------------- */

export function renderEnciclopedia(guias = []) {
  const contenedor = $('tutorialesLista');
  if (!contenedor) return;
  if (!guias.length) {
    contenedor.innerHTML = '<div class="empty-state"><p>No hay tutoriales para tu rol.</p></div>';
    return;
  }
  contenedor.innerHTML = guias
    .map(
      (guia) => `<div class="tutorial-guia">
        <div class="tutorial-guia-texto">
          <strong>${esc(guia.titulo)}</strong>
          <span>${esc(guia.descripcion || '')}</span>
          <small>${esc(guia.categoria || '')} · ${guia.pasos.length} pasos</small>
        </div>
        <button class="btn btn-primary btn-sm" data-action="tutorial:guia" data-valor="${esc(guia.id)}">
          Ver guía
        </button>
      </div>`
    )
    .join('');
}

export function leerBusquedaEnciclopedia() {
  return $('tutorialesBuscar')?.value?.trim() || '';
}
