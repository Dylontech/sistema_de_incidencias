/** Vista del estudio de publicidad para redes (biblioteca, lienzo, Canva y listado). */
import { $, esc, fmtFecha, aplicarEstilosDinamicos } from '../core/utils.js';
import {
  BIBLIOTECA,
  CATEGORIAS,
  DISENOS,
  FORMATOS,
  FUENTES,
  PALETAS
} from '../data/plantillas-publicidad.js';
import {
  aplicarTokens,
  construirSvg,
  dimensiones,
  svgADataUri,
  textoKitMarca,
  colorValido
} from './diseno-publicidad.js';

/** Pinta los círculos de color por CSSOM (la CSP no admite estilos en línea). */
function pintarMuestras(raiz) {
  raiz?.querySelectorAll('[data-muestra]').forEach((el) => {
    el.style.backgroundColor = el.dataset.muestra;
  });
}

export function renderCatalogo(redes = [], plantillas = [], estructuras = []) {
  const llenar = (id, lista, texto) => {
    const selector = $(id);
    if (!selector) return;
    const actual = selector.value;
    selector.innerHTML = lista.map(texto).join('');
    if ([...selector.options].some((o) => o.value === actual)) selector.value = actual;
  };
  llenar(
    'publicidadRed',
    redes,
    (r) => `<option value="${esc(r.clave)}">${esc(r.nombre)} · ${r.limite} car.</option>`
  );
  llenar(
    'publicidadPlantilla',
    plantillas,
    (p) => `<option value="${esc(p.clave)}">${esc(p.nombre)}</option>`
  );
  llenar(
    'publicidadEstructura',
    estructuras,
    (e) => `<option value="${esc(e.clave)}">${esc(e.nombre)} · ${esc(e.descripcion || '')}</option>`
  );
}

/** Selectores de formato, diseño y tipografía + paletas rápidas. */
export function renderEstudio() {
  const llenar = (id, lista, texto) => {
    const selector = $(id);
    if (!selector) return;
    const actual = selector.value;
    selector.innerHTML = lista.map(texto).join('');
    if ([...selector.options].some((o) => o.value === actual)) selector.value = actual;
  };
  llenar(
    'publicidadFormato',
    Object.values(FORMATOS),
    (f) => `<option value="${esc(f.clave)}">${esc(f.nombre)} · ${f.w}×${f.h}</option>`
  );
  llenar(
    'publicidadDiseno',
    DISENOS,
    (d) => `<option value="${esc(d.clave)}">${esc(d.nombre)}</option>`
  );
  llenar(
    'publicidadFuente',
    Object.values(FUENTES),
    (f) => `<option value="${esc(f.clave)}">${esc(f.nombre)}</option>`
  );
  const paletas = $('publicidadPaletas');
  if (paletas) {
    paletas.innerHTML = PALETAS.map(
      (p) => `<button type="button" class="pe-paleta" data-action="publicidad:paleta" data-valor="${esc(p.clave)}" title="${esc(p.nombre)}">
        <span class="pe-muestra" data-muestra="${esc(p.primario)}"></span><span class="pe-muestra" data-muestra="${esc(p.secundario)}"></span>${esc(p.nombre)}
      </button>`
    ).join('');
    pintarMuestras(paletas);
  }
}

export function renderCategorias(activa = 'todas') {
  const caja = $('publicidadCategorias');
  if (!caja) return;
  caja.innerHTML = CATEGORIAS.map(
    (c) =>
      `<button type="button" class="pe-chip${c.clave === activa ? ' activo' : ''}" data-action="publicidad:filtroBiblioteca" data-valor="${esc(c.clave)}">${esc(c.nombre)}</button>`
  ).join('');
}

/** Plantillas guardadas en este dispositivo desde el estudio. */
export function plantillasPropias() {
  try {
    return JSON.parse(localStorage.getItem('inc_publicidad_plantillas_v1') || '[]')
      .filter((p) => p?.clave && p?.datos)
      .map((p) => ({ ...p.datos, clave: p.clave, nombre: p.nombre, categoria: 'mias', propia: true }));
  } catch {
    return [];
  }
}

