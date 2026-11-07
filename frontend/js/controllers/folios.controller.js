/** Controlador del historial de folios. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { foliosService } from '../services/folios.service.js';
import * as vista from '../views/folios.view.js';

let pagina = 1;

async function cargar(destino = pagina) {
  pagina = Math.max(Number(destino) || 1, 1);
  const datos = await foliosService.mios({ ...vista.leerFiltros(), pagina, limite: 20 });
  vista.renderizar(datos);
}

export function registrar() {
  registrarAcciones({
    'folios:abrir': () =>
      intentar(async () => {
        abrirModal('modalFolios');
        await cargar(1);
      }),
    'folios:buscar': () => intentar(() => cargar(1)),
    'folios:limpiar': () =>
      intentar(async () => {
        for (const id of ['foliosTexto', 'foliosDesde', 'foliosHasta']) {
          const campo = document.getElementById(id);
          if (campo) campo.value = '';
        }
        const tipo = document.getElementById('foliosTipo');
        if (tipo) tipo.value = '';
        await cargar(1);
      }),
    'folios:pagina': ({ valor }) => intentar(() => cargar(valor)),
    'folios:abrirDetalle': ({ valor }) =>
      intentar(async () => {
        const { folio } = await foliosService.detalle(valor);
        if (folio?.url) {
          // Los tickets se abren en el modal, sin recargar la aplicación.
          const destino = new URL(folio.url, location.origin);
          const ticket = destino.searchParams.get('ticket');
          if (ticket) {
            const { abrirCon } = await import('./ticketsModal.controller.js');
            await abrirCon(ticket);
            return;
          }
          window.location.assign(folio.url);
          return;
        }
        toast('Ese folio no tiene una vista asociada', 'info');
      })
  });
}
