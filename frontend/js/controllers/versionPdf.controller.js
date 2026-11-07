/**
 * Elección de la versión del PDF (clásico o rediseñado).
 *
 * La configuración `informes.motor_pdf` decide:
 *   · `v1` / `v2` → se usa esa versión sin preguntar.
 *   · `preguntar` → se abre `#modalElegirPdf` y se devuelve la elegida.
 *
 * Devuelve `null` si la persona cancela, `'auto'` si no puede consultar la
 * configuración (el servidor decidirá) y `v1`/`v2` en el resto de casos.
 */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal } from '../core/ui.js';
import { statsService } from '../services/stats.service.js';

let pendiente = null;

export async function elegirVersionPdf() {
  let motor = 'auto';
  try {
    const respuesta = await statsService.motorPdf();
    motor = respuesta?.motor || 'auto';
  } catch {
    // Sin permiso para leer la configuración (p. ej. una cuenta ciudadana que
    // descarga el informe de su reclamación): el servidor aplica su valor.
    return 'auto';
  }

  if (motor === 'v1' || motor === 'v2') return motor;
  if (motor !== 'preguntar' || !document.getElementById('modalElegirPdf')) return 'auto';

  abrirModal('modalElegirPdf');
  return new Promise((resolver) => {
    pendiente = resolver;
  });
}

function responder(version) {
  cerrarModal('modalElegirPdf');
  const resolver = pendiente;
  pendiente = null;
  resolver?.(version);
}

export function registrar() {
  registrarAcciones({
    'pdfVersion:elegir': ({ valor }) => responder(valor === 'v1' ? 'v1' : 'v2'),
    'pdfVersion:cerrar': () => responder(null)
  });
}
