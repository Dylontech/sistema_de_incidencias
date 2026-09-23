/** Controlador de incidencias: reportar, editar, resolver, comentar y ver detalle. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, loading, preguntar, toast } from '../core/ui.js';
import { intentar, mensajeDeError } from '../core/errores.js';
import { debounce } from '../core/utils.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { zonaDePunto, dentroDelMunicipio, parsearCoordenadas } from '../core/geocerca.js';
import { incidenciasService } from '../services/incidencias.service.js';
import * as aplicacion from '../core/aplicacion.js';
import * as formView from '../views/incidenciaForm.view.js';
import * as detalleView from '../views/detalle.view.js';
import * as mapa from '../map/mapa.js';

const FORMULARIO_INICIAL = {
  editarId: null,
  ubicacion: null,
  zona: null,
  iconoSeleccionado: '',
  evidencia: [],
  evidenciaResolver: []
};

/** Recarga todo lo que puede haber cambiado tras una operación. */
async function refrescarDatos() {
  await aplicacion.recargarIncidencias();
  await aplicacion.recargarNotificaciones();
  if (sesion.esEmpleado()) await aplicacion.cargarEstadisticas();
}

/* --------------------------- formulario ---------------------------- */

async function abrirFormulario(id = null) {
  store.actualizarSeccion('formulario', { ...FORMULARIO_INICIAL }, 'formulario');
  const ejemplos = store.estado.catalogos.ejemplos || {};

  if (!id) {
    formView.prepararAlta();
    abrirModal('modalIncidencia');
    return;
  }

  const { incidencia } = await incidenciasService.obtener(id);
  formView.prepararEdicion(incidencia);
  formView.mostrarEjemplo(incidencia.tipoId, ejemplos);
  formView.renderEvidencia(incidencia.evidencia || []);
  store.actualizarSeccion(
    'formulario',
    {
      editarId: id,
      ubicacion: incidencia.lat != null ? { lat: incidencia.lat, lng: incidencia.lng } : null,
      zona: store.estado.zonas.find((z) => z.id === incidencia.zonaId) || null,
      evidencia: incidencia.evidencia || []
    },
    'formulario'
  );
  if (incidencia.lat != null) {
    formView.aplicarUbicacion({
      lat: incidencia.lat,
      lng: incidencia.lng,
      zona: store.estado.zonas.find((z) => z.id === incidencia.zonaId) || null
    });
  }
  abrirModal('modalIncidencia');
}

function cerrarFormulario() {
  cerrarModal('modalIncidencia');
  store.actualizarSeccion('formulario', { ...FORMULARIO_INICIAL }, 'formulario');
}

/** Valida la ubicación contra las zonas del municipio activo (feedback local). */
function aplicarUbicacion(lat, lng, { moverMapa = true } = {}) {
  const municipio = store.estado.municipioActivo;
  const dentro = dentroDelMunicipio(lat, lng, municipio);
  // La comunidad es opcional: las localidades del INEGI cubren las áreas
  // pobladas, no todo el término municipal.
  const zona = dentro ? zonaDePunto(lat, lng, store.estado.zonas) : null;

  store.actualizarSeccion(
    'formulario',
    { ubicacion: dentro ? { lat, lng } : null, zona: zona || null },
    'formulario'
  );
  formView.aplicarUbicacion({ lat, lng, zona, dentro });
  if (moverMapa) mapa.fijarVista(lat, lng, 16);
  if (!dentro) toast('Esa ubicación está fuera del municipio activo', 'err');
  return zona;
}

function mostrarEjemploDelTipo() {
  const seleccionado = store.estado.tipos.find((t) => t.id === document.getElementById('incTipo').value);
  formView.mostrarEjemplo(seleccionado?.id, store.estado.catalogos.ejemplos);
  if (seleccionado) formView.seleccionarIconoDeTipo('iconPicker', seleccionado.icono);
}

async function duracionDeVideo(archivo) {
  return new Promise((resolver, rechazar) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolver(video.duration);
    };
    video.onerror = () => rechazar(new Error('No se pudo leer el video'));
    video.src = URL.createObjectURL(archivo);
  });
}