/** Galería de plantillas con miniatura real de cada diseño. */
export function renderBiblioteca({ categoria = 'todas', municipio = '' } = {}) {
  const caja = $('publicidadBiblioteca');
  if (!caja) return;
  const lista = [...BIBLIOTECA, ...plantillasPropias()].filter(
    (t) => categoria === 'todas' || t.categoria === categoria
  );
  caja.innerHTML = lista
    .map((t) => {
      const paleta = PALETAS.find((p) => p.clave === t.paleta) || PALETAS[0];
      const svg = construirSvg({
        titulo: aplicarTokens(t.titulo, municipio),
        cuerpo: aplicarTokens(t.cuerpo || t.texto, municipio),
        cta: t.cta,
        kicker: aplicarTokens(t.kicker, municipio),
        enlace: window.location.origin,
        colorPrimario: t.colorPrimario || paleta.primario,
        colorSecundario: t.colorSecundario || paleta.secundario,
        formato: t.formato || 'cuadrado',
        diseno: t.diseno || 'banda',
        fuente: t.fuente || 'sans',
        mostrarQr: t.mostrarQr !== false,
        qrConfig: t.qrConfig,
        imagenUrl: t.imagenUrl || '',
        qrMarcador: true
      });
      const f = FORMATOS[t.formato] || FORMATOS.cuadrado;
      return `<article class="pe-card">
        <div class="pe-card-img"><img src="${esc(svgADataUri(svg))}" alt="Vista previa de la plantilla ${esc(t.nombre)}" loading="lazy"></div>
        <div class="pe-card-cuerpo">
          <strong>${esc(t.nombre)}</strong>
          <span class="pe-card-meta">${esc(f.nombre)} · ${f.w}×${f.h}</span>
          <button type="button" class="btn btn-outline btn-sm" data-action="publicidad:usarPlantilla" data-valor="${esc(t.clave)}"><i class="bi bi-magic"></i> Usar plantilla</button>
        </div>
      </article>`;
    })
    .join('');
}

/** Actualiza la imagen del lienzo y el texto de medidas. */
export function renderLienzo(svg, pieza) {
  const caja = $('publicidadLienzo');
  if (!caja) return;
  const d = dimensiones(pieza.formato, pieza);
  const uri = svgADataUri(svg);
  let img = caja.querySelector('img');
  if (!img) {
    caja.innerHTML = '<img alt="Vista previa del diseño">';
    img = caja.querySelector('img');
  }
  img.src = uri;
  const info = $('publicidadLienzoInfo');
  if (info) info.textContent = `${d.nombre} · ${d.w} × ${d.h} px · ${d.detalle}`;
}

export function renderAvisos(mensajes = []) {
  const caja = $('publicidadAvisos');
  if (caja) caja.textContent = mensajes.join(' ');
}

export function renderContadores({ titulo = 0, texto = 0 } = {}) {
  const poner = (id, valor, max) => {
    const el = $(id);
    if (!el) return;
    el.textContent = `${valor}/${max}`;
    el.classList.toggle('excede', valor > max);
  };
  poner('publicidadContTitulo', titulo, 160);
  poner('publicidadContTexto', texto, 1800);
}

/** Datos listos para copiar a Canva: tamaño, colores y tipografías. */
export function renderCanvaInfo(pieza) {
  const caja = $('publicidadCanvaInfo');
  if (!caja) return;
  const d = dimensiones(pieza.formato, pieza);
  const fu = FUENTES[pieza.fuente] || FUENTES.sans;
  const P = colorValido(pieza.colorPrimario, '#006657');
  const S = colorValido(pieza.colorSecundario, '#0f3d3a');
  const item = (hex, nombre) =>
    `<span class="pe-marca-item"><span class="pe-muestra" data-muestra="${esc(hex)}"></span>${esc(nombre)} <code>${esc(hex.toUpperCase())}</code></span>`;
  caja.innerHTML = `
    <p><strong>Tamaño personalizado en Canva:</strong> ${d.w} × ${d.h} px</p>
    <div class="pe-marca">${item(P, 'Principal')}${item(S, 'Secundario')}</div>
    <p><strong>Tipografías:</strong> ${esc(fu.canva)}</p>
    <textarea id="publicidadKitMarca" class="u-oculto" tabindex="-1" aria-hidden="true">${esc(textoKitMarca(pieza))}</textarea>`;
  pintarMuestras(caja);
}

