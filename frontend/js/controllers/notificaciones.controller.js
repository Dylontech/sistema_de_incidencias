/** Controlador de notificaciones. */
import { registrarAcciones } from '../core/eventos.js';
import { toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { notificacionesService } from '../services/notificaciones.service.js';
import * as aplicacion from '../core/aplicacion.js';
import * as notifView from '../views/notificaciones.view.js';

export function registrar() {
  registrarAcciones({
    'notificaciones:leer': ({ id }) =>
      intentar(async () => {
        await notificacionesService.marcarLeida(id);
        await aplicacion.recargarNotificaciones();
      }),

    'notificaciones:marcarTodas': () =>
      intentar(
        async () => {
          await notificacionesService.marcarTodas();
          await aplicacion.recargarNotificaciones();
        },
        { exito: 'Todas marcadas como leídas' }
      ),

    'notificaciones:eliminar': ({ id }) =>
      intentar(async () => {
        await notificacionesService.eliminar(id);
        await aplicacion.recargarNotificaciones();
      }),

    /** Cierra el panel al hacer clic fuera de él. */
    'notificaciones:cerrarPanel': () => notifView.alternarPanel(false)
  });
}

/** Suscribe el cierre del panel a los clics fuera (login.controller no lo hace). */
export function conectarCierreExterno() {
  document.addEventListener('click', (evento) => {
    if (!notifView.panelVisible()) return;
    const panel = document.getElementById('notifPanel');
    const boton = evento.target.closest('[data-action="notificaciones:toggle"]');
    if (!panel.contains(evento.target) && !boton) notifView.alternarPanel(false);
  });
}
