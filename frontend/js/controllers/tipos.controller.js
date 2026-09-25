/** Controlador del catálogo de tipos (selector de iconos y alta/baja). */
import { registrarAcciones } from '../core/eventos.js';
import { toast, cerrarModal, abrirModal } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { tiposService } from '../services/tipos.service.js';
import { limpiarPicker, iconoSeleccionado } from '../views/tipos.view.js';
import * as formView from '../views/incidenciaForm.view.js';
import * as aplicacion from '../core/aplicacion.js';
import { store } from '../core/store.js';

export function registrar() {
  registrarAcciones({
    /** Selección de icono en cualquiera de los dos pickers. */
    'tipos:icono': ({ id, elemento }) => {
      const emoji = elemento.dataset.emoji;
      elemento.parentElement.querySelectorAll('.icon-opt').forEach((o) => o.classList.remove('selected'));
      elemento.classList.add('selected');
      elemento.parentElement.dataset.selected = emoji;
      if (id === 'iconPicker') store.actualizarSeccion('formulario', { iconoSeleccionado: emoji });
    },

    'tipos:abrir': () => {
      document.getElementById('nuevoTipoNombre').value = '';
      limpiarPicker('iconPickerNuevo');
      // Anidado: puede abrirse desde el formulario de incidencia o desde el panel.
      abrirModal('modalNuevoTipo', { nested: true });
    },

    'tipos:guardar': () =>
      intentar(async () => {
        const nombre = document.getElementById('nuevoTipoNombre').value.trim();
        const icono = iconoSeleccionado('iconPickerNuevo');
        if (!nombre) {
          toast('Escribe un nombre para el concepto', 'err');
          return;
        }
        if (!icono) {
          toast('Selecciona un icono', 'err');
          return;
        }

        const { tipo } = await tiposService.crear({ nombre, icono });
        cerrarModal('modalNuevoTipo');
        await aplicacion.cargarTipos();

        // Si el formulario de incidencia está abierto, se selecciona el nuevo tipo.
        const selector = document.getElementById('incTipo');
        if (selector) {
          selector.value = tipo.id;
          formView.mostrarEjemplo(tipo.id, store.estado.catalogos.ejemplos);
          formView.renderAviso(tipo);
        }
        toast('Concepto agregado correctamente', 'ok');
      }),

    'tipos:eliminar': ({ id }) =>
      intentar(
        async () => {
          await tiposService.eliminar(id);
          await aplicacion.cargarTipos();
          if (store.estado.usuario?.rol === 'admin' || store.estado.usuario?.rol === 'funcionario') {
            await aplicacion.cargarEstadisticas();
          }
        },
        { exito: 'Tipo eliminado' }
      )
  });
}