/** Resumen de escaneos QR; los municipios se resuelven con el catálogo local. */
export function renderEstadisticasQr(datos = {}, { municipios = [] } = {}) {
  const caja = $('publicidadQrStats');
  if (!caja) return;
  const nombreMunicipio = (id) =>
    municipios.find((m) => String(m.id) === String(id))?.nombre || id || 'Sin municipio';
  const kpis = `
    <div class="monitoreo-kpis u-mb-12">
      <div class="monitoreo-kpi"><span class="monitoreo-kpi-num">${Number(datos.total) || 0}</span><span class="monitoreo-kpi-label">Escaneos</span></div>
      <div class="monitoreo-kpi"><span class="monitoreo-kpi-num">${Number(datos.unicos) || 0}</span><span class="monitoreo-kpi-label">Sesiones únicas</span></div>
      <div class="monitoreo-kpi"><span class="monitoreo-kpi-num">${Number(datos.ubicacionResuelta) || 0}</span><span class="monitoreo-kpi-label">Con ubicación</span></div>
    </div>`;
  const dias = (datos.porDia || [])
    .slice(-14)
    .map((fila) => `<tr><td>${esc(fila.dia)}</td><td>${Number(fila.total) || 0}</td></tr>`)
    .join('');
  const municipiosTabla = (datos.porMunicipio || [])
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)
    .map(
      (fila) =>
        `<tr><td>${esc(nombreMunicipio(fila.municipioId))}</td><td>${Number(fila.total) || 0}</td></tr>`
    )
    .join('');
  caja.innerHTML = `${kpis}
    <div class="filter-row">
      <div class="panel-blanco"><h5>Por día</h5><table class="tabla-simple"><thead><tr><th>Día</th><th>Escaneos</th></tr></thead><tbody>${dias || '<tr><td colspan="2">Sin datos</td></tr>'}</tbody></table></div>
      <div class="panel-blanco"><h5>Por municipio</h5><table class="tabla-simple"><thead><tr><th>Municipio</th><th>Escaneos</th></tr></thead><tbody>${municipiosTabla || '<tr><td colspan="2">Sin datos</td></tr>'}</tbody></table></div>
    </div>`;
}

