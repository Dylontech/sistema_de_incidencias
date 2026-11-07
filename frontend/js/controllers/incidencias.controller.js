/** Controlador de incidencias: reportar, editar, resolver, comentar y ver detalle. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, loading, modalAbierto, preguntar, toast } from '../core/ui.js';
import { intentar, mensajeDeError } from '../core/errores.js';
import { $, debounce, descargar, formatoBytes } from '../core/utils.js';
import { api } from '../core/api.js';
import { verAdjunto } from '../core/visor-adjunto.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { zonaDePunto, dentroDelMunicipio, parsearCoordenadas } from '../core/geocerca.js';
import * as camara from '../core/camara.js';
import * as offline from '../core/offline.js';
import { incidenciasService } from '../services/incidencias.service.js';
import { firmasService } from '../services/firmas.service.js';
import { catalogosService } from '../services/catalogos.service.js';
import { elegirVersionPdf } from './versionPdf.controller.js';
import * as aplicacion from '../core/aplicacion.js';
import * as formView from '../views/incidenciaForm.view.js';
import * as detalleView from '../views/detalle.view.js';
import * as mapa from '../map/mapa.js';
import * as vialidadesMapa from '../map/vialidades.js';
import * as mapaOffline from '../map/mapa-offline.js';

const FORMULARIO_INICIAL = {
  editarId: null,
  municipioId: null,
  municipio: null,
  zonas: [],
  ubicacion: null,
  zona: null,
  iconoSeleccionado: '',
  evidencia: [],
  evidenciaArchivos: [],
  evidenciaResolver: []
};

/** Descarga y pinta la red vial real del municipio activo. */
async function consultarCapaVialidades() {
  const municipio = store.estado.municipioActivo;
  if (!municipio) return null;
  if (!(store.estado.zonas || []).length) await aplicacion.cargarZonas(municipio.id);
  const datos = await incidenciasService.vialidades({ municipio: municipio.id });
  vialidadesMapa.dibujar(datos, store.estado.zonas || []);
  return datos;
}

/** Permite que el panel administrativo refresque el mapa tras importar. */
export async function recargarVialidades() {
  return consultarCapaVialidades();
}

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
    const activo = store.estado.municipioActivo;
    formView.prepararAlta(store.estado.usuario, store.estado.municipios || [], activo);
    abrirModal('modalIncidencia');
    // La geocerca y las zonas del municipio activo se cargan sin obligar a
    // elegir municipio: el punto se valida contra ese término municipal.
    if (activo?.id) {
      try {
        await cargarMunicipioFormulario(activo.id, { enfocar: false });
      } catch {
        toast('No se pudo cargar el municipio del reporte. Revisa tu conexión.', 'err');
      }
    }
    return;
  }

  const { incidencia } = await incidenciasService.obtener(id);
  formView.prepararEdicion(incidencia, store.estado.municipios || []);
  await cargarMunicipioFormulario(incidencia.municipioId, { enfocar: false });
  // La firma se elige al crear el reporte (el servidor la protege después).
  formView.renderFirma(store.estado.usuario, {
    anonima: incidencia.esAnonimo === true,
    bloqueado: true
  });
  formView.mostrarEjemplo(incidencia.tipoId, ejemplos);
  formView.renderAviso(store.estado.tipos.find((t) => t.id === incidencia.tipoId));
  formView.renderEvidencia(incidencia.evidencia || []);
  store.actualizarSeccion(
    'formulario',
    {
      editarId: id,
      ubicacion: incidencia.lat != null ? { lat: incidencia.lat, lng: incidencia.lng } : null,
      zona: (store.estado.formulario.zonas || []).find((z) => z.id === incidencia.zonaId) || null,
      evidencia: incidencia.evidencia || []
    },
    'formulario'
  );
  if (incidencia.lat != null) {
    formView.aplicarUbicacion({
      lat: incidencia.lat,
      lng: incidencia.lng,
      zona: (store.estado.formulario.zonas || []).find((z) => z.id === incidencia.zonaId) || null
    });
  }
  abrirModal('modalIncidencia');
}

