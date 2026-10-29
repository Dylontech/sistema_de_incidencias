/** Controlador de respaldos. */
import { registrarAcciones } from '../core/eventos.js';
import { BASE, token } from '../core/api.js';
import { abrirModal, cerrarModal, preguntar, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { respaldosService } from '../services/respaldos.service.js';
import * as vista from '../views/respaldos.view.js';

let pagina = 1;

export async function cargar(destino = pagina) {
  pagina = Math.max(Number(destino) || 1, 1);
  const texto = document.getElementById('respaldosTexto')?.value || '';
  const tipo = document.getElementById('respaldosTipo')?.value || '';
  const [lista, stats] = await Promise.all([
    respaldosService.listar({ texto, tipo, pagina, limite: 20 }),
    respaldosService.estadisticas()
  ]);
  vista.renderizar(lista.respaldos || [], {
    total: lista.total || 0,
    pagina: lista.pagina || pagina,
    limite: lista.limite || 20
  });
  vista.renderResumen(stats.estadisticas || {});
}

async function descargar(id) {
  const respuesta = await fetch(respaldosService.urlDescarga(id), {
    headers: { Authorization: `Bearer ${token.leer()}` }
  });
  if (!respuesta.ok) throw new Error('No se pudo descargar el respaldo');
  const blob = await respuesta.blob();
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = `respaldo-${id.slice(0, 8)}.json.gz`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

export function registrar() {
  registrarAcciones({
    'respaldos:buscar': () => intentar(() => cargar(1)),
    'respaldos:limpiar': () =>
      intentar(async () => {
        const texto = document.getElementById('respaldosTexto');
        const tipo = document.getElementById('respaldosTipo');
        if (texto) texto.value = '';
        if (tipo) tipo.value = '';
        await cargar(1);
      }),
    'respaldos:pagina': ({ valor }) => intentar(() => cargar(valor)),
    'respaldos:crear': () =>
      intentar(async () => {
        const nombre = document.getElementById('respaldosNombre')?.value?.trim() || '';
        const incluirSimulados = document.getElementById('respaldosIncluirSimulados')?.checked === true;
        await respaldosService.crear({ nombre, incluirSimulados });
        await cargar(1);
        toast('Respaldo creado', 'ok');
      }),
    'respaldos:descargar': ({ id }) => intentar(() => descargar(id)),
    'respaldos:restaurar': ({ id }) => {
      const campo = document.getElementById('restaurarRespaldoId');
      if (campo) campo.value = id;
      const confirmacion = document.getElementById('restaurarConfirmacion');
      if (confirmacion) confirmacion.value = '';
      document.getElementById('restaurarMensaje')?.classList.add('u-oculto');
      abrirModal('modalRestaurarRespaldo', { nested: true });
    },
    'respaldos:confirmarRestaurar': () =>
      intentar(async () => {
        const id = document.getElementById('restaurarRespaldoId')?.value;
        const confirmacion = document.getElementById('restaurarConfirmacion')?.value || '';
        if (!id) return;
        if (confirmacion.trim().toUpperCase() !== 'RESTAURAR') {
          const aviso = document.getElementById('restaurarMensaje');
          if (aviso) {
            aviso.textContent = 'Escribe exactamente RESTAURAR para confirmar.';
            aviso.className = 'publico-msg err';
            aviso.classList.remove('u-oculto');
          }
          return;
        }
        await respaldosService.restaurar(id, confirmacion);
        cerrarModal('modalRestaurarRespaldo');
        await cargar(1);
        toast('Respaldo restaurado', 'ok');
      }),
    'respaldos:eliminar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Eliminar este respaldo del listado? El archivo no se borra del servidor.'))) {
          return;
        }
        await respaldosService.eliminar(id);
        await cargar(1);
        toast('Respaldo eliminado', 'ok');
      })
  });
}
