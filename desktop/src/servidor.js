/**
 * Comprobación de conexión con el servidor.
 * Se usa en el asistente y en el menú de diagnóstico.
 */
async function probar(url, { timeoutMs = 8000 } = {}) {
  const base = String(url || '').replace(/\/$/, '');
  if (!base) return { ok: false, error: 'Falta la dirección del servidor' };

  const inicio = Date.now();
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), timeoutMs);

  try {
    const respuesta = await fetch(`${base}/api/salud`, {
      signal: control.signal,
      headers: { Accept: 'application/json' }
    });
    const latenciaMs = Date.now() - inicio;
    if (!respuesta.ok) {
      return {
        ok: false,
        latenciaMs,
        error: `El servidor respondió ${respuesta.status}. ¿La dirección incluye el puerto correcto?`
      };
    }
    const datos = await respuesta.json().catch(() => ({}));
    return {
      ok: true,
      latenciaMs,
      driver: datos.driver || 'desconocido',
      baseDatos: datos.baseDatos || 'ok',
      fecha: datos.fecha || new Date().toISOString()
    };
  } catch (error) {
    const abortado = error.name === 'AbortError';
    return {
      ok: false,
      error: abortado
        ? 'La conexión tardó demasiado. Revisa la red, el firewall o si el servidor está encendido.'
        : `No se pudo conectar: ${error.message}`
    };
  } finally {
    clearTimeout(temporizador);
  }
}

module.exports = { probar };
