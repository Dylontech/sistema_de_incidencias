/**
 * Controlador del estudio de publicidad.
 *
 * Las acciones y llamadas al servidor que ya existían (generar, simular,
 * editar, guardar edición, eliminar, descargar, buscar, paginar) conservan su
 * comportamiento y sus endpoints. Lo nuevo es solo de interfaz: biblioteca de
 * plantillas, lienzo en vivo, exportación PNG/SVG y kit para Canva.
 */
import { registrarAcciones } from '../core/eventos.js';
import { loading, toast, preguntar } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { publicidadService } from '../services/publicidad.service.js';
import * as vista from '../views/publicidad.view.js';
import { BIBLIOTECA, PALETAS } from '../data/plantillas-publicidad.js';
import {
  aplicarTokens,
  construirSvg,
  csvCanva,
  descargarBlob,
  dimensiones,
  nombreArchivo,
  pendientesDe,
  svgAPng,
  textoKitMarca
} from '../views/diseno-publicidad.js';

const CLAVE_PREFS = 'inc_publicidad_estudio_v1';

let pagina = 1;
let ultimoResultado = null;
let publicaciones = [];
let catalogoServidor = { redes: [], plantillas: [], estructuras: [] };
let categoriaActiva = 'todas';
let qrActual = null;
let imagenUrl = null;
let estudioListo = false;
let temporizadorVivo = null;

/* --------------------------------- lectura --------------------------------- */

function valor(id) {
  return document.getElementById(id)?.value || '';
}

function marcado(id) {
  return Boolean(document.getElementById(id)?.checked);
}

function asignar(id, v) {
  const campo = document.getElementById(id);
  if (!campo) return;
  if (campo.type === 'checkbox') campo.checked = Boolean(v);
  else campo.value = v ?? '';
}

function leerFormulario() {
  return {
    red: valor('publicidadRed') || 'facebook',
    plantilla: valor('publicidadPlantilla') || 'reportar',
    estructura: valor('publicidadEstructura') || 'anuncio',
    municipioId: valor('publicidadMunicipio') || null,
    titulo: valor('publicidadTitulo'),
    texto: valor('publicidadTexto'),
    cta: valor('publicidadCta'),
    hashtags: valor('publicidadHashtags'),
    colorPrimario: valor('publicidadColorPrimario') || '#006657',
    colorSecundario: valor('publicidadColorSecundario') || '#0f3d3a',
    estado: valor('publicidadEstado') || 'lista',
    formato: valor('publicidadFormato') || 'cuadrado',
    ancho: Number(valor('publicidadAncho')) || null,
    alto: Number(valor('publicidadAlto')) || null,
    diseno: valor('publicidadDiseno') || 'banda',
    fuente: valor('publicidadFuente') || 'sans',
    kicker: valor('publicidadKicker'),
    pie: valor('publicidadPie'),
    mostrarQr: marcado('publicidadMostrarQr'),
    qrConfig: {
      tipo: 'sistema',
      contenido: valor('publicidadQrContenido'),
      tamano: Number(valor('publicidadQrTamano')) || 180,
      nivel: valor('publicidadQrNivel') || 'M',
      color: valor('publicidadQrColor') || '#0b1020',
      etiqueta: valor('publicidadQrEtiqueta') || 'Escanea y participa'
    },
    imagenUrl,
    enlace: `${window.location.origin}/`
  };
}

function nombreMunicipio() {
  const id = valor('publicidadMunicipio');
  const m = (store.estado.municipios || []).find((x) => String(x.id) === String(id));
  return m?.nombre || '';
}

/** La base del enlace la decide el servidor (`general.url_base`); el navegador solo la usa para el SVG local. */
function datosApi() {
  const { enlace, ...datos } = leerFormulario();
  return datos;
}

