/**
 * Diálogos propios de confirmación.
 *
 * Sustituye a `window.confirm`, que el navegador pinta con el título del sitio
 * («localhost dijo», «… dice»). No importa nada de `ui.js` a propósito: `ui.js`
 * importa este módulo para reexportar `preguntar`, y así se evita un ciclo.
 *
 * El modal se abre con la clase `show`, la misma que usan los demás modales,
 * para que la trampa de tabulación y el fondo de `inicializarModales` sigan
 * funcionando.
 */

let resolver = null;
let inicializado = false;

function elementos() {
  return {
    modal: document.getElementById('modalConfirmar'),
    titulo: document.getElementById('confirmarTitulo'),
    mensaje: document.getElementById('confirmarMensaje'),
    aceptar: document.getElementById('confirmarAceptar'),
    cancelar: document.getElementById('confirmarCancelar'),
    icono: document.getElementById('confirmarIcono')
  };
}

function cerrar(valor) {
  if (!resolver) return;
  const pendiente = resolver;
  resolver = null;
  const { modal } = elementos();
  if (modal) {
    modal.classList.remove('show');
    modal.classList.remove('nested');
  }
  pendiente(valor);
}

export function inicializarDialogos() {
  if (inicializado) return;
  inicializado = true;

  const { aceptar, cancelar, modal } = elementos();
  aceptar?.addEventListener('click', () => cerrar(true));
  cancelar?.addEventListener('click', () => cerrar(false));

  // El fondo del modal y Escape resuelven como cancelado. Se captura antes que
  // el manejador global para que este no cierre otro modal que esté debajo.
  document.addEventListener(
    'click',
    (evento) => {
      if (evento.target === modal && resolver) cerrar(false);
    },
    true
  );

  document.addEventListener(
    'keydown',
    (evento) => {
      if (evento.key !== 'Escape' || !resolver) return;
      evento.preventDefault();
      evento.stopPropagation();
      cerrar(false);
    },
    true
  );
}

/**
 * Pregunta al usuario y resuelve con `true` si acepta.
 * Si el modal no existe en el documento (otra página), cae a `confirm`.
 */
export function confirmar({
  titulo = 'Confirmar',
  mensaje = '',
  textoAceptar = 'Aceptar',
  textoCancelar = 'Cancelar',
  peligro = false
} = {}) {
  inicializarDialogos();
  const el = elementos();
  if (!el.modal) return Promise.resolve(window.confirm(mensaje));

  // Si ya había una confirmación abierta, se cancela antes de abrir la nueva.
  if (resolver) cerrar(false);

  el.titulo.textContent = titulo;
  el.mensaje.textContent = mensaje;
  el.aceptar.textContent = textoAceptar;
  el.cancelar.textContent = textoCancelar;
  el.icono.className = `bi ${peligro ? 'bi-exclamation-triangle-fill' : 'bi-question-circle-fill'}`;
  el.aceptar.className = `btn ${peligro ? 'btn-danger' : 'btn-primary'}`;

  el.modal.classList.add('nested');
  el.modal.classList.add('show');
  window.setTimeout(() => el.aceptar.focus({ preventScroll: true }), 0);

  return new Promise((resolverPromesa) => {
    resolver = resolverPromesa;
  });
}
