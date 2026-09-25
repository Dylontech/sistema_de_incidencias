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
import {
  conectarCierreDePaneles,
  entrarComoCiudadano,
  registrar as registrarAuth
} from './controllers/auth.controller.js';
import { registrar as registrarIncidencias } from './controllers/incidencias.controller.js';
import { registrar as registrarTipos } from './controllers/tipos.controller.js';
import { registrar as registrarAdmin } from './controllers/admin.controller.js';
import { registrar as registrarReportes } from './controllers/reportes.controller.js';
import { registrar as registrarNotificaciones } from './controllers/notificaciones.controller.js';

function registrarControladores() {
  registrarAuth();
  registrarIncidencias();
  registrarTipos();
  registrarAdmin();
  registrarReportes();
  registrarNotificaciones();
}

/**
 * Arranque de la sesión.
 *
 * Como en la versión nueva del monolito, el público NO pasa por la pantalla de
 * acceso: si no hay sesión guardada se entra directamente como ciudadano
 * anónimo. La pantalla de acceso solo se abre con el botón «Personal».
 */
async function iniciarSesion() {
  const guardada = sesion.cargar();

  if (!guardada) {
    await entrarComoCiudadano({ silencioso: true });
    return;
  }

  loading(true, 'Restaurando sesión…');
  try {
    const { usuario, municipioActivo } = await authService.yo();
    // El municipio elegido en la barra superior se conserva entre recargas
    // (si sigue existiendo: `arrancar` lo valida). Un funcionario está atado al
    // suyo, así que para él manda el que devuelve el servidor.
    const elegido = usuario.rol === 'funcionario' ? municipioActivo : guardada.municipioActivo;
    await aplicacion.arrancar({ usuario, municipioActivo: elegido || municipioActivo });
  } catch (error) {
    // Token caducado o servidor no disponible: se entra como ciudadano en
    // lugar de dejar la pantalla bloqueada.
    sesion.limpiar();
    await entrarComoCiudadano({ silencioso: true });
    if (error.estado && error.estado !== 401) {
      toast(error.message || 'No se pudo restaurar la sesión', 'err');
    }
  } finally {
    loading(false);
  }
}

async function iniciar() {
  registrarControladores();
  conectarDelegacion();
  conectarCierreDePaneles();
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

  await iniciarSesion();
}

document.addEventListener('DOMContentLoaded', iniciar);
