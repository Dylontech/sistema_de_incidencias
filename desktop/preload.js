/**
 * Puente seguro entre el proceso principal y las páginas de Electron.
 * El renderer NO tiene Node: solo estas funciones concretas.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  info: () => ipcRenderer.invoke('app:info'),
  obtenerConfig: () => ipcRenderer.invoke('config:obtener'),
  guardarConfig: (datos) => ipcRenderer.invoke('config:guardar', datos),
  probarServidor: (url) => ipcRenderer.invoke('servidor:probar', url),
  conectar: () => ipcRenderer.invoke('app:conectar'),
  reintentar: () => ipcRenderer.invoke('ventana:reintentar'),
  abrirConfig: () => ipcRenderer.invoke('ventana:config'),
  reiniciar: () => ipcRenderer.invoke('app:reiniciar'),
  alActualizarOffline: (callback) => {
    const manejador = (_evento, datos) => callback(datos);
    ipcRenderer.on('offline:actualizar', manejador);
    return () => ipcRenderer.removeListener('offline:actualizar', manejador);
  }
});
