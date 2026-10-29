/** Controlador de configuración central. */
import { registrarAcciones } from '../core/eventos.js';
import { intentar } from '../core/errores.js';
import { toast } from '../core/ui.js';
import { configuracionService } from '../services/configuracion.service.js';
import * as vista from '../views/configuracion.view.js';

export async function cargar() {
  const { configuracion } = await configuracionService.listar();
  vista.renderizar(configuracion);
}

export function registrar() {
  registrarAcciones({
    'configuracion:guardar': () =>
      intentar(async () => {
        await configuracionService.guardar(vista.leer());
        await cargar();
        toast('Configuración guardada', 'ok');
      })
  });
}
