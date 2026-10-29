/* Asistente de conexión (página local de Electron, sin Node en el renderer). */
(function () {
  const api = window.desktopApi;
  const url = document.getElementById('url');
  const offline = document.getElementById('offline');
  const estado = document.getElementById('estado');
  const probar = document.getElementById('probar');
  const conectar = document.getElementById('conectar');
  const version = document.getElementById('version');
  const mapas = document.getElementById('mapas');

  function mostrar(texto, tipo) {
    estado.textContent = texto;
    estado.className = `estado ${tipo || 'info'}`;
  }

  function ocupado(valor) {
    probar.disabled = valor;
    conectar.disabled = valor;
  }

  async function iniciar() {
    try {
      const config = await api.obtenerConfig();
      url.value = config.urlServidor || '';
      offline.checked = config.modoOffline === true;

      const info = await api.info();
      version.textContent = `Versión ${info.version} · Electron ${info.electron}`;
      mapas.textContent = info.mapas.archivos.length
        ? `Mapas offline instalados: ${info.mapas.archivos.join(', ')}`
        : 'Mapas offline: no instalados (se usan las teselas del servidor).';
    } catch (error) {
      mostrar(`No se pudo leer la configuración: ${error.message}`, 'err');
    }
  }

  probar.addEventListener('click', async () => {
    const destino = url.value.trim();
    if (!destino) return mostrar('Escribe la dirección del servidor.', 'err');
    ocupado(true);
    mostrar('Probando conexión…', 'info');
    try {
      const resultado = await api.probarServidor(destino);
      if (resultado.ok) {
        mostrar(
          `Conexión correcta en ${resultado.latenciaMs} ms · almacén: ${resultado.driver}`,
          'ok'
        );
      } else {
        mostrar(resultado.error || 'No se pudo conectar.', 'err');
      }
    } catch (error) {
      mostrar(error.message, 'err');
    } finally {
      ocupado(false);
    }
  });

  document.getElementById('formulario').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const destino = url.value.trim();
    if (!destino) return mostrar('Escribe la dirección del servidor.', 'err');

    ocupado(true);
    mostrar('Guardando y comprobando el servidor…', 'info');
    try {
      await api.guardarConfig({ urlServidor: destino, modoOffline: offline.checked });
      const resultado = await api.conectar();
      if (!resultado.ok) {
        mostrar(resultado.error || 'No se pudo conectar.', 'err');
      }
    } catch (error) {
      mostrar(error.message, 'err');
    } finally {
      ocupado(false);
    }
  });

  iniciar();
})();
