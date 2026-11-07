/** Controlador del catálogo administrativo de vialidades. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, loading, preguntar, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { $ } from '../core/utils.js';
import { store } from '../core/store.js';
import { vialidadesService } from '../services/vialidades.service.js';
import { recargarVialidades } from './incidencias.controller.js';
import * as vista from '../views/vialidades.view.js';

let datos = null;
let archivoTexto = '';

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
  const base = filtros();
  if (!base.municipioId) {
    toast('Elige un municipio para consultar sus vialidades', 'err');
    return null;
  }
  datos = await vialidadesService.listar(base);
  vista.renderMunicipios(store.estado.municipios || [], base.municipioId);
  vista.renderLista(datos, {
    municipios: store.estado.municipios || [],
    tipos: datos.tipos || [],
    fuentes: datos.fuentes || []
  });
  return datos;
}

function limpiarArchivo() {
  archivoTexto = '';
  const input = $('vialidadesArchivo');
  if (input) input.value = '';
  const nota = $('vialidadesArchivoNota');
  if (nota) nota.textContent = 'Sin archivo seleccionado.';
}

function abrirEditor(via = null) {
  vista.prepararModal(via, {
    municipios: store.estado.municipios || [],
    municipioActivo: municipioActivo(),
    tipos: datos?.tipos || [],
    fuentes: datos?.fuentes || []
  });
  abrirModal('modalVialidad', { nested: true });
}

export function registrar() {
  registrarAcciones({
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
      intentar(async () => {
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
        await cargar();
        await recargarVialidades().catch(() => {});
      }),
    'vialidades:verificar': ({ id }) =>
      intentar(async () => {
        await vialidadesService.verificar(id);
        toast('Vialidad marcada como verificada', 'ok');
        await cargar();
      }),
    'vialidades:eliminar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Archivar esta vialidad? Dejará de aparecer en la capa del mapa.'))) {
          return;
        }
        await vialidadesService.eliminar(id);
        toast('Vialidad archivada', 'ok');
        await cargar();
      }),
    'vialidades:archivo': ({ elemento }) => {
      const archivo = elemento?.files?.[0];
      archivoTexto = '';
      const nota = $('vialidadesArchivoNota');
      if (!archivo) {
        if (nota) nota.textContent = 'Sin archivo seleccionado.';
        return;
      }
      const lector = new FileReader();
      lector.onload = () => {
        archivoTexto = String(lector.result || '');
        if (nota) nota.textContent = `${archivo.name} · ${Math.round(archivo.size / 1024)} KB`;
      };
      lector.onerror = () => toast('No se pudo leer el archivo', 'err');
      lector.readAsText(archivo);
    },
    'vialidades:importar': () =>
      intentar(async () => {
        const municipioId = $('vialidadesMunicipioFiltro')?.value || municipioActivo();
        if (!municipioId) return toast('Elige un municipio para importar', 'err');
        if (!archivoTexto) return toast('Selecciona un archivo KML o GeoJSON', 'err');
        const reemplazar = $('vialidadesReemplazar')?.checked === true;
        const mensaje = reemplazar
          ? 'Se reemplazará todo el trazado del municipio. ¿Continuar?'
          : 'Se fusionará la red importada con la existente. ¿Continuar?';
        if (!(await preguntar(mensaje))) return;
        loading(true, 'Importando vialidades…');
        try {
          const fuente = $('vialidadesImportarFuente')?.value || 'google_maps';
          const resultado = await vialidadesService.importar({
            municipioId,
            fuente,
            reemplazar,
            contenido: archivoTexto
          });
          toast(
            `${resultado.total} vialidad(es): ${resultado.creadas} nueva(s), ${resultado.actualizadas} actualizada(s)`,
            'ok'
          );
          limpiarArchivo();
          await cargar();
          await recargarVialidades().catch(() => {});
        } finally {
          loading(false);
        }
      }),
    'vialidades:importarOsm': () =>
      intentar(async () => {
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
          await cargar();
          await recargarVialidades().catch(() => {});
        } finally {
          loading(false);
        }
      }),
    'vialidades:verMapa': () =>
      intentar(async () => {
        cerrarModal('modalAdmin');
        const boton = $('btnVialidades');
        if (boton?.getAttribute('aria-pressed') !== 'true') boton?.click();
        else await recargarVialidades();
      })
  });
}
