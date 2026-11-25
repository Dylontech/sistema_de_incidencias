/**
 * Cola offline de reportes (IndexedDB).
 *
 * Si no hay red, el reporte (texto + fotos) se guarda en el dispositivo. Al
 * recuperar la conexión se suben las fotos y se crea la incidencia; solo
 * entonces se borra de la cola. No se cachean datos de la API.
 */
import { toast } from './ui.js';
import { incidenciasService } from '../services/incidencias.service.js';
import { token } from './api.js';

const DB = 'inc_offline_v1';
const ALMACEN = 'reportes';

function abrir() {
  return new Promise((resolver, rechazar) => {
    const solicitud = indexedDB.open(DB, 1);
    solicitud.onupgradeneeded = () => {
      if (!solicitud.result.objectStoreNames.contains(ALMACEN)) {
        solicitud.result.createObjectStore(ALMACEN, { keyPath: 'id' });
      }
    };
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
  });
}

async function operar(modo, accion) {
  const db = await abrir();
  return new Promise((resolver, rechazar) => {
    const transaccion = db.transaction(ALMACEN, modo);
    const almacen = transaccion.objectStore(ALMACEN);
    const solicitud = accion(almacen);
    // El éxito de una solicitud no garantiza que la transacción se confirme.
    transaccion.oncomplete = () => { db.close(); resolver(solicitud.result); };
    transaccion.onabort = () => {
      db.close();
      rechazar(transaccion.error || solicitud.error || new Error('No se pudo guardar el reporte'));
    };
  });
}

export function nuevaClaveReporte() {
  return `off_${Array.from(crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function encolarReporte(datos, fotos = [], propietario = token.propietario()) {
  if (!propietario) return Promise.reject(new Error('Inicia sesión para guardar el reporte pendiente'));
  const registro = {
    id: datos.claveIdempotencia || nuevaClaveReporte(),
    propietario,
    datos,
    fotos,
    intentos: 0,
    creadoEn: new Date().toISOString()
  };
  return operar('readwrite', (almacen) => almacen.put(registro)).then(() => registro);
}

export function listarPendientes() {
  return operar('readonly', (almacen) => almacen.getAll());
}

function borrar(id) {
  return operar('readwrite', (almacen) => almacen.delete(id));
}

function actualizar(registro) {
  return operar('readwrite', (almacen) => almacen.put(registro));
}

function pintarEstado(pendientes = null) {
  const badge = document.getElementById('offlineBadge');
  if (!badge) return;
  if (!navigator.onLine) {
    badge.hidden = false;
    badge.textContent = pendientes?.length
      ? `Sin conexión · ${pendientes.length} pendiente(s)`
      : 'Sin conexión';
  } else if (pendientes?.length) {
    badge.hidden = false;
    const retenidos = pendientes.filter((r) => !r.propietario || r.propietario !== token.propietario());
    badge.textContent = `${pendientes.length} reporte(s) por enviar${retenidos.length ? ' · pendientes de otra identidad o anteriores a la actualización' : ''}`;
    badge.title = pendientes.find((r) => r.ultimoError)?.ultimoError || '';
  } else {
    badge.hidden = true;
  }
}

let sincronizando = false;

export async function sincronizar() {
  if (sincronizando || !navigator.onLine) {
    pintarEstado(await listarPendientes().catch(() => []));
    return;
  }

  sincronizando = true;
  try {
    const pendientes = await listarPendientes();
    for (let registro of pendientes) {
      const tokenSesion = token.leer();
      if (!registro.propietario || registro.propietario !== token.propietario(tokenSesion)) continue;
      if (registro.reintentarEn && Date.now() < registro.reintentarEn) continue;
      try {
        if (registro.fotos?.length) {
          const nuevas = await incidenciasService.subirEvidencia(registro.fotos, { tokenSesion });
          registro = {
            ...registro,
            fotos: [],
            datos: { ...registro.datos, evidencia: [...(registro.datos.evidencia || []), ...nuevas] }
          };
          await actualizar(registro);
        }
        // Si cambió la sesión mientras se subían fotos, conservar para su autor.
        if (token.leer() !== tokenSesion) break;
        await incidenciasService.crear({
          ...registro.datos,
          claveIdempotencia: registro.id
        }, { tokenSesion });
        await borrar(registro.id);
        toast('Reporte pendiente enviado', 'ok');
      } catch (error) {
        const intentos = (registro.intentos || 0) + 1;
        await actualizar({
          ...registro,
          intentos,
          ultimoError: error.message || 'No se pudo enviar; el reporte sigue guardado',
          reintentarEn: Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(intentos - 1, 7))
        });
        if (error?.estado === 0 || error?.estado === 401) break;
      }
    }
    pintarEstado(await listarPendientes());
  } finally {
    sincronizando = false;
  }
}

let iniciado = false;
export function iniciar() {
  if (iniciado) return;
  if (!('indexedDB' in window)) return;
  iniciado = true;
  const intentarSincronizar = () => sincronizar().catch(() =>
    toast('No se pudo acceder a los reportes pendientes del dispositivo', 'err'));
  pintarEstado();
  window.addEventListener('online', () => {
    pintarEstado();
    intentarSincronizar();
  });
  window.addEventListener('offline', () => pintarEstado());
  setInterval(intentarSincronizar, 30000);
}