function cerrarFormulario() {
  camara.cerrar();
  cerrarModal('modalIncidencia');
  store.actualizarSeccion('formulario', { ...FORMULARIO_INICIAL }, 'formulario');
  // El selector pudo mover el mapa a otro municipio: se restaura el activo.
  if (store.estado.municipioActivo) mapa.enfocarMunicipio(store.estado.municipioActivo);
  mapa.dibujarZonas(store.estado.zonas || []);
}

/** Valida la ubicación contra el municipio elegido en el formulario. */
function aplicarUbicacion(lat, lng, { moverMapa = true } = {}) {
  const { municipio, zonas } = store.estado.formulario;
  if (!municipio) {
    formView.mostrarLocStatus('Elige primero el municipio del reporte', 'error');
    toast('Elige el municipio antes de ubicar la incidencia', 'err');
    return null;
  }
  const dentroPoligono = dentroDelMunicipio(lat, lng, municipio);
  const vial = formView.ambitoVial();
  // La comunidad es opcional: las localidades del INEGI cubren las áreas
  // pobladas, no todo el término municipal.
  const zona = dentroPoligono ? zonaDePunto(lat, lng, zonas || []) : null;
  const dentro = dentroPoligono || vial;

  store.actualizarSeccion(
    'formulario',
    { ubicacion: dentro ? { lat, lng } : null, zona: zona || null },
    'formulario'
  );
  formView.aplicarUbicacion({
    lat,
    lng,
    zona,
    dentro,
    vial,
    fueraPoligono: vial && !dentroPoligono
  });
  if (moverMapa) mapa.fijarVista(lat, lng, 16);
  if (!dentro) toast('Esa ubicación está fuera del municipio seleccionado', 'err');
  return zona;
}

/**
 * Carga el municipio elegido en el formulario y ajusta el mapa.
 * Sin esto, la geocerca local seguiría usando el municipio activo de la barra.
 */
async function cargarMunicipioFormulario(municipioId, { enfocar = true } = {}) {
  if (!municipioId) {
    store.actualizarSeccion('formulario', { municipioId: null, municipio: null, zonas: [] }, 'formulario');
    mapa.dibujarZonas([]);
    return;
  }
  const [{ municipio }, { zonas }] = await Promise.all([
    catalogosService.municipio(municipioId),
    catalogosService.zonas(municipioId)
  ]);
  store.actualizarSeccion(
    'formulario',
    { municipioId, municipio, zonas },
    'formulario'
  );
  if (enfocar) {
    mapa.enfocarMunicipio(municipio);
    mapa.dibujarZonas(zonas);
  }
}

function mostrarEjemploDelTipo() {
  const seleccionado = store.estado.tipos.find((t) => t.id === document.getElementById('incTipo').value);
  formView.mostrarEjemplo(seleccionado?.id, store.estado.catalogos.ejemplos);
  formView.renderAviso(seleccionado);
  // El icono solo se elige en «Otro»: en los demás manda el del tipo.
  if (seleccionado) formView.renderIconoBox(seleccionado.id, seleccionado);
}

