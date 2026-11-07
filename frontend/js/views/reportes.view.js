/**
 * Vista del modal de informes: tarjetas, tabla resumen, exportaciones y
 * generación del informe imprimible.
 */
import { $, esc, descargar, fmtFecha, textoAntiguedad, etiquetaEstado, hoyIso } from '../core/utils.js';
import { graficoBarrasSvg, graficoDonaSvg, graficoSerieSvg } from './graficos-svg.js';

export function renderStats(resumen) {
  const contenedor = $('reporteStats');
  if (!contenedor || !resumen) return;
  contenedor.innerHTML = `
    <div class="stat-card"><div class="stat-num">${resumen.total}</div><div class="stat-label">Total</div></div>
    <div class="stat-card verde"><div class="stat-num">${resumen.resueltas}</div><div class="stat-label">Resueltas</div></div>
    <div class="stat-card naranja"><div class="stat-num">${resumen.pendientes}</div><div class="stat-label">Pendientes</div></div>
    <div class="stat-card rojo"><div class="stat-num">${resumen.criticas}</div><div class="stat-label">Críticas</div></div>
    <div class="stat-card"><div class="stat-num">${resumen.tasaResolucion}%</div><div class="stat-label">Tasa resolución</div></div>
  `;
}

export function renderTabla(resumen) {
  const cuerpo = $('reporteTablaBody');
  if (!cuerpo) return;
  const filas = resumen?.porTipo || [];
  cuerpo.innerHTML =
    filas
      .map(
        (fila) => `
      <tr>
        <td>${fila.icono} ${esc(fila.nombre)}</td>
        <td><strong>${fila.total}</strong></td>
        <td>${fila.resueltas}</td>
        <td>${fila.pendientes}</td>
        <td>${fila.promedioDias}</td>
      </tr>`
      )
      .join('') ||
    '<tr><td colspan="5" class="celda-vacia u-p-20">Sin datos</td></tr>';
}

/** CSV con el mismo formato que exportaba el monolito. */
export function generarCSV({ incidencias = [], tipos = [], municipios = [] } = {}) {
  if (!incidencias.length) return null;

  const encabezado = [
    'ID',
    'Tipo',
    'Título',
    'Descripción',
    'Estado',
    'Peligrosa',
    'Motivo de peligro',
    'Latitud',
    'Longitud',
    'Zona',
    'Fecha',
    'Días activa',
    'Reportó',
    'Municipio'
  ];

  const filas = incidencias.map((inc) => {
    const tipo = tipos.find((t) => t.id === inc.tipoId);
    const municipio = municipios.find((m) => m.id === inc.municipioId);
    return [
      inc.id,
      tipo ? tipo.nombre : inc.tipoId,
      inc.titulo,
      inc.descripcion,
      inc.estado,
      inc.peligrosa ? 'SÍ' : 'NO',
      inc.peligrosa ? inc.peligrosaMotivo || '' : '',
      inc.lat,
      inc.lng,
      inc.zonaNombre || '',
      inc.fecha,
      inc.estado === 'resuelta' ? '' : inc.dias ?? '',
      inc.esAnonimo ? 'Anónimo' : inc.autorNombre,
      municipio ? municipio.nombre : ''
    ]
      .map((valor) => `"${String(valor === null || valor === undefined ? '' : valor).replace(/"/g, '""')}"`)
      .join(',');
  });

  return '\uFEFF' + [encabezado.join(','), ...filas].join('\n');
}

export function descargarCSV(datos) {
  const csv = generarCSV(datos);
  if (!csv) return false;
  descargar(csv, `incidencias_${hoyIso()}.csv`, 'text/csv;charset=utf-8');
  return true;
}

export function descargarJSON(datos) {
  const respaldo = { exportado: new Date().toISOString(), ...datos };
  descargar(JSON.stringify(respaldo, null, 2), `respaldo_${hoyIso()}.json`, 'application/json');
}

/* ------------------------- constructor de informes ------------------------ */

const ETIQUETAS_COMPARAR = {
  municipio: 'municipio',
  estado: 'estado',
  tipo: 'tipo de incidencia',
  ambito: 'ámbito / vía',
  mes: 'mes'
};

/** Barras horizontales; delega en el módulo compartido y conserva la firma histórica. */
function svgBarras(filas = [], titulo = '', { ancho = 660 } = {}) {
  const items = filas.slice(0, 8).map((fila) => ({
    etiqueta: fila.etiqueta || fila.nombre || '—',
    valor: Number(fila.total) || 0
  }));
  const svg = graficoBarrasSvg(items, { ancho, descripcion: titulo });
  return svg ? `<figure class="informe-grafico"><figcaption>${esc(titulo)}</figcaption>${svg}</figure>` : '';
}

/** Dona por estado; delega en el módulo compartido y conserva la firma histórica. */
function svgPastel(filas = [], titulo = '', { ancho = 318 } = {}) {
  const items = filas.map((fila, indice) => ({
    etiqueta: fila.etiqueta || fila.nombre || '—',
    valor: Number(fila.total) || 0,
    clase: fila.clase || `serie-${(indice % 6) + 1}`
  }));
  const svg = graficoDonaSvg(items, { ancho, descripcion: titulo });
  return svg ? `<figure class="informe-grafico"><figcaption>${esc(titulo)}</figcaption>${svg}</figure>` : '';
}

