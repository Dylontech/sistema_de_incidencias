/** Controlador de acceso y verificación de cuentas. */
import { registrarAcciones } from '../core/eventos.js';
import { intentar } from '../core/errores.js';
import { toast } from '../core/ui.js';
import { configuracionService } from '../services/configuracion.service.js';
import * as vista from '../views/verificacion.view.js';

export async function cargar() {
  const { configuracion } = await configuracionService.verificacion();
  vista.renderizar(configuracion);
}

export function registrar() {
  registrarAcciones({
    'verificacion:guardar': () =>
      intentar(async () => {
        await configuracionService.guardarVerificacion(vista.leer());
        await cargar();
        toast('Verificación de cuentas actualizada', 'ok');
      })
  });
}