/** Pieza que se dibuja: lo escrito en el editor o, si falta, la plantilla base del servidor. */
function piezaActual({ marcador = true } = {}) {
  const f = leerFormulario();
  const base = (catalogoServidor.plantillas || []).find((p) => p.clave === f.plantilla) || {};
  const muni = nombreMunicipio();
  return {
    red: f.red,
    municipio: muni,
    titulo: aplicarTokens(f.titulo || base.titulo || '', muni),
    cuerpo: aplicarTokens(f.texto || base.texto || '', muni),
    cta: aplicarTokens(f.cta || base.cta || '', muni),
    hashtags: f.hashtags || base.hashtags || '',
    kicker: aplicarTokens(valor('publicidadKicker'), muni),
    pie: valor('publicidadPie'),
    enlace: f.enlace,
    colorPrimario: f.colorPrimario,
    colorSecundario: f.colorSecundario,
    formato: valor('publicidadFormato') || 'cuadrado',
    ancho: Number(valor('publicidadAncho')) || null,
    alto: Number(valor('publicidadAlto')) || null,
    diseno: valor('publicidadDiseno') || 'banda',
    fuente: valor('publicidadFuente') || 'sans',
    mostrarQr: marcado('publicidadMostrarQr'),
    qrConfig: f.qrConfig,
    imagenUrl: imagenUrl || '',
    qrUrl: qrActual,
    qrMarcador: marcador
  };
}

/* ------------------------------- preferencias ------------------------------- */

function guardarPrefs() {
  try {
    localStorage.setItem(
      CLAVE_PREFS,
      JSON.stringify({
        formato: valor('publicidadFormato'),
        diseno: valor('publicidadDiseno'),
        fuente: valor('publicidadFuente'),
        kicker: valor('publicidadKicker'),
        pie: valor('publicidadPie'),
        mostrarQr: marcado('publicidadMostrarQr')
      })
    );
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

function cargarPrefs() {
  let prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem(CLAVE_PREFS) || '{}') || {};
  } catch {
    prefs = {};
  }
  asignar('publicidadFormato', prefs.formato || 'cuadrado');
  asignar('publicidadDiseno', prefs.diseno || 'banda');
  asignar('publicidadFuente', prefs.fuente || 'sans');
  asignar('publicidadKicker', prefs.kicker ?? '');
  asignar('publicidadPie', prefs.pie ?? '');
  asignar('publicidadMostrarQr', prefs.mostrarQr !== false);
}

/* ---------------------------------- lienzo ---------------------------------- */

function pintarLienzo() {
  const pieza = piezaActual({ marcador: true });
  vista.renderLienzo(construirSvg(pieza), pieza);
  vista.renderCanvaInfo(pieza);
  vista.renderContadores({
    titulo: valor('publicidadTitulo').length,
    texto: valor('publicidadTexto').length
  });
  const avisos = [];
  if (pendientesDe(pieza.titulo, pieza.cuerpo, pieza.cta)) {
    avisos.push('Quedan textos entre [corchetes] por completar antes de publicar.');
  }
  if (pieza.mostrarQr && !qrActual) {
    avisos.push('El QR real aparece al usar «Vista previa sin guardar» o al exportar.');
  }
  vista.renderAvisos(avisos);
}

function pintarLienzoPronto() {
  clearTimeout(temporizadorVivo);
  temporizadorVivo = setTimeout(pintarLienzo, 120);
}

/** Pide un QR actualizado (vista previa sin guardar) antes de exportar. */
async function asegurarQr() {
  if (!marcado('publicidadMostrarQr')) return true;
  try {
    const resultado = await publicidadService.simular(datosApi());
    qrActual = resultado?.publicacion?.qrUrl || null;
  } catch {
    qrActual = null;
  }
  if (!qrActual) {
    toast('No se pudo generar el QR; la imagen se exporta sin él', 'err');
    return false;
  }
  return true;
}

async function piezaParaExportar() {
  await asegurarQr();
  return piezaActual({ marcador: false });
}

/* ------------------------------ formulario base ----------------------------- */