/** Tendencia mensual; delega en el módulo compartido y conserva la firma histórica. */
function svgSerie(series = [], titulo = 'Tendencia mensual') {
  const puntos = series.slice(-12).map((fila) => ({
    mes: fila.periodo || fila.mes,
    total: Number(fila.total) || 0
  }));
  const svg = graficoSerieSvg(puntos, { descripcion: titulo });
  return svg ? `<figure class="informe-grafico"><figcaption>${esc(titulo)}</figcaption>${svg}</figure>` : '';
}

function filtrosLegibles(datos) {
  const filtros = datos.filtros || {};
  const partes = [];
  if (filtros.municipios?.length) partes.push(`Municipios: ${filtros.municipios.length}`);
  if (filtros.estados?.length) partes.push(`Estados: ${filtros.estados.join(', ')}`);
  if (!filtros.municipios?.length && !filtros.estados?.length) {
    partes.push('Todas las incidencias del ámbito');
  }
  if (filtros.tiposTodos) partes.push('Todos los tipos');
  else if (filtros.tipos?.length) partes.push(`Tipos: ${filtros.tipos.length}`);
  if (filtros.desde) partes.push(`Desde ${filtros.desde}`);
  if (filtros.hasta) partes.push(`Hasta ${filtros.hasta}`);
  return partes.join(' · ');
}

