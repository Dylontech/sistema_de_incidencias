/* Pantalla de servidor inaccesible. */
(function () {
  const api = window.desktopApi;
  const parametros = new URLSearchParams(window.location.search);
  const direccion = document.getElementById('direccion');
  const detalle = document.getElementById('detalle');
  const reintentar = document.getElementById('reintentar');

  function pintar(datos) {
    direccion.value = datos.url || '(sin configurar)';
    detalle.textContent = datos.error || 'Error desconocido';
  }

  function leerParametros() {
    pintar({
      url: parametros.get('url') || '',
      error: parametros.get('error') || 'No se pudo cargar la página'
    });
  }

  reintentar.addEventListener('click', async () => {
    reintentar.disabled = true;
    detalle.className = 'estado info';
    detalle.textContent = 'Reintentando…';
    try {
      const resultado = await api.reintentar();
      if (!resultado.ok) {
        detalle.className = 'estado err';
        detalle.textContent = resultado.error || 'Sigue sin haber conexión';
      }
    } catch (error) {
      detalle.className = 'estado err';
      detalle.textContent = error.message;
    } finally {
      reintentar.disabled = false;
    }
  });

  document.getElementById('configurar').addEventListener('click', () => api.abrirConfig());
  document.getElementById('cerrar').addEventListener('click', () => window.close());
  api.alActualizarOffline(pintar);

  leerParametros();
})();