function llenarFormulario(publicacion = null) {
  const p = publicacion || {};
  asignar('publicidadId', p.id || '');
  asignar('publicidadRed', p.red || 'facebook');
  asignar('publicidadPlantilla', p.plantilla || 'reportar');
  asignar('publicidadEstructura', p.estructura || 'anuncio');
  asignar('publicidadMunicipio', p.municipioId || store.estado.municipioActivo?.id || '');
  asignar('publicidadTitulo', p.titulo || '');
  asignar('publicidadTexto', p.cuerpo || p.texto || '');
  asignar('publicidadCta', p.cta || '');
  asignar('publicidadHashtags', p.hashtags || '');
  asignar('publicidadColorPrimario', p.colorPrimario || '#006657');
  asignar('publicidadColorSecundario', p.colorSecundario || '#0f3d3a');
  asignar('publicidadEstado', p.estado || 'lista');
  asignar('publicidadFormato', p.formato || 'cuadrado');
  asignar('publicidadAncho', p.ancho || 1080);
  asignar('publicidadAlto', p.alto || 1080);
  asignar('publicidadDiseno', p.diseno || 'banda');
  asignar('publicidadFuente', p.fuente || 'sans');
  asignar('publicidadKicker', p.kicker || '');
  asignar('publicidadPie', p.pie || '');
  asignar('publicidadMostrarQr', p.mostrarQr !== false);
  asignar('publicidadQrContenido', p.qrConfig?.contenido || '');
  asignar('publicidadQrTamano', p.qrConfig?.tamano || 180);
  asignar('publicidadQrNivel', p.qrConfig?.nivel || 'M');
  asignar('publicidadQrColor', p.qrConfig?.color || '#0b1020');
  asignar('publicidadQrEtiqueta', p.qrConfig?.etiqueta || 'Escanea y participa');
  imagenUrl = p.imagenUrl || null;
  actualizarImagenPreview();

  const generar = document.getElementById('btnPublicidadGenerar');
  if (generar) {
    generar.disabled = Boolean(p.id);
    generar.title = p.id
      ? 'Estás editando una publicación; usa «Guardar cambios».'
      : 'Crea y guarda una publicación nueva';
  }
  if (estudioListo) pintarLienzo();
}

function actualizarImagenPreview() {
  const preview = document.getElementById('publicidadImagenPreview');
  const quitar = document.getElementById('publicidadQuitarImagen');
  if (preview) {
    preview.hidden = !imagenUrl;
    preview.classList.toggle('u-oculto', !imagenUrl);
    if (imagenUrl) preview.src = imagenUrl;
  }
  if (quitar) quitar.classList.toggle('u-oculto', !imagenUrl);
}

/** Convierte SVG de Canva a PNG en el navegador antes de subirlo. */
async function rasterizarSiEsSvg(archivo) {
  if (archivo.type !== 'image/svg+xml') return archivo;
  const texto = await archivo.text();
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`;
  const imagen = await new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = rechazar;
    img.src = uri;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(imagen.naturalWidth || 1600, 4096);
  canvas.height = Math.min(imagen.naturalHeight || 1600, 4096);
  canvas.getContext('2d').drawImage(imagen, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolver) => canvas.toBlob(resolver, 'image/png'));
  return new File([blob], 'canva.png', { type: 'image/png' });
}

/** URLs de compartir para una publicación ya guardada. */
function compartirDe(publicacion = {}) {
  const texto = publicacion.texto || '';
  const enlace = publicacion.enlace || `${window.location.origin}/`;
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(enlace)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(texto)}&url=${encodeURIComponent(enlace)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(texto)}%20${encodeURIComponent(enlace)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(enlace)}&text=${encodeURIComponent(texto)}`
  };
}

async function copiar(texto, mensaje) {
  if (!texto) {
    toast('No hay nada que copiar todavía', 'err');
    return;
  }
  await navigator.clipboard.writeText(texto);
  toast(mensaje, 'ok');
}

/* ---------------------------------- carga ---------------------------------- */

