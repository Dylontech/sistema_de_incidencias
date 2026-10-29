/**
 * Paged.js se carga en la ventana del informe, pero no debe arrancar solo:
 * `informe-imprimir.js` espera a que el documento esté listo, lanza la
 * paginación y recién entonces abre el diálogo de impresión.
 */
window.PagedConfig = { auto: false };
