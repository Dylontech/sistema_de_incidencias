/** Servicio de estadísticas, informes y exportación. */
import { api } from '../core/api.js';

/** Convierte los filtros del panel en query string. */
function conFiltros(ruta, filtros = {}) {
  const params = new URLSearchParams();
  const municipios = filtros.municipios || (filtros.municipioId ? [filtros.municipioId] : []);
  const estados = filtros.estados || [];
  if (municipios.length) params.set('municipios', municipios.join(','));
  if (estados.length) params.set('estados', estados.join(','));
  const query = params.toString();
  return query ? `${ruta}?${query}` : ruta;
}

/** Convierte los filtros del constructor de informes en query string. */
function queryInforme(filtros = {}) {
  const params = new URLSearchParams();
  const lista = (valor) =>
    Array.isArray(valor) ? valor.join(',') : String(valor ?? '').trim();
  if (lista(filtros.municipios)) params.set('municipios', lista(filtros.municipios));
  if (lista(filtros.estados)) params.set('estados', lista(filtros.estados));
  if (lista(filtros.tipos)) params.set('tipos', lista(filtros.tipos));
  if (filtros.tiposTodos) params.set('tiposTodos', 'true');
  if (filtros.compararPor) params.set('compararPor', filtros.compararPor);
  if (filtros.incluirDetalle === false) params.set('incluirDetalle', 'false');
  if (filtros.desde) params.set('desde', filtros.desde);
  if (filtros.hasta) params.set('hasta', filtros.hasta);
  if (filtros.formato) params.set('formato', filtros.formato);
  if (filtros.pdf) params.set('pdf', filtros.pdf);
  for (const clave of ['barras', 'pastel', 'serie', 'comparacion', 'detalle']) {
    if (filtros[clave] === false) params.set(clave, 'false');
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const statsService = {
  panel(filtros = {}) {
    return api.get(conFiltros('/stats/panel', filtros));
  },
  informes(filtros = {}) {
    return api.get(conFiltros('/stats/informes', filtros));
  },
  exportacion(filtros = {}) {
    return api.get(conFiltros('/exportacion', filtros));
  },
  /** Datos ligeros del constructor de informes (con comparación y series). */
  datosInforme(filtros = {}) {
    return api.get(`/informes/datos${queryInforme(filtros)}`);
  },
  /** Versión de PDF configurada: v1, v2 o preguntar. */
  motorPdf() {
    return api.get('/informes/motor-pdf');
  },
  /** PDF del informe con los filtros y las opciones de gráficas elegidas. */
  pdfInforme(filtros = {}, opciones = {}, motor = null) {
    return api.blob(
      `/informes/exportar${queryInforme({
        ...filtros,
        ...opciones,
        ...(motor && motor !== 'auto' ? { pdf: motor } : {}),
        formato: 'pdf'
      })}`
    );
  },
  /** CSV del informe con los filtros elegidos. */
  csvInforme(filtros = {}) {
    return api.texto(`/informes/exportar${queryInforme({ ...filtros, formato: 'csv' })}`);
  },
  limpiar() {
    return api.post('/admin/limpiar');
  },
  importar(respaldo) {
    return api.post('/admin/importar', respaldo);
  },
  subirLogo(archivo) {
    return api.subir('/admin/informes/logo', [archivo], { campo: 'archivo' });
  }
};
