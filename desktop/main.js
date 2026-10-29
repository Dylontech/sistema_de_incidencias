/**
 * Proceso principal de Electron.
 *
 * La app es un contenedor seguro del servidor web: carga la URL configurada,
 * bloquea la navegación fuera del origen y abre los enlaces externos en el
 * navegador del sistema. La primera vez pide la dirección del servidor.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const config = require('./src/config');
const servidor = require('./src/servidor');
const mapas = require('./src/mapas');

let ventanaPrincipal = null;
let ventanaConfig = null;
let ventanaOffline = null;
let configActual = null;
let mapasLocales = { url: null, archivos: [], carpeta: '', cerrar: () => {} };

const PRELOAD = path.join(__dirname, 'preload.js');

function origenPermitido() {
  try {
    return new URL(configActual?.urlServidor || '').origin;
  } catch {
    return '';
  }
}

function crearVentanaPrincipal() {
  if (!configActual?.urlServidor) return mostrarConfig();
  if (ventanaPrincipal && !ventanaPrincipal.isDestroyed()) {
    ventanaPrincipal.show();
    ventanaPrincipal.focus();
    return ventanaPrincipal;
  }

  ventanaPrincipal = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 980,
    minHeight: 620,
    show: false,
    backgroundColor: '#006657',
    title: 'Incidencias Municipales',
    autoHideMenuBar: process.platform === 'win32',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false
    }
  });

  ventanaPrincipal.once('ready-to-show', () => ventanaPrincipal.show());

  ventanaPrincipal.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  ventanaPrincipal.webContents.on('will-navigate', (evento, destino) => {
    const permitido = origenPermitido();
    if (!permitido || !destino.startsWith(permitido)) {
      evento.preventDefault();
      if (/^https?:/i.test(destino)) shell.openExternal(destino);
    }
  });

  ventanaPrincipal.webContents.on('did-fail-load', (_evento, codigo, descripcion, _url, esPrincipal) => {
    if (!esPrincipal) return;
    mostrarOffline(configActual.urlServidor, `${descripcion} (${codigo})`);
  });

  ventanaPrincipal.loadURL(configActual.urlServidor).catch((error) => {
    mostrarOffline(configActual.urlServidor, error.message);
  });

  ventanaPrincipal.on('closed', () => {
    ventanaPrincipal = null;
  });

  if (ventanaConfig && !ventanaConfig.isDestroyed()) ventanaConfig.close();
  return ventanaPrincipal;
}

function mostrarConfig() {
  if (ventanaConfig && !ventanaConfig.isDestroyed()) {
    ventanaConfig.show();
    ventanaConfig.focus();
    return;
  }

  ventanaConfig = new BrowserWindow({
    width: 600,
    height: 720,
    resizable: true,
    minimizable: false,
    maximizable: false,
    title: 'Conectar con el servidor',
    parent: ventanaPrincipal && !ventanaPrincipal.isDestroyed() ? ventanaPrincipal : undefined,
    modal: Boolean(ventanaPrincipal && !ventanaPrincipal.isDestroyed()),
    show: false,
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  ventanaConfig.once('ready-to-show', () => ventanaConfig.show());
  ventanaConfig.loadFile(path.join(__dirname, 'ui', 'config.html'));
  ventanaConfig.on('closed', () => {
    ventanaConfig = null;
  });
}

function mostrarOffline(url, error) {
  if (ventanaPrincipal && !ventanaPrincipal.isDestroyed()) ventanaPrincipal.hide();
  if (ventanaOffline && !ventanaOffline.isDestroyed()) {
    ventanaOffline.webContents.send('offline:actualizar', { url, error });
    ventanaOffline.show();
    return;
  }

  ventanaOffline = new BrowserWindow({
    width: 640,
    height: 560,
    title: 'Sin conexión con el servidor',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  ventanaOffline.loadFile(path.join(__dirname, 'ui', 'offline.html'), {
    query: { url: url || '', error: error || '' }
  });
  ventanaOffline.on('closed', () => {
    ventanaOffline = null;
  });
}

async function conectar() {
  const resultado = await servidor.probar(configActual.urlServidor);
  if (!resultado.ok) {
    mostrarOffline(configActual.urlServidor, resultado.error);
    return { ok: false, error: resultado.error };
  }
  configActual = config.guardar(app, { ultimaConexion: new Date().toISOString() });
  if (ventanaOffline && !ventanaOffline.isDestroyed()) ventanaOffline.close();
  crearVentanaPrincipal();
  if (ventanaPrincipal && !ventanaPrincipal.isDestroyed()) ventanaPrincipal.show();
  return { ok: true, latenciaMs: resultado.latenciaMs, driver: resultado.driver };
}

function registrarIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    plataforma: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    mapas: {
      url: mapasLocales.url,
      archivos: mapasLocales.archivos,
      carpeta: mapasLocales.carpeta
    }
  }));

  ipcMain.handle('config:obtener', () => configActual);
  ipcMain.handle('config:guardar', (_evento, datos = {}) => {
    configActual = config.guardar(app, datos);
    return configActual;
  });

  ipcMain.handle('servidor:probar', (_evento, url) =>
    servidor.probar(config.normalizarUrl(url) || configActual.urlServidor)
  );

  ipcMain.handle('app:conectar', () => conectar());
  ipcMain.handle('ventana:config', () => {
    mostrarConfig();
    return true;
  });
  ipcMain.handle('ventana:reintentar', () => conectar());
  ipcMain.handle('app:reiniciar', () => {
    app.relaunch();
    app.exit(0);
  });
}

function crearMenu() {
  const plantilla = [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Configurar servidor…',
          accelerator: 'CmdOrCtrl+,',
          click: () => mostrarConfig()
        },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar recarga' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño real' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Diagnóstico de conexión',
          click: async () => {
            const info = await servidor.probar(configActual.urlServidor);
            const lineas = [
              `Servidor: ${configActual.urlServidor || '(sin configurar)'}`,
              `Estado: ${info.ok ? 'conectado' : 'sin conexión'}`,
              info.ok ? `Latencia: ${info.latenciaMs} ms · almacén: ${info.driver}` : `Error: ${info.error}`,
              `Mapas offline: ${mapasLocales.archivos.length ? mapasLocales.archivos.join(', ') : 'no instalados'}`,
              `Versión: ${app.getVersion()} · Electron ${process.versions.electron}`
            ];
            dialog.showMessageBox({
              type: info.ok ? 'info' : 'warning',
              title: 'Diagnóstico',
              message: info.ok ? 'La conexión con el servidor funciona' : 'No se pudo conectar',
              detail: lineas.join('\n'),
              buttons: ['Cerrar']
            });
          }
        },
        {
          label: 'Acerca de',
          click: () =>
            dialog.showMessageBox({
              type: 'info',
              title: 'Acerca de',
              message: 'Sistema de Incidencias Municipales',
              detail: `Aplicación de escritorio ${app.getVersion()}\nWindows y Linux\n\nLos mapas offline se generan con datos de OpenStreetMap (ODbL).`,
              buttons: ['Cerrar']
            })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

const instanciaUnica = app.requestSingleInstanceLock();
if (!instanciaUnica) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (ventanaPrincipal && !ventanaPrincipal.isDestroyed()) {
      if (ventanaPrincipal.isMinimized()) ventanaPrincipal.restore();
      ventanaPrincipal.show();
      ventanaPrincipal.focus();
    }
  });

  app.whenReady().then(() => {
    configActual = config.leer(app);
    mapasLocales = mapas.iniciar(app);

    // Solo se permite geolocalización (la usa el botón «Mi ubicación»).
    session.defaultSession.setPermissionRequestHandler((_webContents, permiso, callback) => {
      callback(permiso === 'geolocation');
    });
    session.defaultSession.setPermissionCheckHandler(
      (_webContents, permiso) => permiso === 'geolocation'
    );

    registrarIpc();
    crearMenu();

    if (configActual.urlServidor) crearVentanaPrincipal();
    else mostrarConfig();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        if (configActual.urlServidor) crearVentanaPrincipal();
        else mostrarConfig();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  mapasLocales.cerrar?.();
});