/** Cuerpo del informe (se usa en la vista previa y en la ventana de impresión). */
export function htmlInforme(datos = {}, opciones = {}) {
  const plantilla = datos.plantilla || {};
  const resumen = datos.resumen || {};
  const posicion = ['izquierda', 'derecha', 'centro'].includes(plantilla.logoPosicion)
    ? plantilla.logoPosicion
    : 'izquierda';
  const logo = plantilla.logoUrl
    ? `<img class="informe-logo informe-logo-${posicion}" src="${esc(plantilla.logoUrl)}" alt="Logo institucional">`
    : '';
  const filtros = datos.filtros || {};
  const comparar = filtros.compararPor || 'municipio';
  const comparativa = datos.comparativa || [];
  const alcanceTexto = filtros.municipios?.length
    ? `${filtros.municipios.length} municipio${filtros.municipios.length === 1 ? '' : 's'}`
    : filtros.estados?.length
      ? `Estados: ${filtros.estados.join(', ')}`
      : 'Todas las incidencias del ámbito';
  const tiposTexto = filtros.tiposTodos || !filtros.tipos?.length
    ? 'Todos los tipos'
    : `${filtros.tipos.length} tipo${filtros.tipos.length === 1 ? '' : 's'}`;
  const periodoTexto = filtros.desde || filtros.hasta
    ? `${filtros.desde || 'Inicio'} – ${filtros.hasta || 'hoy'}`
    : 'Todo el historial';
  const porEstado = [
    { etiqueta: 'Resueltas', total: Number(resumen.resueltas) || 0, clase: 'estado-resuelta' },
    { etiqueta: 'En proceso', total: Number(resumen.enProceso) || 0, clase: 'estado-en_proceso' },
    { etiqueta: 'Reportadas', total: Number(resumen.reportadas) || 0, clase: 'estado-reportada' }
  ];
  const bloqueComparacion =
    opciones.comparacion !== false && comparativa.length
      ? `<section class="informe-bloque">
          <h2>Comparación por ${esc(ETIQUETAS_COMPARAR[comparar] || comparar)}</h2>
          <table>
            <thead><tr><th>Grupo</th><th class="num">Total</th><th class="num">Resueltas</th><th class="num">Pendientes</th><th class="num">% resolución</th></tr></thead>
            <tbody>
              ${comparativa
                .map(
                  (fila) => `<tr>
                    <td>${esc(fila.etiqueta)}</td>
                    <td class="num">${esc(String(fila.total))}</td>
                    <td class="num">${esc(String(fila.resueltas))}</td>
                    <td class="num">${esc(String(fila.pendientes))}</td>
                    <td class="num">${esc(String(fila.tasaResolucion))}%</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </section>`
      : '';
  const mostrarBarras = opciones.barras !== false;
  const mostrarPastel = opciones.pastel !== false && porEstado.some((estado) => estado.total > 0);
  const ambas = mostrarBarras && mostrarPastel;
  const barras = mostrarBarras
    ? svgBarras(
        comparativa.length ? comparativa : datos.porTipo || [],
        comparativa.length
          ? `Incidencias por ${ETIQUETAS_COMPARAR[comparar] || comparar}`
          : 'Incidencias por tipo',
        { ancho: ambas ? 318 : 660 }
      )
    : '';
  const pastel = mostrarPastel
    ? svgPastel(porEstado, 'Distribución por estado', { ancho: ambas ? 318 : 660 })
    : '';
  const serie = svgSerie(datos.series || []);
  const bloqueGraficas = ambas
    ? `<section class="informe-bloque"><div class="informe-rejilla-2">${barras}${pastel}</div></section>`
    : `${barras ? `<section class="informe-bloque">${barras}</section>` : ''}${
        pastel ? `<section class="informe-bloque">${pastel}</section>` : ''
      }`;
  const bloqueSerie =
    opciones.serie === false || !serie ? '' : `<section class="informe-bloque">${serie}</section>`;
  const bloqueDetalle =
    opciones.detalle === false || !(datos.detalle || []).length
      ? ''
      : `<section class="informe-bloque">
          <h2>Detalle de incidencias (${datos.detalle.length})</h2>
          <table>
            <thead><tr><th>#</th><th>Tipo</th><th>Título</th><th>Municipio</th><th>Estado</th><th class="num">Días</th></tr></thead>
            <tbody>
              ${datos.detalle
                .slice(0, 500)
                .map((incidencia, indice) => {
                  const claseEstado =
                    { resuelta: 'badge-verde', en_proceso: 'badge-amarillo', reportada: 'badge-rojo' }[
                      incidencia.estado
                    ] || 'badge';
                  return `<tr>
                    <td>${indice + 1}</td>
                    <td>${esc(incidencia.tipo || '—')}</td>
                    <td>${esc(incidencia.titulo || '')}</td>
                    <td>${esc(incidencia.municipio || '')}</td>
                    <td><span class="badge ${claseEstado}">${esc(etiquetaEstado(incidencia.estado))}</span></td>
                    <td class="num">${incidencia.estado === 'resuelta' ? '—' : esc(String(incidencia.dias ?? '—'))}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </section>`;
  return `<article class="informe-previa">
    ${logo}
    <h1>Informe de incidencias municipales</h1>
    <p class="informe-meta">${esc(filtrosLegibles(datos))} · Generado: ${esc(
      fmtFecha(datos.generadoEn || new Date().toISOString())
    )}</p>
    <dl class="informe-ficha">
      <div><dt>Alcance</dt><dd>${esc(alcanceTexto)}</dd></div>
      <div><dt>Tipos</dt><dd>${esc(tiposTexto)}</dd></div>
      <div><dt>Periodo</dt><dd>${esc(periodoTexto)}</dd></div>
    </dl>
    <div class="informe-stats">
      <div class="informe-stat"><strong>${esc(String(resumen.total ?? 0))}</strong><span>Total</span></div>
      <div class="informe-stat"><strong>${esc(String(resumen.reportadas ?? 0))}</strong><span>Reportadas</span></div>
      <div class="informe-stat"><strong>${esc(String(resumen.enProceso ?? 0))}</strong><span>En proceso</span></div>
      <div class="informe-stat"><strong>${esc(String(resumen.resueltas ?? 0))}</strong><span>Resueltas</span></div>
      <div class="informe-stat"><strong>${esc(String(resumen.criticas ?? 0))}</strong><span>Críticas</span></div>
      <div class="informe-stat"><strong>${esc(String(resumen.tasaResolucion ?? 0))}%</strong><span>Resolución</span></div>
    </div>
    ${bloqueGraficas}
    ${bloqueSerie}
    ${bloqueComparacion}
    ${bloqueDetalle}
    <p class="informe-pie">${esc(plantilla.pieTexto || 'Sistema de Incidencias Municipales')}</p>
  </article>`;
}

/** Previsualización dentro del modal (sin ventanas nuevas). */
export function renderVistaPrevia(datos, opciones = {}) {
  const caja = $('informeVistaPrevia');
  if (!caja) return;
  caja.innerHTML = htmlInforme(datos, opciones);
  // El color institucional se aplica por CSSOM, que la CSP sí permite.
  const acento = datos?.plantilla?.colorAcento;
  if (/^#[0-9a-f]{6}$/i.test(acento || '')) caja.style.setProperty('--inf-acento', acento);
}

/** Informe imprimible en una ventana nueva (con el logo y las gráficas). */
export function abrirInformeImprimible({ datos = {}, opciones = {} } = {}) {
  const ventana = window.open('', '_blank');
  if (!ventana) return false;
  ventana.document.write(`
    <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Informe de incidencias</title>
    <link rel="stylesheet" href="/css/impresion-informe.css">
    <link rel="stylesheet" href="/api/informes/estilo.css">
    </head><body>
    <main class="informe-contenido">
      ${htmlInforme(datos, opciones)}
    </main>
    <script src="/js/informe-paged-config.js"></script>
    <script src="/vendor/pagedjs/paged.polyfill.js"></script>
    <script src="/js/informe-imprimir.js"></script>
    </body></html>
  `);
  ventana.document.close();
  return true;
}

/** Lee el archivo de respaldo elegido en el modal de importación. */
export async function leerRespaldo() {
  const entrada = $('archivoRespaldo');
  const archivo = entrada?.files?.[0];
  if (!archivo) throw new Error('Selecciona el archivo JSON del respaldo');
  const texto = await archivo.text();
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON válido');
  }
}

export function limpiarModalImportar() {
  if ($('archivoRespaldo')) $('archivoRespaldo').value = '';
}
