/**
 * Dispara la impresión del informe imprimible.
 *
 * Vive en su propio archivo —y no incrustado en el documento del informe—
 * porque la Content-Security-Policy no admite código en línea. El informe se
 * escribe con `document.write` en una ventana `about:blank`, que hereda esta
 * misma política, así que una etiqueta de script con `src` del propio origen sí
 * se ejecuta.
 *
 * Se espera a `load` para que el navegador haya aplicado la hoja de estilos
 * antes de abrir el diálogo.
 *
 * Nota: no se dispara desde la ventana que abre el informe porque, en cuanto el
 * documento nuevo termina de cargar, la política de apertura de contextos deja
 * de permitirle acceder a `ventana.print()`.
 */
window.addEventListener('load', async () => {
  try {
    // Paged.js aplica los márgenes, el pie y los saltos de página finos.
    // Si la librería no carga, se conserva la impresión nativa como respaldo.
    if (window.PagedPolyfill?.preview) await window.PagedPolyfill.preview();
  } catch (error) {
    console.error('[informe] no se pudo paginar con Paged.js:', error);
  }
  window.focus();
  window.print();
});
