/**
 * Vista del modal de informes: tarjetas, tabla resumen, exportaciones y
 * generación del informe imprimible.
 */
import { $, esc, descargar, fmtFecha, textoAntiguedad, etiquetaEstado, hoyIso } from '../core/utils.js';

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
    '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px;">Sin datos</td></tr>';
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

/** Informe imprimible en una ventana nueva (equivale a `generarReporteImprimible`). */
export function abrirInformeImprimible({ incidencias = [], tipos = [], municipio }) {
  const resueltas = incidencias.filter((i) => i.estado === 'resuelta').length;
  const pendientes = incidencias.length - resueltas;
  const tasa = incidencias.length > 0 ? ((resueltas / incidencias.length) * 100).toFixed(1) : 0;
  const nombreMunicipio = municipio ? `${municipio.nombre}, ${municipio.estado}` : '';
  const generado = new Date().toLocaleString('es-MX');

  const ventana = window.open('', '_blank');
  ventana.document.write(`
    <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Reporte de Incidencias — ${esc(nombreMunicipio)}</title>
    <style>
      body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; padding: 30px; color: #1a202c; font-size: 12px; }
      h1 { color: #006657; font-size: 22px; margin-bottom: 4px; }
      .meta { color: #718096; margin-bottom: 20px; }
      .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
      .stat { background: #f0faf8; border: 1px solid #b2dfdb; padding: 12px; border-radius: 8px; text-align: center; }
      .stat-num { font-size: 22px; font-weight: 800; color: #006657; }
      .stat-label { font-size: 10px; text-transform: uppercase; color: #4a5568; letter-spacing: .4px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 16px; }
      th, td { border: 1px solid #cbd5e0; padding: 6px 8px; text-align: left; }
      th { background: #e8f5f2; color: #006657; font-size: 10px; text-transform: uppercase; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; }
      .badge-verde { background: #d4edda; color: #155724; }
      .badge-amarillo { background: #fff3cd; color: #856404; }
      .badge-naranja { background: #ffe5d0; color: #8a3d00; }
      .badge-rojo { background: #f8d7da; color: #721c24; }
      .footer { margin-top: 30px; text-align: center; color: #94a3b8; font-size: 10px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
      @media print { body { padding: 15px; } }
    </style>
    </head><body>
    <h1>Reporte de Incidencias Municipales</h1>
    <div class="meta">${esc(nombreMunicipio)} · Generado: ${esc(generado)}</div>
    <div class="stats">
      <div class="stat"><div class="stat-num">${incidencias.length}</div><div class="stat-label">Total</div></div>
      <div class="stat"><div class="stat-num">${resueltas}</div><div class="stat-label">Resueltas</div></div>
      <div class="stat"><div class="stat-num">${pendientes}</div><div class="stat-label">Pendientes</div></div>
      <div class="stat"><div class="stat-num">${tasa}%</div><div class="stat-label">Resolución</div></div>
    </div>
    <h2 style="font-size:15px;color:#006657;margin-bottom:8px;">Detalle de incidencias</h2>
    <table>
      <thead><tr><th>#</th><th>Tipo</th><th>Título</th><th>Estado</th><th>Días</th><th>Reportó</th></tr></thead>
      <tbody>
        ${incidencias
          .map((inc, indice) => {
            const tipo = tipos.find((t) => t.id === inc.tipoId);
            return `<tr>
              <td>${indice + 1}</td>
              <td>${tipo ? tipo.icono + ' ' + esc(tipo.nombre) : '—'}</td>
              <td>${esc(inc.titulo)}</td>
              <td><span class="badge badge-${inc.color}">${etiquetaEstado(inc.estado)}</span></td>
              <td>${inc.estado === 'resuelta' ? '—' : textoAntiguedad(inc.dias)}</td>
              <td>${esc(inc.esAnonimo ? 'Anónimo' : inc.autorNombre)}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
    <div class="footer">Sistema de Incidencias Municipales · ${esc(nombreMunicipio)} · ${fmtFecha(new Date().toISOString())}</div>
    <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
    </body></html>
  `);
  ventana.document.close();
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
