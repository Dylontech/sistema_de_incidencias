/** Comparaciones de URL compartidas por navegación y permisos IPC. */
function urlPermitida(destino, referencia) {
  try {
    const url = new URL(destino);
    const base = new URL(referencia);
    if (base.protocol === 'file:') {
      return url.protocol === 'file:' && url.host === base.host && url.pathname === base.pathname;
    }
    return ['http:', 'https:'].includes(url.protocol) && url.origin === base.origin;
  } catch {
    return false;
  }
}

function emisorPermitido(evento, ventanas) {
  if (!evento.senderFrame || evento.senderFrame !== evento.sender.mainFrame) return false;
  return ventanas.some(({ ventana, url }) => ventana && !ventana.isDestroyed()
    && evento.sender === ventana.webContents && urlPermitida(evento.senderFrame.url, url));
}

module.exports = { urlPermitida, emisorPermitido };