export function renderResultado(resultado = null) {
  const contenedor = $('publicidadPreview');
  if (!contenedor) return;
  if (!resultado) {
    contenedor.innerHTML =
      '<p class="campo-nota">Aquí aparece el texto final para pegar en la red, el QR y los enlaces de compartir. Pulsa «Vista previa sin guardar» o «Generar publicación».</p>';
    return;
  }
  const publicacion = resultado.publicacion || {};
  const compartir = resultado.compartir || {};
  const puedeDescargar = resultado.simulada !== true && Boolean(publicacion.id);
  const limites = { facebook: 2200, instagram: 2200, tiktok: 2200, whatsapp: 1000, x: 280 };
  const limite = resultado.limite || limites[publicacion.red] || 0;
  const caracteres = resultado.caracteres || 0;
  contenedor.innerHTML = `
    <div class="publicidad-preview" data-color-primario="${esc(publicacion.colorPrimario || '#006657')}">
      <div class="u-fila-sep publicidad-preview-cabecera" data-fondo="${esc(publicacion.colorPrimario || '#006657')}" data-texto="#ffffff">
        <strong>Texto final para ${esc(publicacion.red || 'la red')}</strong>
        <span class="inc-badge badge-verde">${esc(publicacion.red || '')}</span>
      </div>
      <div class="publicidad-preview-cuerpo">
        <pre class="publicidad-texto">${esc(resultado.texto || '')}</pre>
        <div class="campo-nota">${caracteres}${limite ? ` / ${limite}` : ''} caracteres · estructura: ${esc(publicacion.estructura || 'anuncio')}</div>
      </div>
      ${
        publicacion.qrUrl
          ? `<img class="publicidad-qr" src="${esc(publicacion.qrUrl)}" alt="Código QR de la publicación">`
          : ''
      }
      <div class="u-fila-sep publicidad-compartir">
        <a class="btn btn-outline btn-sm" href="${esc(compartir.facebook || '#')}" target="_blank" rel="noopener">Facebook</a>
        <a class="btn btn-outline btn-sm" href="${esc(compartir.x || '#')}" target="_blank" rel="noopener">X</a>
        <a class="btn btn-outline btn-sm" href="${esc(compartir.whatsapp || '#')}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn btn-outline btn-sm" href="${esc(compartir.telegram || '#')}" target="_blank" rel="noopener">Telegram</a>
      </div>
      <div class="u-fila-sep u-mt-8">
        <button class="btn btn-primary btn-sm" data-action="publicidad:copiar" data-id="${esc(
          publicacion.id || ''
        )}"><i class="bi bi-clipboard"></i> Copiar texto</button>
        ${puedeDescargar ? `<button class="btn btn-outline btn-sm" data-action="publicidad:descargar" data-id="${esc(
          publicacion.id
        )}"><i class="bi bi-download"></i> Descargar SVG</button>` : ''}
      </div>
      <textarea id="publicidadTextoResultado" class="u-oculto">${esc(resultado.texto || '')}</textarea>
    </div>`;
  aplicarEstilosDinamicos(contenedor);
}

const CLASE_ESTADO = { lista: 'badge-verde', borrador: 'badge-amarillo', archivada: 'badge-vial' };

export function renderLista(publicaciones = [], { total = 0, pagina = 1, limite = 20 } = {}) {
  const contenedor = $('publicidadLista');
  if (!contenedor) return;
  if (!publicaciones.length) {
    contenedor.innerHTML =
      '<tr><td colspan="5" class="celda-vacia">No hay publicaciones guardadas.</td></tr>';
  } else {
    contenedor.innerHTML = publicaciones
      .map(
        (p) => `<tr>
          <td><strong>${esc(p.titulo)}</strong><div class="campo-nota">${esc(p.hashtags || '')}</div></td>
          <td>${esc(p.red)}</td>
          <td>${fmtFecha(p.creadoEn)}</td>
          <td><span class="inc-badge ${CLASE_ESTADO[p.estado] || 'badge-verde'}">${esc(p.estado)}</span></td>
          <td class="u-acciones-tabla">
            <button class="btn btn-outline btn-sm" data-action="publicidad:editar" data-id="${esc(
              p.id
            )}" aria-label="Editar publicación" title="Editar"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline btn-sm" data-action="publicidad:duplicar" data-id="${esc(
              p.id
            )}" aria-label="Duplicar como nueva" title="Duplicar como nueva"><i class="bi bi-copy"></i></button>
            <button class="btn btn-outline btn-sm" data-action="publicidad:descargar" data-id="${esc(
              p.id
            )}" aria-label="Descargar publicación" title="Descargar SVG"><i class="bi bi-download"></i></button>
            <button class="btn btn-danger btn-sm" data-action="publicidad:eliminar" data-id="${esc(
              p.id
            )}" aria-label="Eliminar publicación" title="Eliminar"><i class="bi bi-trash3"></i></button>
          </td>
        </tr>`
      )
      .join('');
  }
  const paginacion = $('publicidadPaginacion');
  if (paginacion) {
    const paginas = Math.max(Math.ceil(total / limite), 1);
    paginacion.innerHTML = `
      <button class="btn btn-outline btn-sm" data-action="publicidad:pagina" data-valor="${
        pagina - 1
      }" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
      <span class="campo-nota">Página ${pagina} de ${paginas} · ${total} publicaciones</span>
      <button class="btn btn-outline btn-sm" data-action="publicidad:pagina" data-valor="${
        pagina + 1
      }" ${pagina >= paginas ? 'disabled' : ''}>Siguiente →</button>`;
  }
}
