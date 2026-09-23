/**
 * Punto de entrada del frontend.
 *
 * Une todas las piezas: conecta la delegación de eventos, registra las
 * acciones de cada controlador, restaura la sesión si existe y arranca la
 * aplicación (o muestra el login).
 */
import { conectarDelegacion } from './core/eventos.js';
import { inicializarModales, loading, toast } from './core/ui.js';
import { sesion } from './core/session.js';
import { authService } from './services/auth.service.js';
import * as aplicacion from './core/aplicacion.js';
import * as mapa from './map/mapa.js';
import * as loginView from './views/login.view.js';
import { registrar as registrarAuth } from './controllers/auth.controller.js';
import { registrar as registrarIncidencias } from './controllers/incidencias.controller.js';
import { registrar as registrarTipos } from './controllers/tipos.controller.js';
import { registrar as registrarAdmin } from './controllers/admin.controller.js';
import { registrar as registrarReportes } from './controllers/reportes.controller.js';
import {
  registrar as registrarNotificaciones,
  conectarCierreExterno
} from './controllers/notificaciones.controller.js';

function registrarControladores() {
  registrarAuth();
  registrarIncidencias();
  registrarTipos();
  registrarAdmin();
  registrarReportes();
  registrarNotificaciones();
}

/** Intenta reanudar la sesión guardada en sessionStorage. */
async function restaurarSesion() {
  const guardada = sesion.cargar();
  if (!guardada) {
    loginView.mostrarLogin();
    return;
  }

  loading(true, 'Restaurando sesión…');
  try {
    const { usuario, municipioActivo } = await authService.yo();
    await aplicacion.arrancar({ usuario, municipioActivo });
  } catch (error) {
    // Token caducado o servidor no disponible: se vuelve al login.
    sesion.limpiar();
    loginView.mostrarLogin();
    if (error.estado !== 401) {
      toast(error.message || 'No se pudo restaurar la sesión', 'err');
    }
  } finally {
    loading(false);
  }
}

async function iniciar() {
  registrarControladores();
  conectarDelegacion();
  conectarCierreExterno();
  inicializarModales({
    // Mientras se elige una ubicación en el mapa, el fondo del modal no lo cierra.
    alIntentarCerrar: (id) => !(id === 'modalIncidencia' && mapa.modoElegirActivo())
  });

  // El token caducó en mitad de la sesión: se avisa y se recarga.
  document.addEventListener('sesion-expirada', () => {
    toast('Tu sesión expiró, vuelve a iniciar sesión', 'err');
    sesion.limpiar();
    setTimeout(() => location.reload(), 1200);
  });

  await restaurarSesion();
}

document.addEventListener('DOMContentLoaded', iniciar);