/** Sube los archivos elegidos y guarda sus metadatos en el formulario. */
async function agregarEvidencia(archivos, destino) {
  if (!archivos?.length) return;
  const limites = store.estado.catalogos.limites || {};
  const limite = limites.maxFotoBytes ?? 104857600;
  const validos = [];

  for (const archivo of Array.from(archivos)) {
    // La evidencia es solo de fotografías: el video se retiró del formulario
    // (los reportes antiguos que lo tengan se siguen mostrando).
    if (String(archivo.type).startsWith('video/')) {
      toast(`"${archivo.name}": la evidencia ahora es solo de fotografías`, 'err');
      continue;
    }
    if (archivo.size > limite) {
      toast(`"${archivo.name}" excede el límite de ${Math.round(limite / 1048576)} MB`, 'err');
      continue;
    }
    validos.push(archivo);
  }

  if (!validos.length) return;

  if (!navigator.onLine) {
    const actual = store.estado.formulario.evidenciaArchivos || [];
    store.actualizarSeccion(
      'formulario',
      { evidenciaArchivos: [...actual, ...validos] },
      'formulario'
    );
    toast('Sin conexión: las fotos se enviarán junto con el reporte.', 'info');
    return;
  }

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
  const municipioId = datos.municipioId || store.estado.formulario.municipioId;

  if (!municipioId) return toast('Elige el municipio del reporte', 'err');
  if (!datos.tipoId) return toast('Selecciona el tipo de incidencia', 'err');
  if (!datos.titulo) return toast('Escribe un título breve', 'err');
  if (!datos.descripcion) return toast('Escribe una descripción', 'err');
  if (datos.ambito !== 'urbano' && !datos.viaNombre) {
    return toast('Escribe el nombre de la carretera, autopista o camino', 'err');
  }
  if (!ubicacion) {
    return toast('Selecciona una ubicación dentro del municipio del reporte', 'err');
  }

  const carga = {
    tipoId: datos.tipoId,
    titulo: datos.titulo,
    descripcion: datos.descripcion,
    indicaciones: datos.indicaciones,
    iconoCustom: datos.iconoCustom,
    anonima: datos.anonima,
    lat: ubicacion.lat,
    lng: ubicacion.lng,
    // Municipio de la sesión, salvo que se haya marcado «otro municipio».
    municipioId,
    ambito: datos.ambito || 'urbano',
    jurisdiccion:
      datos.ambito === 'carretera_estatal' || datos.ambito === 'camino_rural'
        ? 'estatal'
        : datos.ambito === 'carretera_federal'
          ? 'federal'
          : datos.ambito === 'autopista'
            ? 'concesionada'
            : 'municipal',
    viaNombre: datos.viaNombre,
    viaClave: datos.viaClave,
    kilometro: datos.kilometro,
    sentido: datos.sentido,
    tramo: datos.tramo,
    dependencia: datos.dependencia,
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
    if (error?.estado === 0 && !editarId) {
      const fotos = store.estado.formulario.evidenciaArchivos || [];
      await offline.encolarReporte(carga, fotos);
      cerrarFormulario();
      toast('Sin conexión: el reporte quedó guardado y se enviará automáticamente.', 'ok');
      return;
    }
    toast(mensajeDeError(error), 'err');
  } finally {
    loading(false);
  }
}

/* ------------------------------ detalle ----------------------------- */

let temporizadorComentario = null;

/** Detiene la cuenta atrás de la espera entre comentarios. */
function detenerEsperaComentario() {
  if (temporizadorComentario) {
    clearInterval(temporizadorComentario);
    temporizadorComentario = null;
  }
}

/**
 * Inicia la cuenta atrás cuando el servidor indica que la espera anti-spam
 * sigue activa. Así el botón no sube una imagen que luego sería rechazada.
 */
function programarEsperaComentario(segundos, motivo = '') {
  detenerEsperaComentario();
  let restantes = Math.max(0, Math.ceil(Number(segundos) || 0));
  if (!restantes) {
    detalleView.actualizarEsperaComentario(0);
    return;
  }
  detalleView.actualizarEsperaComentario(restantes, motivo);
  temporizadorComentario = setInterval(() => {
    if (!modalAbierto('modalDetalle')) {
      detenerEsperaComentario();
      return;
    }
    restantes -= 1;
    if (restantes <= 0) {
      detenerEsperaComentario();
      detalleView.actualizarEsperaComentario(0);
      return;
    }
    detalleView.actualizarEsperaComentario(restantes);
  }, 1000);
}

/** Reinicia la espera según el estado que devolvió el detalle. */
function aplicarEstadoComentario(incidencia) {
  detenerEsperaComentario();
  const estado = incidencia?.permisos?.comentario;
  if (estado && estado.puede === false && estado.codigo === 'espera' && estado.esperaSegundos > 0) {
    programarEsperaComentario(estado.esperaSegundos, estado.motivo);
  }
}

async function abrirDetalle(id, { nested = false } = {}) {
  const { incidencia } = await incidenciasService.obtener(id);
  let firmas = null;
  try {
    ({ firmas } = await firmasService.resumen(id));
  } catch {
    firmas = null;
  }
  detalleView.renderizar(incidencia, {
    tipos: store.estado.tipos,
    zonas: store.estado.zonas,
    usuario: store.estado.usuario,
    firmas
  });
  aplicarEstadoComentario(incidencia);
  aplicacion.cerrarSidebar();
  abrirModal('modalDetalle', { nested });
}

/**
 * Abre el detalle desde el panel de administración o desde la cola de
 * moderación (lo usan admin.controller y moderacion.controller). Con `nested`
 * se muestra encima del panel en lugar de cerrarlo.
 */
