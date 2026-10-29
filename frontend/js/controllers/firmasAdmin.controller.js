/** Controlador del panel de firmas. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, preguntar, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { sesion } from '../core/session.js';
import { firmasService } from '../services/firmas.service.js';
import * as vista from '../views/firmasAdmin.view.js';

let recolecciones = [];

export async function cargar() {
  const respuesta = sesion.esAdmin()
    ? await firmasService.listarAdmin()
    : await firmasService.listarMunicipio();
  recolecciones = respuesta.recolecciones || [];
  const texto = document.getElementById('firmasAdminTexto')?.value || '';
  vista.renderizar(recolecciones, { esAdmin: sesion.esAdmin(), texto });
}

export function registrar() {
  registrarAcciones({
    'firmasAdmin:recargar': () => intentar(() => cargar()),
    'firmasAdmin:buscar': () => intentar(() => cargar()),
    'firmasAdmin:limpiar': () =>
      intentar(async () => {
        const campo = document.getElementById('firmasAdminTexto');
        if (campo) campo.value = '';
        await cargar();
      }),
    'firmasAdmin:detalle': ({ id }) =>
      intentar(async () => {
        const recoleccion = recolecciones.find((r) => r.id === id);
        if (!recoleccion) return;
        const detalle = sesion.esAdmin()
          ? (await firmasService.detalleAdmin(id)).recoleccion
          : recoleccion;
        vista.renderDetalle(detalle);
        abrirModal('modalFirmaDetalle', { nested: true });
      }),
    'firmasAdmin:exportar': ({ id, valor }) =>
      intentar(() => firmasService.descargar(id, valor === 'pdf' ? 'pdf' : 'csv')),
    'firmasAdmin:enviar': ({ id }) => {
      const campo = document.getElementById('firmaEnviarId');
      if (campo) campo.value = id;
      const destino = document.getElementById('firmaEnviarDestino');
      if (destino) destino.value = '';
      const nota = document.getElementById('firmaEnviarNota');
      if (nota) nota.value = '';
      document.getElementById('firmaEnviarMensaje')?.classList.add('u-oculto');
      abrirModal('modalEnviarFirma', { nested: true });
    },
    'firmasAdmin:confirmarEnviar': () =>
      intentar(async () => {
        const id = document.getElementById('firmaEnviarId')?.value;
        const destino = document.getElementById('firmaEnviarDestino')?.value?.trim();
        const nota = document.getElementById('firmaEnviarNota')?.value?.trim() || '';
        if (!id || !destino) {
          toast('Escribe el funcionario o dependencia de destino', 'err');
          return;
        }
        await firmasService.enviar(id, { destino, nota });
        cerrarModal('modalEnviarFirma');
        await cargar();
        toast('Documento de firmas enviado', 'ok');
      }),
    'firmasAdmin:eliminar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Cerrar esta recolección? Los firmantes se conservan.'))) return;
        await firmasService.solicitarAdmin(id, 'Cierre solicitado desde el panel');
        await cargar();
      })
  });
}
