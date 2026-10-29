/** Controlador del simulador de acciones. */
import { registrarAcciones } from '../core/eventos.js';
import { preguntar, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { simuladorService } from '../services/simulador.service.js';
import * as vista from '../views/simulador.view.js';

let catalogo = null;
let sesionActual = null;

function municipios() {
  return (store.estado.municipios || []).slice();
}

function valoresDe(accion) {
  const datos = {};
  for (const campo of accion.campos || []) {
    const elemento = document.getElementById(`simCampo_${accion.id}_${campo.nombre}`);
    if (!elemento) continue;
    const valor = elemento.value;
    if (valor !== '' && valor !== undefined) datos[campo.nombre] = valor;
  }
  return datos;
}

export async function cargar(idSesion = null) {
  const rolSeleccionado = document.getElementById('simuladorRol')?.value || 'ciudadano';
  const respuesta = await simuladorService.catalogo('');
  catalogo = {
    ...respuesta,
    acciones: respuesta.acciones || []
  };

  if (idSesion) {
    const detalle = await simuladorService.detalle(idSesion);
    sesionActual = detalle.sesion;
  } else {
    sesionActual = respuesta.abierta || null;
  }

  const rolActivo = sesionActual?.rolSimulado || rolSeleccionado;
  vista.renderRoles(respuesta.roles || [], rolActivo);
  vista.renderMunicipios(municipios(), store.estado.municipioActivo?.id || '');
  vista.renderSesiones(respuesta.sesiones || []);
  vista.renderEstado(sesionActual);

  const acciones = catalogo.acciones.filter((a) => (a.roles || []).includes(rolActivo));
  vista.renderAcciones(acciones);
  vista.renderJournal(sesionActual?.operaciones || []);
}

async function recargarSesion() {
  if (!sesionActual) return cargar();
  const detalle = await simuladorService.detalle(sesionActual.id);
  sesionActual = detalle.sesion;
  vista.renderEstado(sesionActual);
  const acciones = (catalogo?.acciones || []).filter((a) =>
    (a.roles || []).includes(sesionActual.rolSimulado)
  );
  vista.renderAcciones(acciones);
  vista.renderJournal(sesionActual.operaciones || []);
}

export function registrar() {
  registrarAcciones({
    'simulador:cargar': () => intentar(() => cargar()),

    'simulador:abrir': () =>
      intentar(async () => {
        if (!sesion.esAdmin()) {
          toast('Solo el administrador maestro puede simular acciones', 'err');
          return;
        }
        const rolSimulado = document.getElementById('simuladorRol')?.value;
        const municipioId = document.getElementById('simuladorMunicipio')?.value;
        const notas = document.getElementById('simuladorNotas')?.value || '';
        if (!rolSimulado || !municipioId) {
          toast('Elige rol y municipio para iniciar la simulación', 'err');
          return;
        }
        const { sesion: creada } = await simuladorService.abrir({
          rolSimulado,
          municipioId,
          notas
        });
        sesionActual = creada;
        toast(`Simulación de ${rolSimulado} iniciada`, 'ok');
        await cargar(creada.id);
      }),

    'simulador:ejecutar': ({ id }) =>
      intentar(async () => {
        if (!sesionActual) return;
        const accion = (catalogo?.acciones || []).find((a) => a.id === id);
        if (!accion) return;
        const { resultado } = await simuladorService.ejecutar(
          sesionActual.id,
          id,
          valoresDe(accion)
        );
        toast(`Acción ejecutada: ${accion.titulo}`, 'ok');
        await recargarSesion();
        if (resultado?.folio) toast(`Folio simulado: ${resultado.folio}`, 'ok');
      }),

    'simulador:cerrar': ({ id }) =>
      intentar(async () => {
        await simuladorService.cerrar(id);
        toast('Simulación cerrada; los datos quedan etiquetados', 'ok');
        await cargar();
      }),

    'simulador:revertir': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Revertir la simulación y borrar todos sus datos etiquetados?'))) {
          return;
        }
        await simuladorService.revertir(id);
        toast('Datos simulados eliminados', 'ok');
        sesionActual = null;
        await cargar();
      }),

    'simulador:revertirTodas': () =>
      intentar(async () => {
        if (!(await preguntar('¿Revertir todas las sesiones de simulación de tu cuenta?'))) {
          return;
        }
        const resultado = await simuladorService.revertirTodas();
        toast(`Se revirtieron ${resultado.revertidas} sesiones`, 'ok');
        sesionActual = null;
        await cargar();
      }),

    'simulador:ver': ({ id }) => intentar(() => cargar(id))
  });
}