export function abrirDesdePanel(id, opciones = {}) {
  return intentar(() => abrirDetalle(id, opciones));
}

/* ------------------------------ peligro ----------------------------- */

/** Incidencia a la que se le está pidiendo el motivo de peligro. */
let peligroPendiente = null;

/**
 * Abre el modal que pide el motivo con el que se marca una peligrosa.
 * Se usa un modal propio y no `window.prompt` porque los diálogos nativos no
 * están disponibles en todos los navegadores (ni en las vistas embebidas).
 */
export function abrirMotivoPeligro(id) {
  peligroPendiente = id;
  const campo = document.getElementById('peligroMotivo');
  if (campo) campo.value = '';
  abrirModal('modalPeligro', { nested: true });
}

/** Marca o desmarca el peligro y refresca todo lo que depende de la marca. */
export async function aplicarMarcaPeligro(id, { peligrosa, motivo = '' } = {}) {
  await incidenciasService.marcarPeligro(id, { peligrosa, motivo });
  await refrescarDatos();
  // Si el detalle está abierto se vuelve a pintar con la marca nueva.
  if (modalAbierto('modalDetalle')) await abrirDetalle(id);
  toast(
    peligrosa ? '⚠️ Incidencia marcada como peligrosa' : 'Se retiró la marca de peligro',
    'ok'
  );
}

/* ------------------------- mapa sin conexión ------------------------- */

/** Pinta el avance de la descarga de teselas. */
function pintarProgresoMapa({ estado, descargadas = 0, total = 0, bytes = 0 } = {}) {
  const barra = $('mapaOfflineProgreso');
  const texto = $('mapaOfflineEstado');
  const cancelar = $('mapaOfflineCancelar');
  const descargando = estado === 'descargando';
  const pct = total ? Math.round((descargadas / total) * 100) : 0;
  if (barra) {
    barra.classList.toggle('u-oculto', !descargando);
    barra.value = pct;
  }
  if (cancelar) cancelar.classList.toggle('u-oculto', !descargando);
  const fab = $('fabMapaOffline');
  if (fab) {
    fab.classList.toggle('descargando', descargando);
    const etiqueta = descargando
      ? `Descargando el mapa del municipio… ${pct} %`
      : 'Descargar el mapa del municipio para verlo sin conexión';
    fab.title = etiqueta;
    fab.setAttribute('aria-label', etiqueta);
  }
  if (texto && descargando) {
    texto.textContent = `Descargando ${descargadas}/${total} (${pct} %) · ${formatoBytes(bytes)}`;
  }
}

/**
 * Refresca el estado del mapa descargado del municipio activo. Se llama al
 * cambiar de municipio, al abrir el panel y al terminar una descarga.
 */