/** Sube los archivos elegidos y guarda sus metadatos en el formulario. */
async function agregarEvidencia(archivos, destino) {
  if (!archivos?.length) return;
  const limites = store.estado.catalogos.limites || {};
  const validos = [];

  for (const archivo of Array.from(archivos)) {
    const esVideo = archivo.type.startsWith('video/');
    const limite = esVideo
      ? limites.maxVideoBytes ?? 1073741824
      : limites.maxFotoBytes ?? 104857600;

    if (archivo.size > limite) {
      toast(`"${archivo.name}" excede el límite de ${esVideo ? '1 GB' : '100 MB'}`, 'err');
      continue;
    }
    if (esVideo) {
      try {
        const duracion = await duracionDeVideo(archivo);
        if (duracion > (limites.maxVideoSegundos ?? 300)) {
          toast(`"${archivo.name}" dura ${Math.round(duracion)}s (máx. 5 min)`, 'err');
          continue;
        }
      } catch {
        toast(`No se pudo leer "${archivo.name}"`, 'err');
        continue;
      }
    }
    validos.push(archivo);
  }

  if (!validos.length) return;

  loading(true, 'Subiendo evidencia…');
  try {
    const metadatos = await incidenciasService.subirEvidencia(validos);
    const actual = store.estado.formulario[destino] || [];
    store.actualizarSeccion('formulario', { [destino]: [...actual, ...metadatos] }, 'formulario');
    if (destino === 'evidencia') {
      formView.renderEvidencia(store.estado.formulario.evidencia);
    } else {
      formView.renderEvidenciaResolver(store.estado.formulario.evidenciaResolver);
    }
    toast('Evidencia cargada correctamente', 'ok');
  } catch (error) {
    toast(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

async function guardarIncidencia() {
  const datos = formView.leerFormulario();
  const { editarId, ubicacion, zona, evidencia } = store.estado.formulario;

  if (!datos.tipoId) return toast('Selecciona el tipo de incidencia', 'err');
  if (!datos.titulo) return toast('Escribe un título breve', 'err');
  if (!datos.descripcion) return toast('Escribe una descripción', 'err');
  if (!ubicacion) {
    return toast('Selecciona una ubicación dentro del municipio activo', 'err');
  }

  const carga = {
    tipoId: datos.tipoId,
    titulo: datos.titulo,
    descripcion: datos.descripcion,
    indicaciones: datos.indicaciones,
    iconoCustom: datos.iconoCustom,
    lat: ubicacion.lat,
    lng: ubicacion.lng,
    // El municipio activo decide contra qué límite se valida la ubicación.
    municipioId: store.estado.municipioActivo?.id || null,
    evidencia
  };

  loading(true, editarId ? 'Guardando cambios…' : 'Enviando reporte…');
  try {
    if (editarId) {
      await incidenciasService.actualizar(editarId, carga);
      toast('Incidencia actualizada', 'ok');
    } else {
      await incidenciasService.crear(carga);
      toast('Reporte enviado correctamente', 'ok');
    }
    cerrarFormulario();
    await refrescarDatos();
  } catch (error) {
    toast(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

/* ------------------------------ detalle ----------------------------- */

async function abrirDetalle(id) {
  const { incidencia } = await incidenciasService.obtener(id);
  detalleView.renderizar(incidencia, {
    tipos: store.estado.tipos,
    zonas: store.estado.zonas,
    usuario: store.estado.usuario
  });
  abrirModal('modalDetalle');
}

/** Abre el detalle desde el panel de administración (lo usa admin.controller). */
export function abrirDesdePanel(id) {
  return intentar(() => abrirDetalle(id));
}

export function registrar() {
  const leerFiltrosDelDom = () => ({
    texto: document.getElementById('filterText')?.value.trim() || '',
    estado: document.getElementById('filterEstado')?.value || 'todos',
    tipo: document.getElementById('filterTipo')?.value || 'todos',
    color: document.getElementById('filterColor')?.value || 'todos',
    zona: document.getElementById('filterZona')?.value || 'todos',
    orden: document.getElementById('filterOrden')?.value || 'reciente'
  });

  // El buscador de texto espera a que el usuario deje de escribir.
  const refrescarConRetraso = debounce(
    () => intentar(() => aplicacion.recargarIncidencias()),
    300
  );

  registrarAcciones({
    /* --------------------------- listado --------------------------- */
    'lista:filtrar': ({ evento }) => {
      store.actualizar({ filtros: leerFiltrosDelDom() }, 'filtros');
      if (evento?.type === 'input') refrescarConRetraso();
      else intentar(() => aplicacion.recargarIncidencias());
    },

    /* ---------------------------- mapa ----------------------------- */
    'mapa:centrarMunicipio': () => {
      const municipio = store.estado.municipioActivo;
      if (municipio) mapa.centrarMunicipio(municipio);
    },

    'mapa:centrarUsuario': () =>
      intentar(async () => {
        toast('Obteniendo tu ubicación…', 'info');
        await mapa.centrarEnUsuario();
        toast('Ubicación centrada', 'ok');
      }),

    'mapa:zonas': () => {
      const visibles = mapa.alternarZonas();
      toast(visibles ? 'Zonas visibles' : 'Zonas ocultas', 'info');
    },

    /* ----------------------- formulario ---------------------------- */
    'incidencias:reportar': () => abrirFormulario(null),

    'incidencias:editar': ({ id }) => intentar(() => abrirFormulario(id)),

    'incidencias:cerrar': () => cerrarFormulario(),

    'modal:cerrar': ({ valor }) => cerrarModal(valor),

    'incidencias:cambioTipo': () => mostrarEjemploDelTipo(),

    'incidencias:usarEjemplo': () => {
      const tipoId = document.getElementById('incTipo').value;
      const aplicado = formView.usarEjemplo(tipoId, store.estado.catalogos.ejemplos || {});
      if (aplicado) toast('Ejemplo aplicado, ajústalo a tu caso real', 'ok');
    },

    'incidencias:miUbicacion': () => {
      if (!navigator.geolocation) {
        formView.mostrarLocStatus('Geolocalización no soportada por el navegador', 'error');
        return;
      }
      formView.mostrarLocStatus('Obteniendo ubicación…', 'loading');
      navigator.geolocation.getCurrentPosition(
        (posicion) => {
          aplicarUbicacion(posicion.coords.latitude, posicion.coords.longitude);
          formView.mostrarLocStatus(
            `Ubicación obtenida (±${Math.round(posicion.coords.accuracy)} m)`,
            'ok'
          );
        },
        (error) => formView.mostrarLocStatus(`No se pudo obtener la ubicación: ${error.message}`, 'error'),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    },

    'incidencias:elegirMapa': () => {
      document.getElementById('modalIncidencia')?.classList.remove('show');
      mapa.activarModoElegir((lat, lng) => {
        aplicarUbicacion(lat, lng);
        abrirModal('modalIncidencia');
      });
      toast('Haz clic en el mapa para elegir la ubicación', 'info');
    },

    'incidencias:coords': () => {
      const coordenadas = parsearCoordenadas(formView.textoCoordenadas());
      if (!coordenadas) {
        toast('Formato de coordenadas no reconocido', 'err');
        return;
      }
      // Si la ubicación cae fuera de las zonas, aplicarUbicacion ya avisa del error.
      if (aplicarUbicacion(coordenadas.lat, coordenadas.lng)) {
        toast('Coordenadas aplicadas', 'ok');
      }
    },

    'incidencias:elegirArchivos': () => formView.entradaEvidencia()?.click(),
    'incidencias:elegirArchivosResolucion': () => formView.entradaEvidenciaResolver()?.click(),

    'incidencias:archivos': ({ elemento }) => {
      agregarEvidencia(elemento.files, 'evidencia');
      elemento.value = '';
    },

    'incidencias:archivosResolucion': ({ elemento }) => {
      agregarEvidencia(elemento.files, 'evidenciaResolver');
      elemento.value = '';
    },

    'incidencias:quitarEvidencia': ({ id }) => {
      const lista = store.estado.formulario.evidencia.slice();
      lista.splice(Number(id), 1);
      store.actualizarSeccion('formulario', { evidencia: lista }, 'formulario');
      formView.renderEvidencia(lista);
    },

    'incidencias:quitarEvidenciaResolver': ({ id }) => {
      const lista = store.estado.formulario.evidenciaResolver.slice();
      lista.splice(Number(id), 1);
      store.actualizarSeccion('formulario', { evidenciaResolver: lista }, 'formulario');
      formView.renderEvidenciaResolver(lista);
    },

    'incidencias:guardar': () => guardarIncidencia(),

    /* ---------------------------- detalle -------------------------- */
    'detalle:abrir': ({ id }) => intentar(() => abrirDetalle(id)),

    'detalle:cerrar': () => cerrarModal('modalDetalle'),

    'detalle:verMapa': ({ valor }) => {
      const [lat, lng] = String(valor).split(',').map(Number);
      mapa.fijarVista(lat, lng, 17);
      cerrarModal('modalDetalle');
    },

    'detalle:verImagen': ({ id }) => window.open(id, '_blank'),

    'detalle:comentar': ({ id }) =>
      intentar(async () => {
        const texto = detalleView.valorComentario();
        if (!texto) {
          toast('Escribe un comentario', 'err');
          return;
        }
        await incidenciasService.comentar(id, texto);
        await refrescarDatos();
        await abrirDetalle(id);
        toast('Comentario agregado', 'ok');
      }),

    'detalle:estado': ({ id, valor }) =>
      intentar(async () => {
        await incidenciasService.cambiarEstado(id, valor);
        await refrescarDatos();
        await abrirDetalle(id);
        toast('Estado actualizado', 'ok');
      }),

    'detalle:resolver': ({ id }) => {
      formView.abrirResolver(id);
      store.actualizarSeccion('formulario', { evidenciaResolver: [] }, 'formulario');
      // Anidado: se abre encima del detalle sin cerrarlo.
      abrirModal('modalResolver', { nested: true });
    },

    'incidencias:resolver': () =>
      intentar(async () => {
        const { id, texto } = formView.leerResolver();
        if (!texto) {
          toast('Describe la solución aplicada', 'err');
          return;
        }
        await incidenciasService.resolver(id, {
          solucion: texto,
          evidenciaSolucion: store.estado.formulario.evidenciaResolver
        });
        cerrarModal('modalResolver');
        store.actualizarSeccion('formulario', { evidenciaResolver: [] }, 'formulario');
        await refrescarDatos();
        await abrirDetalle(id);
        toast('Incidencia marcada como resuelta', 'ok');
      }),

    'detalle:eliminar': ({ id }) =>
      intentar(async () => {
        if (!preguntar('¿Eliminar esta incidencia? Esta acción no se puede deshacer.')) return;
        await incidenciasService.eliminar(id);
        cerrarModal('modalDetalle');
        await refrescarDatos();
        toast('Incidencia eliminada', 'ok');
      })
  });
}
