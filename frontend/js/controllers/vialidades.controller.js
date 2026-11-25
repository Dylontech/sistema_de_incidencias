/** Controlador del catálogo administrativo de vialidades. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, loading, preguntar, toast } from '../core/ui.js';
import { intentar, mensajeDeError } from '../core/errores.js';
import { $ } from '../core/utils.js';
import { store } from '../core/store.js';
import { vialidadesService } from '../services/vialidades.service.js';
import { recargarVialidades } from './incidencias.controller.js';
import * as vista from '../views/vialidades.view.js';
import * as aplicacion from '../core/aplicacion.js';
import * as vialidadesMapa from '../map/vialidades.js';

let datos = null;
let archivoTexto = '';
let consultaActual = 0;
let lecturaActual = 0;
let leyendoArchivo = false;
let escribiendo = false;

function actualizarControles() {
  document.querySelectorAll(
    '[data-action="vialidades:importar"], [data-action="vialidades:importarOsm"], ' +
    '[data-action="vialidades:verificar"], [data-action="vialidades:eliminar"], ' +
    '[form="formVialidad"][type="submit"], #vialidadesArchivo'
  ).forEach((elemento) => {
    elemento.disabled = escribiendo ||
      (elemento.dataset.action === 'vialidades:importar' && leyendoArchivo);
  });
}

async function escribir(operacion) {
  if (escribiendo) return;
  escribiendo = true;
  actualizarControles();
  try {
    return await intentar(operacion);
  } finally {
    escribiendo = false;
    actualizarControles();
  }
}

async function refrescar({ guardado = false } = {}) {
  if (guardado) vialidadesMapa.invalidar();
  const resultados = await Promise.allSettled([cargar(), recargarVialidades()]);
  const fallos = resultados.filter((resultado) => resultado.status === 'rejected');
  const aviso = $('vialidadesRecargaAviso');
  if (aviso) aviso.hidden = fallos.length === 0;
  if (fallos.length) {
    const mensaje = `${guardado ? 'Los cambios se guardaron. ' : ''}No se pudo actualizar toda la vista. ${mensajeDeError(fallos[0].reason)}`;
    const texto = $('vialidadesRecargaMensaje');
    if (texto) texto.textContent = mensaje;
    toast(`${mensaje} Usa «Reintentar actualización».`, 'err');
  }
}

function municipioActivo() {
  return store.estado.municipioActivo?.id || '';
}

function filtros() {
  return {
    municipioId: $('vialidadesMunicipioFiltro')?.value || municipioActivo(),
    tipo: $('vialidadesTipoFiltro')?.value || '',
    fuente: $('vialidadesFuenteFiltro')?.value || '',
    texto: $('vialidadesTexto')?.value.trim() || '',
    desactualizadas: $('vialidadesEstadoFiltro')?.value === 'desactualizadas',
    sinVerificar: $('vialidadesEstadoFiltro')?.value === 'sinVerificar'
  };
}

export async function cargar() {
  const consulta = ++consultaActual;
  const base = filtros();
  if (!base.municipioId) {
    toast('Elige un municipio para consultar sus vialidades', 'err');
    return null;
  }
  vista.renderMunicipios(store.estado.municipios || [], base.municipioId);
  const vigente = () => consulta === consultaActual && JSON.stringify(base) === JSON.stringify(filtros());
  const lista = $('vialidadesLista');
  lista?.setAttribute('aria-busy', 'true');
  try {
    const respuesta = await vialidadesService.listar(base);
    if (!vigente()) return null;
    datos = respuesta;
    vista.renderLista(datos, {
      municipios: store.estado.municipios || [],
      tipos: datos.tipos || [],
      fuentes: datos.fuentes || []
    });
    actualizarControles();
    return datos;
  } catch (error) {
    if (vigente()) throw error;
    return null;
  } finally {
    if (consulta === consultaActual) lista?.setAttribute('aria-busy', 'false');
  }
}

function limpiarArchivo() {
  lecturaActual += 1;
  leyendoArchivo = false;
  archivoTexto = '';
  const input = $('vialidadesArchivo');
  if (input) input.value = '';
  const nota = $('vialidadesArchivoNota');
  if (nota) nota.textContent = 'Sin archivo seleccionado.';
  actualizarControles();
}

function abrirEditor(via = null) {
  vista.prepararModal(via, {
    municipios: store.estado.municipios || [],
    municipioActivo: filtros().municipioId,
    tipos: datos?.tipos || [],
    fuentes: datos?.fuentes || []
  });
  abrirModal('modalVialidad', { nested: true });
}

export function registrar() {
  registrarAcciones({
    'vialidades:recargar': () => refrescar(),
    'vialidades:filtrar': () => intentar(() => cargar()),
    'vialidades:limpiar': () =>
      intentar(async () => {
        for (const id of ['vialidadesTipoFiltro', 'vialidadesFuenteFiltro', 'vialidadesEstadoFiltro']) {
          const campo = document.getElementById(id);
          if (campo) campo.value = '';
        }
        const texto = $('vialidadesTexto');
        if (texto) texto.value = '';
        await cargar();
      }),
    'vialidades:nueva': () => abrirEditor(null),
    'vialidades:editar': ({ id }) => {
      const via = datos?.vialidades?.find((item) => item.id === id);
      if (!via) return toast('No se encontró la vialidad', 'err');
      abrirEditor(via);
    },
    'vialidades:guardar': () =>
      escribir(async () => {
        if ($('formVialidad')?.reportValidity() === false) return;
        const entrada = vista.leerFormulario();
        if (!entrada.id) delete entrada.id;
        if (!entrada.geometria) {
          toast('Indica al menos el inicio y el fin del tramo', 'err');
          return;
        }
        if (entrada.id) await vialidadesService.actualizar(entrada.id, entrada);
        else await vialidadesService.crear(entrada);
        cerrarModal('modalVialidad');
        toast(entrada.id ? 'Vialidad actualizada' : 'Vialidad creada', 'ok');
        await refrescar({ guardado: true });
      }),
    'vialidades:verificar': ({ id }) =>
      escribir(async () => {
        await vialidadesService.verificar(id);
        toast('Vialidad marcada como verificada', 'ok');
        await refrescar({ guardado: true });
      }),
    'vialidades:eliminar': ({ id }) =>
      escribir(async () => {
        if (!(await preguntar('¿Archivar esta vialidad? Dejará de aparecer en la capa del mapa.'))) {
          return;
        }
        await vialidadesService.eliminar(id);
        toast('Vialidad archivada', 'ok');
        await refrescar({ guardado: true });
      }),
    'vialidades:archivo': ({ elemento }) => {
      const lectura = ++lecturaActual;
      const archivo = elemento?.files?.[0];
      archivoTexto = '';
      leyendoArchivo = Boolean(archivo);
      actualizarControles();
      const nota = $('vialidadesArchivoNota');
      if (!archivo) {
        if (nota) nota.textContent = 'Sin archivo seleccionado.';
        return;
      }
      if (nota) nota.textContent = `Leyendo ${archivo.name}…`;
      const lector = new FileReader();
      lector.onload = () => {
        if (lectura !== lecturaActual) return;
        leyendoArchivo = false;
        archivoTexto = String(lector.result || '');
        if (nota) nota.textContent = `${archivo.name} · ${Math.round(archivo.size / 1024)} KB`;
        actualizarControles();
      };
      const fallo = () => {
        if (lectura !== lecturaActual) return;
        leyendoArchivo = false;
        archivoTexto = '';
        if (nota) nota.textContent = 'No se pudo leer el archivo. Selecciónalo de nuevo.';
        actualizarControles();
        toast('No se pudo leer el archivo', 'err');
      };
      lector.onerror = fallo;
      lector.onabort = fallo;
      try { lector.readAsText(archivo); } catch { fallo(); }
    },
    'vialidades:importar': () =>
      escribir(async () => {
        const municipioId = $('vialidadesMunicipioFiltro')?.value || municipioActivo();
        if (!municipioId) return toast('Elige un municipio para importar', 'err');
        if (leyendoArchivo) return toast('Espera a que termine la lectura del archivo', 'err');
        if (!archivoTexto.trim()) return toast('Selecciona un archivo KML o GeoJSON con contenido', 'err');
        const contenido = archivoTexto;
        const lectura = lecturaActual;
        const fuente = $('vialidadesImportarFuente')?.value || 'google_maps';
        const reemplazar = $('vialidadesReemplazar')?.checked === true;
        const mensaje = reemplazar
          ? 'Se reemplazará todo el trazado del municipio. ¿Continuar?'
          : 'Se fusionará la red importada con la existente. ¿Continuar?';
        if (!(await preguntar(mensaje))) return;
        loading(true, 'Importando vialidades…');
        try {
          const resultado = await vialidadesService.importar({
            municipioId,
            fuente,
            reemplazar,
            contenido
          });
          toast(
            `${resultado.total} vialidad(es): ${resultado.creadas} nueva(s), ${resultado.actualizadas} actualizada(s)`,
            'ok'
          );
          if (lectura === lecturaActual) limpiarArchivo();
          await refrescar({ guardado: true });
        } finally {
          loading(false);
        }
      }),
    'vialidades:importarOsm': () =>
      escribir(async () => {
        const municipioId = $('vialidadesMunicipioFiltro')?.value || municipioActivo();
        if (!municipioId) return toast('Elige un municipio para importar', 'err');
        if (
          !(await preguntar(
            'Se descargará la red vial real de OpenStreetMap y se fusionará con la existente. ¿Continuar?'
          ))
        ) {
          return;
        }
        loading(true, 'Descargando red vial de OpenStreetMap…');
        try {
          const resultado = await vialidadesService.importarOsm({ municipioId });
          toast(
            `${resultado.total} vialidad(es) de OSM: ${resultado.creadas} nueva(s), ${resultado.actualizadas} actualizada(s)`,
            'ok'
          );
          await refrescar({ guardado: true });
        } finally {
          loading(false);
        }
      }),
    'vialidades:verMapa': () =>
      intentar(async () => {
        const municipioId = filtros().municipioId;
        if (!municipioId) return toast('Elige un municipio para ver sus vialidades', 'err');
        await aplicacion.cambiarMunicipio(municipioId);
        cerrarModal('modalAdmin');
        const boton = $('btnVialidades');
        if (boton?.getAttribute('aria-pressed') !== 'true') boton?.click();
        else await recargarVialidades();
      })
  });
}