export async function cargar(destino = pagina) {
  pagina = Math.max(Number(destino) || 1, 1);
  const texto = document.getElementById('publicidadTextoBuscar')?.value || '';
  const selector = document.getElementById('publicidadMunicipio');
  if (selector && selector.dataset.cargado !== 'si') {
    selector.innerHTML = (store.estado.municipios || [])
      .map((m) => `<option value="${m.id}">${m.nombre} — ${m.estado}</option>`)
      .join('');
    selector.dataset.cargado = 'si';
    const activo = store.estado.municipioActivo?.id;
    if (activo && [...selector.options].some((o) => o.value === activo)) selector.value = activo;
  }
  const [catalogo, lista] = await Promise.all([
    publicidadService.catalogo(),
    publicidadService.listar({ texto, pagina, limite: 20 })
  ]);
  catalogoServidor = {
    redes: catalogo.redes || [],
    plantillas: catalogo.plantillas || [],
    estructuras: catalogo.estructuras || []
  };
  vista.renderCatalogo(catalogoServidor.redes, catalogoServidor.plantillas, catalogoServidor.estructuras);
  vista.renderEstudio();
  if (!estudioListo) {
    cargarPrefs();
    estudioListo = true;
  }
  vista.renderCategorias(categoriaActiva);
  vista.renderBiblioteca({ categoria: categoriaActiva, municipio: nombreMunicipio() });
  if (!document.getElementById('publicidadColorPrimario')?.value) {
    llenarFormulario(null);
  }
  publicaciones = lista.publicaciones || [];
  if (!ultimoResultado) vista.renderResultado(null);
  vista.renderLista(publicaciones, {
    total: lista.total || 0,
    pagina: lista.pagina || pagina,
    limite: lista.limite || 20
  });
  pintarLienzo();
}