export async function actualizarEstadoMapaOffline() {
  const municipio = store.estado.municipioActivo;
  if (!municipio) return;
  const descargado = mapaOffline.mapaDescargado(municipio.id);
  const texto = $('mapaOfflineEstado');
  const borrar = $('mapaOfflineBorrar');
  const barra = $('mapaOfflineProgreso');
  const cuota = $('mapaOfflineCuota');
  const fab = $('fabMapaOffline');
  if (texto) texto.textContent = mapaOffline.describir(municipio.id);
  if (borrar) borrar.classList.toggle('u-oculto', !descargado);
  if (barra && !mapaOffline.enDescarga()) barra.classList.add('u-oculto');
  if (fab) {
    fab.classList.toggle('descargado', Boolean(descargado));
    fab.classList.remove('descargando');
    fab.title = 'Descargar el mapa del municipio para verlo sin conexión';
    fab.setAttribute('aria-label', fab.title);
  }
  if (cuota) {
    const uso = await mapaOffline.cuota();
    cuota.textContent = uso?.quota
      ? `Usado en este dispositivo: ${formatoBytes(uso.usage)} de ${formatoBytes(uso.quota)}.`
      : '';
  }
  if (descargado) mapaOffline.tocar(municipio.id);
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
        const coords = await mapa.obtenerUbicacion();
        // Si la persona está en otro municipio, primero se cambia el mapa:
        // los maxBounds del municipio activo impedirían ver su ubicación real.
        const { municipio } = await catalogosService.municipioEnUbicacion(
          coords.latitude,
          coords.longitude
        );
        if (!municipio) {
          toast('Tu ubicación no está dentro de los municipios disponibles', 'err');
          return;
        }
        if (municipio.id !== store.estado.municipioActivo?.id) {
          await aplicacion.cambiarMunicipio(municipio.id);
          toast(`Mapa cambiado a ${municipio.nombre}, ${municipio.estado}`, 'info');
        }
        mapa.fijarVista(coords.latitude, coords.longitude, 16);
        mapa.marcarUbicacionUsuario(coords);
        toast('Ubicación centrada', 'ok');
      }),

    'mapa:vialidades': () =>
      intentar(async () => {
        const municipio = store.estado.municipioActivo;
        if (!municipio) return toast('Elige un municipio primero', 'err');
        const { visible } = vialidadesMapa.alternar();
        const boton = $('btnVialidades');
        if (boton) boton.setAttribute('aria-pressed', String(visible));
        const texto = $('btnVialidadesTexto');
        if (texto) texto.textContent = visible ? 'Ocultar semáforo vial' : 'Mostrar semáforo vial';
        if (!visible) {
          toast('Capa de vialidades oculta', 'info');
          return;
        }
        loading(true, 'Calculando condición de vialidades…');
        try {
          await consultarCapaVialidades();
        } finally {
          loading(false);
        }
        toast('Semáforo vial visible', 'info');
      }),

    'mapa:zonas': () =>
      intentar(async () => {
        const activo = store.estado.municipioActivo;
        // Los polígonos de las localidades son pesados: se piden la primera vez
        // que se enciende la capa, no en el arranque.
        if (activo && !(store.estado.zonas || []).length) {
          loading(true, 'Cargando comunidades…');
          try {
            await aplicacion.cargarZonas(activo.id);
          } finally {
            loading(false);
          }
          toast('Zonas visibles', 'info');
          return;
        }
        const visibles = mapa.alternarZonas();
        toast(visibles ? 'Zonas visibles' : 'Zonas ocultas', 'info');
      }),

    /* ------------------- mapa del municipio sin conexión ------------------- */
    'mapa:offlineDescargar': () =>
      intentar(async () => {
        const municipio = store.estado.municipioActivo;
        if (!municipio) return toast('Elige un municipio primero', 'err');
        if (mapaOffline.enDescarga()) return toast('Ya hay una descarga en curso', 'info');
        const ya = mapaOffline.mapaDescargado(municipio.id);
        const estimado = ya ? ya.bytes : 0;
        if (
          !(await preguntar(
            ya
              ? `Ya tienes el mapa de ${municipio.nombre}. ¿Volver a descargarlo?`
              : `¿Descargar el mapa de ${municipio.nombre} para verlo sin conexión? Se guardará en este dispositivo (máximo 20 MB por municipio).`
          ))
        ) {
          return;
        }
        try {
          toast(`Descargando el mapa de ${municipio.nombre}. Puedes seguir usando la app.`, 'info');
          const resultado = await mapaOffline.descargarMunicipio(municipio, {
            alProgreso: pintarProgresoMapa
          });
          if (resultado) {
            toast(
              `Mapa de ${municipio.nombre} listo: ${resultado.teselas} teselas (${formatoBytes(resultado.bytes)})`,
              'ok'
            );
          }
        } finally {
          await actualizarEstadoMapaOffline();
        }
        if (estimado) mapaOffline.tocar(municipio.id);
      }),
    'mapa:offlineBorrar': () =>
      intentar(async () => {
        const municipio = store.estado.municipioActivo;
        if (!municipio) return;
        if (!(await preguntar(`¿Borrar el mapa de ${municipio.nombre} de este dispositivo?`))) {
          return;
        }
        await mapaOffline.borrarMunicipio(municipio.id);
        await actualizarEstadoMapaOffline();
        toast('Mapa borrado del dispositivo', 'info');
      }),
    'mapa:offlineCancelar': () => {
      mapaOffline.cancelar();
      toast('Descarga cancelada', 'info');
    },

    /* ----------------------- formulario ---------------------------- */
    'incidencias:reportar': () => abrirFormulario(null),

    /** Casilla «reportar como anónimo»: actualiza la nota de firma. */
    'incidencias:firma': () => formView.actualizarNotaFirma(store.estado.usuario),

    'incidencias:editar': ({ id }) => intentar(() => abrirFormulario(id)),

    'incidencias:cerrar': () => cerrarFormulario(),

    'modal:cerrar': ({ valor }) => cerrarModal(valor),

    'incidencias:cambioTipo': () => mostrarEjemploDelTipo(),

    /** Ámbito vial: muestra u oculta los datos de la carretera. */
    'incidencias:cambioAmbito': ({ valor }) => {
      formView.renderAmbito(valor);
      // Si cambia el ámbito, la ubicación previa puede dejar de ser válida.
      if (store.estado.formulario.ubicacion) {
        const { lat, lng } = store.estado.formulario.ubicacion;
        aplicarUbicacion(lat, lng, { moverMapa: false });
      }
    },

    /** Municipio del reporte: mueve el mapa y carga su geocerca y sus zonas. */
    'incidencias:cambioMunicipio': ({ valor }) =>
      intentar(async () => {
        loading(true, 'Cargando municipio…');
        try {
          await cargarMunicipioFormulario(valor);
          formView.actualizarResumenMunicipio(store.estado.formulario.municipio);
          // La ubicación previa puede haber quedado fuera: se limpia.
          store.actualizarSeccion('formulario', { ubicacion: null, zona: null }, 'formulario');
          formView.renderZonaBadge(null);
          formView.mostrarLocStatus('Municipio cargado. Elige el punto en el mapa.', 'ok');
        } finally {
          loading(false);
        }
      }),

    /**
     * El municipio de la sesión es el valor por omisión. La casilla solo se usa
     * cuando la incidencia ocurrió en otro municipio (viaje, avistamiento…).
     */
    'incidencias:otroMunicipio': ({ elemento }) =>
      intentar(async () => {
        const otro = elemento?.checked === true;
        document.getElementById('incMunicipioBox')?.classList.toggle('u-oculto', !otro);
        // Al cambiar de municipio, el punto anterior deja de ser válido.
        store.actualizarSeccion('formulario', { ubicacion: null, zona: null }, 'formulario');
        formView.renderZonaBadge(null);
        formView.mostrarLocStatus('Selecciona de nuevo la ubicación en el mapa.', 'ok');

        if (otro) {
          document.getElementById('incMunicipio')?.focus();
          return;
        }

        const municipio = store.estado.municipioActivo;
        const selector = document.getElementById('incMunicipio');
        if (selector && municipio) selector.value = municipio.id;
        formView.actualizarResumenMunicipio(municipio);
        if (municipio?.id) await cargarMunicipioFormulario(municipio.id, { enfocar: false });
      }),

    'incidencias:usarEjemplo': () => {
      const tipoId = document.getElementById('incTipo').value;
      const aplicado = formView.usarEjemplo(tipoId, store.estado.catalogos.ejemplos || {});
      if (aplicado) toast('Ejemplo aplicado, ajústalo a tu caso real', 'ok');
    },

    'incidencias:miUbicacion': () =>
      intentar(async () => {
        if (!navigator.geolocation) {
          formView.mostrarLocStatus('Geolocalización no soportada por el navegador', 'error');
          return;
        }
        formView.mostrarLocStatus('Obteniendo ubicación…', 'loading');
        const coords = await mapa.obtenerUbicacion();
        const { municipio } = await catalogosService.municipioEnUbicacion(
          coords.latitude,
          coords.longitude
        );
        if (!municipio) {
          formView.mostrarLocStatus(
            'Tu ubicación no está dentro de los municipios disponibles',
            'error'
          );
          return;
        }
        // El municipio del formulario manda para validar la geocerca: si la
        // persona está en otro municipio, se cambia también el formulario.
        if (municipio.id !== store.estado.formulario.municipioId) {
          const selector = document.getElementById('incMunicipio');
          if (selector) selector.value = municipio.id;
          await cargarMunicipioFormulario(municipio.id);
          formView.actualizarResumenMunicipio(municipio);
          toast(`Municipio del reporte: ${municipio.nombre}, ${municipio.estado}`, 'info');
        }
        aplicarUbicacion(coords.latitude, coords.longitude);
        mapa.marcarUbicacionUsuario(coords);
        formView.mostrarLocStatus(
          `Ubicación obtenida (±${Math.round(coords.accuracy)} m)`,
          'ok'
        );
      }),

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

    /* ----------------------------- cámara ------------------------------ */
    'incidencias:abrirCamara': () =>
      intentar(async () => {
        if (!camara.disponible()) {
          toast('Este navegador no permite usar la cámara; adjunta la foto como archivo.', 'err');
          return;
        }
        abrirModal('modalCamara', { nested: true });
        try {
          await camara.abrir();
        } catch {
          camara.cerrar();
          cerrarModal('modalCamara');
          toast('No se pudo abrir la cámara. Revisa el permiso del navegador.', 'err');
        }
      }),

    'incidencias:cerrarCamara': () => {
      camara.cerrar();
      cerrarModal('modalCamara');
    },

    'incidencias:capturarFoto': () =>
      intentar(async () => {
        const foto = await camara.capturar();
        camara.cerrar();
        cerrarModal('modalCamara');
        await agregarEvidencia([foto], 'evidencia');
      }),

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

    'detalle:cerrar': () => {
      detenerEsperaComentario();
      cerrarModal('modalDetalle');
    },

    'detalle:verMapa': ({ valor }) => {
      const [lat, lng] = String(valor).split(',').map(Number);
      mapa.fijarVista(lat, lng, 17);
      detenerEsperaComentario();
      cerrarModal('modalDetalle');
    },

    'detalle:verImagen': ({ id }) => window.open(id, '_blank'),

    /** PDF de la incidencia con historial, costo y documentos (personal). */
    'detalle:pdf': ({ id }) =>
      intentar(async () => {
        const motor = await elegirVersionPdf();
        if (!motor) return;
        const query = motor === 'auto' ? '' : `?pdf=${encodeURIComponent(motor)}`;
        const blob = await api.blob(`/incidencias/${encodeURIComponent(id)}/pdf${query}`);
        descargar(blob, `incidencia-${String(id).slice(0, 8)}.pdf`, 'application/pdf');
        toast('PDF descargado', 'ok');
      }),

    /** Actualiza la vista previa al elegir una imagen. */
    'detalle:archivoComentario': ({ elemento }) => {
      const archivo = elemento?.files?.[0] || null;
      if (!archivo) {
        detalleView.quitarAdjuntoComentario();
        return;
      }
      if (!detalleView.archivoComentarioValido(archivo)) {
        toast('Adjunta una imagen PNG, JPG, WEBP o GIF de hasta 5 MB', 'err');
        elemento.value = '';
        return;
      }
      detalleView.seleccionarAdjuntoComentario(archivo);
    },

    'detalle:quitarAdjunto': () => detalleView.quitarAdjuntoComentario(),

    /** Abre la imagen publicada en el visor interno del sistema. */
    'detalle:verAdjunto': ({ elemento }) =>
      verAdjunto({
        url: elemento?.dataset.url || '',
        tipo: elemento?.dataset.tipo || '',
        nombre: elemento?.dataset.nombre || 'Imagen adjunta'
      }),

    'detalle:comentar': ({ id }) =>
      intentar(async () => {
        const texto = detalleView.valorComentario();
        const archivo = detalleView.archivoComentario();
        if (!texto && !archivo) {
          toast('Escribe un comentario o adjunta una imagen', 'err');
          return;
        }
        if (!detalleView.puedeEnviarComentario()) {
          toast('No puedes comentar en este momento; revisa el aviso del formulario', 'err');
          return;
        }

        detalleView.marcarEnvioComentario(true);
        let adjuntoId = detalleView.adjuntoComentarioPendiente();
        try {
          // Si ya se subió en un intento anterior (por ejemplo, un 409), se
          // reutiliza el adjunto en lugar de subir la imagen otra vez.
          if (archivo && !adjuntoId) {
            const subida = await api.subir('/adjuntos/comentario', [archivo], {
              campo: 'archivo'
            });
            adjuntoId = subida.adjunto.id;
            detalleView.guardarAdjuntoComentarioPendiente(adjuntoId);
          }
          await incidenciasService.comentar(id, texto, adjuntoId ? [adjuntoId] : []);
        } catch (error) {
          detalleView.marcarEnvioComentario(false);
          if (error?.estado === 409) {
            const detalle = (error.detalles || []).find((d) => d?.campo === 'reintentarEn');
            programarEsperaComentario(Number(detalle?.mensaje) || 30, error.message);
            toast(error.message, 'err');
            return;
          }
          throw error;
        }

        detalleView.limpiarComentario();
        detalleView.marcarEnvioComentario(false);
        try {
          await refrescarDatos();
        } catch {
          // El detalle es lo importante: si falla la lista, el comentario ya
          // está publicado y se verá al recargar.
        }
        await abrirDetalle(id);
        toast('Comentario agregado', 'ok');
      }),

    'detalle:borrarComentario': ({ id, valor }) =>
      intentar(async () => {
        await incidenciasService.borrarComentario(id, valor);
        await abrirDetalle(id);
        toast('Comentario borrado', 'ok');
      }),

    /* ---------------------------- firmas --------------------------- */
    'firmas:firmar': ({ id }) =>
      intentar(async () => {
        await firmasService.firmar(id);
        await abrirDetalle(id);
        await refrescarDatos();
        toast('Firma registrada', 'ok');
      }),

    'firmas:retirar': ({ id }) =>
      intentar(async () => {
        await firmasService.retirar(id);
        await abrirDetalle(id);
        await refrescarDatos();
        toast('Firma retirada', 'ok');
      }),

    'firmas:meta': ({ id }) =>
      intentar(async () => {
        const meta = Number(document.getElementById('firmasMetaInput')?.value);
        if (!Number.isInteger(meta) || meta < 1) {
          toast('Escribe una meta válida', 'err');
          return;
        }
        await firmasService.fijarMeta(id, meta);
        await abrirDetalle(id);
        toast('Meta de firmas actualizada', 'ok');
      }),

    'firmas:solicitar': ({ id }) =>
      intentar(async () => {
        await firmasService.solicitarAdmin(id, 'Solicitud desde el detalle de la incidencia');
        toast('Solicitud enviada al administrador', 'ok');
      }),

    'firmas:exportar': ({ id, valor }) =>
      intentar(async () => {
        await firmasService.descargar(id, valor === 'pdf' ? 'pdf' : 'csv');
      }),

    'detalle:estado': ({ id, valor }) =>
      intentar(async () => {
        await incidenciasService.cambiarEstado(id, valor);
        await refrescarDatos();
        await abrirDetalle(id);
        toast('Estado actualizado', 'ok');
      }),

    /** Marca o desmarca el peligro desde el modal de detalle (solo personal). */
    'detalle:peligro': ({ id, valor }) =>
      intentar(async () => {
        if (valor === 'quitar') return aplicarMarcaPeligro(id, { peligrosa: false });
        abrirMotivoPeligro(id);
      }),

    /** Confirma la marca con el motivo escrito en el modal. */
    'peligro:confirmar': () =>
      intentar(async () => {
        const id = peligroPendiente;
        if (!id) {
          toast('No se seleccionó ninguna incidencia', 'err');
          return;
        }
        const motivo =
          (document.getElementById('peligroMotivo')?.value || '').trim().slice(0, 140) || '';
        peligroPendiente = null;
        cerrarModal('modalPeligro');
        await aplicarMarcaPeligro(id, { peligrosa: true, motivo });
      }),

    'detalle:resolver': ({ id }) => {
      formView.abrirResolver(id);
      store.actualizarSeccion('formulario', { evidenciaResolver: [] }, 'formulario');
      // Anidado: se abre encima del detalle sin cerrarlo.
      abrirModal('modalResolver', { nested: true });
    },

    'resolver:agregarConcepto': () => formView.agregarConceptoResolver(),
    'resolver:quitarConcepto': ({ elemento }) => formView.quitarConceptoResolver(elemento),
    'resolver:calcular': () => formView.actualizarTotalDesglose(),

    'incidencias:resolver': () =>
      intentar(async () => {
        const { id, texto, costo, desglose } = formView.leerResolver();
        if (!texto) {
          toast('Describe la solución aplicada', 'err');
          return;
        }
        await incidenciasService.resolver(id, {
          solucion: texto,
          costoReparacion: costo === '' ? null : Number(costo),
          desgloseCostos: desglose,
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
        if (!(await preguntar('¿Eliminar esta incidencia? Esta acción no se puede deshacer.'))) return;
        await incidenciasService.eliminar(id);
        cerrarModal('modalDetalle');
        await refrescarDatos();
        toast('Incidencia eliminada', 'ok');
      })
  });
}
