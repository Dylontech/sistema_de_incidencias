/**
 * Configuración local de la app de escritorio.
 * Se guarda en la carpeta de datos del usuario (no en el directorio de la app,
 * que puede ser de solo lectura en Windows/Linux).
 */
const fs = require('node:fs');
const path = require('node:path');

const ARCHIVO = 'config.json';

function rutaConfig(app) {
  return path.join(app.getPath('userData'), ARCHIVO);
}

function normalizarUrl(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return '';
  const conEsquema = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
  try {
    const url = new URL(conEsquema);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function leer(app) {
  const porDefecto = {
    urlServidor: '',
    modoOffline: false,
    ultimaConexion: null,
    version: app.getVersion()
  };
  try {
    const crudo = fs.readFileSync(rutaConfig(app), 'utf8');
    const datos = JSON.parse(crudo);
    return {
      ...porDefecto,
      ...datos,
      urlServidor: normalizarUrl(datos.urlServidor)
    };
  } catch {
    return porDefecto;
  }
}

function guardar(app, cambios = {}) {
  const actual = leer(app);
  const siguiente = {
    ...actual,
    ...cambios,
    urlServidor: normalizarUrl(cambios.urlServidor ?? actual.urlServidor),
    version: app.getVersion()
  };
  fs.mkdirSync(path.dirname(rutaConfig(app)), { recursive: true });
  fs.writeFileSync(rutaConfig(app), JSON.stringify(siguiente, null, 2), 'utf8');
  return siguiente;
}

module.exports = { leer, guardar, normalizarUrl, rutaConfig };