function irA(seccion) {
  document.getElementById(`pub-${seccion}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function confirmarPendientes() {
  const pieza = piezaActual();
  if (!pendientesDe(pieza.titulo, pieza.cuerpo, pieza.cta)) return true;
  return preguntar('Hay textos entre [corchetes] sin completar. ¿Guardar de todos modos?');
}

/* --------------------------------- acciones -------------------------------- */

export function registrar() {
  registrarAcciones({
    'publicidad:cargar': () => intentar(() => cargar()),

    /* ---- flujo existente (sin cambios de contrato) ---- */

    'publicidad:generar': () =>
      intentar(async () => {
        if (!sesion.esAdmin()) {
          toast('Solo el administrador maestro puede generar publicaciones', 'err');
          return;
        }
        if (document.getElementById('publicidadId')?.value) {
          toast('Estás editando: usa «Guardar cambios» para no duplicar la publicación', 'err');
          return;
        }
        if (!(await confirmarPendientes())) return;
        const datos = datosApi();
        ultimoResultado = await publicidadService.generar(datos);
        qrActual = ultimoResultado.publicacion?.qrUrl || qrActual;
        llenarFormulario(ultimoResultado.publicacion);
        vista.renderResultado(ultimoResultado);
        toast('Publicación generada', 'ok');
        await cargar(1);
      }),

    'publicidad:simular': () =>
      intentar(async () => {
        if (!sesion.esAdmin()) {
          toast('Solo el administrador maestro puede previsualizar publicaciones', 'err');
          return;
        }
        const datos = datosApi();
        ultimoResultado = await publicidadService.simular(datos);
        qrActual = ultimoResultado.publicacion?.qrUrl || null;
        vista.renderResultado(ultimoResultado);
        pintarLienzo();
        toast('Vista previa lista: no se guardó la publicación', 'ok');
      }),

    'publicidad:copiar': () =>
      intentar(async () => {
        const texto =
          document.getElementById('publicidadTextoResultado')?.value ||
          ultimoResultado?.texto ||
          '';
        if (!texto) return;
        await navigator.clipboard.writeText(texto);
        toast('Texto copiado al portapapeles', 'ok');
      }),

    'publicidad:descargar': ({ id }) =>
      intentar(async () => {
        const publicacion = ultimoResultado?.publicacion;
        await publicidadService.descargar(
          id,
          publicacion?.id === id
            ? `publicacion-${publicacion.red || 'red'}.svg`
            : 'publicacion.svg'
        );
      }),

    'publicidad:eliminar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Eliminar esta publicación del listado?'))) return;
        await publicidadService.eliminar(id);
        toast('Publicación eliminada', 'ok');
        await cargar(1);
      }),

    'publicidad:editar': ({ id }) => {
      const publicacion = publicaciones.find((p) => p.id === id);
      if (!publicacion) return;
      ultimoResultado = null;
      qrActual = publicacion.qrUrl || null;
      llenarFormulario(publicacion);
      vista.renderResultado({
        publicacion,
        texto: publicacion.texto,
        caracteres: (publicacion.texto || '').length,
        limite: 0,
        compartir: compartirDe(publicacion)
      });
      irA('estudio');
      document.getElementById('publicidadTitulo')?.focus();
    },

    'publicidad:guardarEdicion': () =>
      intentar(async () => {
        const id = document.getElementById('publicidadId')?.value || '';
        if (!id) {
          toast('Primero elige una publicación de la lista o genera una nueva', 'err');
          return;
        }
        if (!(await confirmarPendientes())) return;
        const datos = datosApi();
        const resultado = await publicidadService.actualizar(id, datos);
        qrActual = resultado.publicacion?.qrUrl || qrActual;
        ultimoResultado = {
          publicacion: resultado.publicacion,
          texto: resultado.publicacion?.texto || '',
          caracteres: (resultado.publicacion?.texto || '').length,
          limite: 0,
          compartir: compartirDe(resultado.publicacion)
        };
        llenarFormulario(resultado.publicacion);
        vista.renderResultado(ultimoResultado);
        toast('Publicación actualizada', 'ok');
        await cargar(1);
      }),

    'publicidad:limpiarFormulario': () => {
      ultimoResultado = null;
      qrActual = null;
      llenarFormulario(null);
      vista.renderResultado(null);
    },

    'publicidad:buscar': () => intentar(() => cargar(1)),
    'publicidad:limpiar': () =>
      intentar(async () => {
        const campo = document.getElementById('publicidadTextoBuscar');
        if (campo) campo.value = '';
        await cargar(1);
      }),
    'publicidad:pagina': ({ valor: destino }) => intentar(() => cargar(destino)),
    'publicidad:municipio': () => {
      // El selector de municipio se llena con el catálogo ya cargado en la app.
      const selector = document.getElementById('publicidadMunicipio');
      if (selector && selector.dataset.cargado !== 'si') {
        selector.innerHTML = (store.estado.municipios || [])
          .map((m) => `<option value="${m.id}">${m.nombre} — ${m.estado}</option>`)
          .join('');
        selector.dataset.cargado = 'si';
      }
      qrActual = null;
      if (estudioListo) {
        vista.renderBiblioteca({ categoria: categoriaActiva, municipio: nombreMunicipio() });
        pintarLienzoPronto();
      }
    },

    /* ---- estudio: solo interfaz ---- */

    'publicidad:ir': ({ valor: seccion }) => irA(seccion),

    'publicidad:secciones': ({ valor }) => {
      const abrir = valor === 'expandir';
      document
        .querySelectorAll('#panel-publicidad .pe-seccion details.pe-detalle, #modalCampana details.pe-detalle')
        .forEach((detalle) => {
          detalle.open = abrir;
        });
      toast(abrir ? 'Secciones expandidas' : 'Secciones contraídas', 'ok');
    },

    'publicidad:vivo': () => {
      guardarPrefs();
      pintarLienzoPronto();
    },

    'publicidad:imagen': ({ evento }) =>
      intentar(async () => {
        const archivo = evento?.target?.files?.[0];
        if (!archivo) return;
        if (archivo.size > 8 * 1024 * 1024) {
          toast('La imagen supera 8 MB', 'err');
          return;
        }
        loading(true, 'Subiendo imagen…');
        try {
          const imagen = await rasterizarSiEsSvg(archivo);
          const respuesta = await publicidadService.subirImagen(imagen);
          imagenUrl = respuesta?.asset?.url || null;
          actualizarImagenPreview();
          pintarLienzo();
          toast('Imagen lista para la plantilla', 'ok');
        } finally {
          loading(false);
        }
      }),

    'publicidad:quitarImagen': () => {
      imagenUrl = null;
      actualizarImagenPreview();
      pintarLienzo();
    },

    'publicidad:exportarJson': () => {
      const datos = { ...leerFormulario(), imagenUrl, layout: null };
      descargarBlob(
        new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json;charset=utf-8' }),
        'plantilla-publicidad.json'
      );
    },

    'publicidad:importarJson': ({ evento }) =>
      intentar(async () => {
        const archivo = evento?.target?.files?.[0];
        if (!archivo) return;
        if (archivo.size > 2 * 1024 * 1024) return toast('El JSON es demasiado grande', 'err');
        const datos = JSON.parse(await archivo.text());
        llenarFormulario(datos);
        imagenUrl = datos.imagenUrl || null;
        actualizarImagenPreview();
        pintarLienzo();
        irA('estudio');
        toast('Diseño importado. Revisa la vista previa.', 'ok');
      }),

    'publicidad:guardarPlantilla': () => {
      const nombre = window.prompt('Nombre de la plantilla:', 'Mi plantilla');
      if (!nombre) return;
      const clave = `propia-${Date.now()}`;
      const plantilla = {
        clave,
        nombre: String(nombre).slice(0, 80),
        categoria: 'mias',
        datos: { ...leerFormulario(), imagenUrl }
      };
      const lista = JSON.parse(localStorage.getItem('inc_publicidad_plantillas_v1') || '[]');
      lista.push(plantilla);
      localStorage.setItem('inc_publicidad_plantillas_v1', JSON.stringify(lista));
      toast('Plantilla guardada en este dispositivo', 'ok');
    },

    'publicidad:filtroBiblioteca': ({ valor: categoria }) => {
      categoriaActiva = categoria || 'todas';
      vista.renderCategorias(categoriaActiva);
      vista.renderBiblioteca({ categoria: categoriaActiva, municipio: nombreMunicipio() });
    },

    'publicidad:usarPlantilla': ({ valor: clave }) => {
      const propia = vista.plantillasPropias().find((x) => x.clave === clave);
      if (propia) {
        const { clave: _clave, nombre: _nombre, categoria: _categoria, propia: _propia, ...datos } = propia;
        llenarFormulario(datos);
        ultimoResultado = null;
        qrActual = null;
        vista.renderResultado(null);
        guardarPrefs();
        pintarLienzo();
        irA('estudio');
        toast('Plantilla propia aplicada.', 'ok');
        return;
      }
      const t = BIBLIOTECA.find((x) => x.clave === clave);
      if (!t) return;
      const muni = nombreMunicipio();
      const paleta = PALETAS.find((p) => p.clave === t.paleta) || PALETAS[0];
      asignar('publicidadRed', t.red);
      asignar('publicidadPlantilla', t.base);
      asignar('publicidadEstructura', t.estructura);
      asignar('publicidadTitulo', aplicarTokens(t.titulo, muni));
      asignar('publicidadTexto', aplicarTokens(t.texto, muni));
      asignar('publicidadCta', t.cta);
      asignar('publicidadHashtags', aplicarTokens(t.hashtags, muni));
      asignar('publicidadColorPrimario', paleta.primario);
      asignar('publicidadColorSecundario', paleta.secundario);
      asignar('publicidadFormato', t.formato);
      asignar('publicidadDiseno', t.diseno);
      asignar('publicidadKicker', aplicarTokens(t.kicker, muni));
      ultimoResultado = null;
      qrActual = null;
      vista.renderResultado(null);
      guardarPrefs();
      pintarLienzo();
      irA('estudio');
      toast('Plantilla aplicada. Ajusta los textos y exporta o guarda.', 'ok');
    },

    'publicidad:paleta': ({ valor: clave }) => {
      const paleta = PALETAS.find((p) => p.clave === clave);
      if (!paleta) return;
      asignar('publicidadColorPrimario', paleta.primario);
      asignar('publicidadColorSecundario', paleta.secundario);
      qrActual = null;
      pintarLienzo();
    },

    'publicidad:duplicar': ({ id }) => {
      const publicacion = publicaciones.find((p) => p.id === id);
      if (!publicacion) return;
      ultimoResultado = null;
      qrActual = null;
      llenarFormulario({ ...publicacion, id: '', estado: 'borrador' });
      vista.renderResultado(null);
      irA('estudio');
      toast('Copia lista: edítala y pulsa «Generar publicación».', 'ok');
    },

    /* ---- exportación y Canva ---- */

    'publicidad:png': () =>
      intentar(async () => {
        const pieza = await piezaParaExportar();
        const d = dimensiones(pieza.formato);
        const blob = await svgAPng(construirSvg(pieza), d.w, d.h);
        descargarBlob(blob, nombreArchivo(pieza, 'png'));
        toast(`PNG ${d.w}×${d.h} descargado`, 'ok');
      }),

    'publicidad:svgDiseno': () =>
      intentar(async () => {
        const pieza = await piezaParaExportar();
        const blob = new Blob([construirSvg(pieza)], { type: 'image/svg+xml;charset=utf-8' });
        descargarBlob(blob, nombreArchivo(pieza, 'svg'));
        toast('SVG del diseño descargado', 'ok');
      }),

    'publicidad:estadisticasQr': () =>
      intentar(async () => {
        const datos = await publicidadService.estadisticas();
        vista.renderEstadisticasQr(datos, { municipios: store.estado.municipios || [] });
      }),

    'publicidad:csvCanva': ({ valor: alcance }) =>
      intentar(async () => {
        const origen = `${window.location.origin}/`;
        const muni = nombreMunicipio();
        let filas;
        let nombre;
        if (alcance === 'biblioteca') {
          filas = BIBLIOTECA.map((t) => ({
            red: t.red,
            kicker: aplicarTokens(t.kicker, muni),
            titulo: aplicarTokens(t.titulo, muni),
            texto: aplicarTokens(t.texto, muni),
            cta: t.cta,
            hashtags: aplicarTokens(t.hashtags, muni),
            enlace: origen,
            municipio: muni
          }));
          nombre = 'canva-biblioteca-publicidad.csv';
        } else {
          const p = piezaActual();
          filas = [
            {
              red: p.red,
              kicker: p.kicker,
              titulo: p.titulo,
              texto: p.cuerpo,
              cta: p.cta,
              hashtags: p.hashtags,
              enlace: p.enlace,
              municipio: muni
            }
          ];
          nombre = 'canva-publicacion-actual.csv';
        }
        descargarBlob(csvCanva(filas), nombre);
        toast('CSV listo para «Creación en masa» de Canva', 'ok');
      }),

    'publicidad:copiarCampo': ({ valor: campo }) =>
      intentar(async () => {
        const p = piezaActual();
        const mapa = {
          titulo: [p.titulo, 'Título copiado'],
          cuerpo: [p.cuerpo, 'Desarrollo copiado'],
          cta: [p.cta, 'Llamado a la acción copiado'],
          hashtags: [p.hashtags, 'Hashtags copiados'],
          enlace: [p.enlace, 'Enlace copiado'],
          kit: [textoKitMarca(p), 'Kit de marca copiado']
        };
        const [texto, mensaje] = mapa[campo] || ['', ''];
        await copiar(texto, mensaje);
      })
  });
}
