/**
 * Bus de eventos en tiempo real (Server-Sent Events).
 *
 * El cliente abre `GET /api/eventos` con su token y mantiene la conexión. Cada
 * notificación nueva se empuja solo a las conexiones de su destinatario. No hay
 * dependencias nuevas y la CSP actual (`connect-src 'self'`) ya lo permite.
 *
 * El registro vive en memoria del proceso: con una sola instancia es suficiente.
 * Con varias réplicas haría falta pub/sub (Redis) o sesiones pegajosas.
 */

/** @type {Map<string, Set<import('express').Response>>} */
const clientes = new Map();

const LATIDO_MS = 25000;

function escribir(res, texto) {
  if (res.writableEnded || res.destroyed) return false;
  try {
    res.write(texto);
    // Con `compression()` delante, `flush()` fuerza a enviar el chunk ya;
    // sin esto la primera línea puede quedarse en el buffer.
    if (typeof res.flush === 'function') res.flush();
    return true;
  } catch {
    return false;
  }
}

/** Abre el canal SSE para la sesión actual. */
export function suscribir(req, res) {
  const userKey = req.usuario?.userKey;
  if (!userKey) {
    res.status(401).json({ error: 'Necesitas una sesión para recibir eventos', detalles: null });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Detrás de Nginx: sin esto el proxy acumula los eventos y no llegan.
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  escribir(res, ': conectado\n\n');

  if (!clientes.has(userKey)) clientes.set(userKey, new Set());
  clientes.get(userKey).add(res);

  let cerrado = false;
  const latido = setInterval(() => escribir(res, ': ping\n\n'), LATIDO_MS);
  latido.unref?.();

  const limpiar = () => {
    if (cerrado) return;
    cerrado = true;
    clearInterval(latido);
    const conexiones = clientes.get(userKey);
    if (!conexiones) return;
    conexiones.delete(res);
    if (!conexiones.size) clientes.delete(userKey);
  };

  req.on('close', limpiar);
  req.on('aborted', limpiar);
  res.on('close', limpiar);
  res.on('error', limpiar);
}

function serializar(evento) {
  const tipo = evento?.tipo || 'mensaje';
  return `event: ${tipo}\ndata: ${JSON.stringify(evento)}\n\n`;
}

/** Empuja un evento a las sesiones indicadas (por `userKey`). */
export function emitirA(userKeys = [], evento = {}) {
  const texto = serializar(evento);
  for (const userKey of new Set(userKeys.filter(Boolean))) {
    const conexiones = clientes.get(userKey);
    if (!conexiones) continue;
    for (const res of conexiones) {
      if (!escribir(res, texto)) {
        conexiones.delete(res);
        if (!conexiones.size) clientes.delete(userKey);
      }
    }
  }
}

/** Empuja un evento a todas las conexiones abiertas. */
export function emitirGlobal(evento = {}) {
  emitirA([...clientes.keys()], evento);
}

/** Cierra las conexiones de una cuenta (por ejemplo, al revocarla). */
export function cerrarSesion(userKey) {
  const conexiones = clientes.get(userKey);
  if (!conexiones) return;
  for (const res of [...conexiones]) {
    escribir(res, 'event: sesion-cerrada\ndata: {}\n\n');
    res.end();
  }
  clientes.delete(userKey);
}

/** Número de conexiones abiertas (para el panel de monitoreo). */
export function contarConectados() {
  let total = 0;
  for (const conexiones of clientes.values()) total += conexiones.size;
  return { conexiones: total, sesiones: clientes.size };
}
