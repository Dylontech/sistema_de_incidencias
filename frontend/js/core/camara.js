/**
 * Captura de fotos con la cámara del dispositivo.
 *
 * Usa `getUserMedia` (permiso explícito del navegador) y devuelve un `File`
 * compatible con la subida de evidencia que ya existe. Si el navegador no
 * soporta la API o el usuario niega el permiso, el controlador ofrece el
 * selector de archivos como alternativa.
 */

let stream = null;

export function disponible() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

export function activa() {
  return Boolean(stream);
}

/** Enciende la cámara y la pinta en el `<video>` indicado. */
export async function abrir(videoId = 'camaraVideo') {
  const video = document.getElementById(videoId);
  if (!video) throw new Error('No se encontró la vista previa de la cámara');
  if (!disponible()) throw new Error('Este navegador no permite usar la cámara');

  cerrar();

  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      // `ideal` en vez de `exact`: en equipos sin cámara trasera sigue abriendo.
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  });

  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    // Algunos navegadores tardan en aplicar `autoplay`; el frame se verá igual.
  }
  return video;
}

/** Apaga la cámara y libera el dispositivo. */
export function cerrar() {
  if (stream) {
    stream.getTracks().forEach((pista) => pista.stop());
    stream = null;
  }
  const video = document.getElementById('camaraVideo');
  if (video) video.srcObject = null;
}

/**
 * Toma un fotograma del video y lo devuelve como `File` JPEG.
 * Se limita el lado mayor a 1920 px para no enviar fotos de 12 MP.
 */
export function capturar(videoId = 'camaraVideo') {
  const video = document.getElementById(videoId);
  if (!video || !video.videoWidth) {
    throw new Error('La cámara todavía no está lista');
  }

  const escala = Math.min(1, 1920 / video.videoWidth);
  const ancho = Math.max(1, Math.round(video.videoWidth * escala));
  const alto = Math.max(1, Math.round(video.videoHeight * escala));

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const contexto = lienzo.getContext('2d');
  contexto.drawImage(video, 0, 0, ancho, alto);

  return new Promise((resolver, rechazar) => {
    lienzo.toBlob(
      (blob) => {
        if (!blob) {
          rechazar(new Error('No se pudo generar la fotografía'));
          return;
        }
        resolver(
          new File([blob], `foto-${Date.now()}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          })
        );
      },
      'image/jpeg',
      0.85
    );
  });
}

// Si el modal se cierra con Escape o se sale de la página, se apaga la cámara.
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && stream) cerrar();
});
document.addEventListener('click', (evento) => {
  if (evento.target?.id === 'modalCamara') cerrar();
});
document.addEventListener('pagehide', cerrar);
