/**
 * Consulta en vivo del estado de un correo.
 *
 * La usa el alta ciudadana y la solicitud pública de acceso. Solo mejora la
 * experiencia: el servidor vuelve a comprobar el correo al crear la cuenta.
 */
export function vigilarCorreo(
  input,
  { contexto = 'registro', estadoEl = null, alCambiar = null } = {}
) {
  if (!input) return { revisar: () => Promise.resolve(null), limpiar: () => {} };
  let temporizador = null;
  let solicitud = 0;

  function pintar(datos) {
    if (!estadoEl) return;
    estadoEl.classList.remove('u-rojo', 'u-verde-oscuro');
    estadoEl.textContent = datos?.mensaje || '';
    estadoEl.classList.add(datos?.disponible ? 'u-verde-oscuro' : 'u-rojo');
    input.dataset.estadoCorreo = datos?.disponible ? 'disponible' : datos?.accion || 'conflicto';
    if (alCambiar) alCambiar(datos);
  }

  async function revisar() {
    const correo = String(input.value || '').trim();
    if (!correo) {
      input.dataset.estadoCorreo = '';
      if (estadoEl) {
        estadoEl.textContent = '';
        estadoEl.classList.remove('u-rojo', 'u-verde-oscuro');
      }
      if (alCambiar) alCambiar(null);
      return null;
    }
    const turno = ++solicitud;
    try {
      const respuesta = await fetch('/api/publico/correo/estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, contexto })
      });
      const datos = await respuesta.json().catch(() => null);
      if (turno !== solicitud) return null;
      if (!respuesta.ok) {
        // Si el limitador o la red fallan, no se bloquea el envío: el
        // servidor hará la comprobación definitiva.
        input.dataset.estadoCorreo = 'sin-verificar';
        if (estadoEl) {
          estadoEl.textContent = '';
          estadoEl.classList.remove('u-rojo', 'u-verde-oscuro');
        }
        if (alCambiar) alCambiar(null);
        return null;
      }
      pintar(datos);
      return datos;
    } catch {
      if (turno !== solicitud) return null;
      input.dataset.estadoCorreo = 'sin-verificar';
      if (alCambiar) alCambiar(null);
      return null;
    }
  }

  function programar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(revisar, 550);
  }

  input.addEventListener('blur', revisar);
  input.addEventListener('input', programar);

  return {
    revisar,
    limpiar() {
      clearTimeout(temporizador);
      solicitud += 1;
      input.dataset.estadoCorreo = '';
      if (estadoEl) {
        estadoEl.textContent = '';
        estadoEl.classList.remove('u-rojo', 'u-verde-oscuro');
      }
      if (alCambiar) alCambiar(null);
    }
  };
}
