/** Controlador del editor legal del administrador. */
import { registrarAcciones } from '../core/eventos.js';
import { intentar } from '../core/errores.js';
import { toast } from '../core/ui.js';
import { legalService } from '../services/legal.service.js';
import * as vista from '../views/legal.view.js';

let claveActual = 'terminos';

export async function cargar(clave = claveActual) {
  claveActual = clave;
  const datos = await legalService.obtenerAdmin(clave);
  vista.renderDocumento(datos);
  document.querySelectorAll('[data-action="legal:doc"]').forEach((boton) => {
    boton.classList.toggle('active', boton.dataset.valor === clave);
  });
}

export function registrar() {
  registrarAcciones({
    'legal:doc': ({ valor }) => intentar(() => cargar(valor)),
    'legal:formato': ({ valor }) => vista.insertarFormato(valor),
    'legal:guardar': () =>
      intentar(async () => {
        await legalService.guardarBorrador(claveActual, vista.valores());
        await cargar(claveActual);
        toast('Borrador guardado', 'ok');
      }),
    'legal:publicar': () =>
      intentar(async () => {
        await legalService.guardarBorrador(claveActual, vista.valores());
        await legalService.publicar(claveActual);
        await cargar(claveActual);
        toast('Documento publicado', 'ok');
      }),
    'legal:historial': () =>
      intentar(async () => {
        const { historial } = await legalService.historial(claveActual);
        vista.renderHistorial(historial);
      }),
    'legal:restaurar': ({ valor }) =>
      intentar(async () => {
        await legalService.restaurar(claveActual, valor);
        await cargar(claveActual);
        toast(`Versión ${valor} cargada como borrador`, 'ok');
      })
  });
}
