/**
 * Cola offline de reportes (IndexedDB).
 *
 * Si no hay red, el reporte (texto + fotos) se guarda en el dispositivo. Al
 * recuperar la conexión se suben las fotos y se crea la incidencia; solo
 * entonces se borra de la cola. No se cachean datos de la API.
 */
import { toast } from './ui.js';
import { incidenciasService } from '../services/incidencias.service.js';

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
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
    transaccion.oncomplete = () => db.close();
  });
}

export function encolarReporte(datos, fotos = []) {
  const registro = {
    id: `off_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
    badge.textContent = `${pendientes.length} reporte(s) por enviar`;
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
    for (const registro of pendientes) {
      try {
        const evidencia = registro.fotos?.length
          ? await incidenciasService.subirEvidencia(registro.fotos)
          : [];
        await incidenciasService.crear({
          ...registro.datos,
          evidencia,
          claveIdempotencia: registro.id
        });
        await borrar(registro.id);
        toast('Reporte pendiente enviado', 'ok');
      } catch (error) {
        // Sin red se deja para el próximo intento; un error de datos se marca
        // para no bloquear la cola indefinidamente.
        if (error?.estado === 0) break;
        await actualizar({ ...registro, intentos: (registro.intentos || 0) + 1 });
        if (registro.intentos >= 2) {
          await borrar(registro.id);
          toast('Un reporte pendiente no pudo enviarse y se descartó', 'err');
        }
      }
    }
    pintarEstado(await listarPendientes());
  } finally {
    sincronizando = false;
  }
}

export function iniciar() {
  if (!('indexedDB' in window)) return;
  pintarEstado();
  window.addEventListener('online', () => {
    pintarEstado();
    sincronizar();
  });
  window.addEventListener('offline', () => pintarEstado());
  setInterval(() => sincronizar(), 30000);
}
