/**
 * CONTROLADOR: tutorial guiado para quien entra por primera vez.
 *
 * Recorre los elementos de la interfaz con un foco y una tarjeta que los
 * explica. Los pasos se arman según el rol (el funcionario no cambia de
 * municipio, el personal tiene panel e informes) y se saltan solos los que
 * apunten a algo que no está en pantalla, así que la guía nunca señala al vacío.
 *
 * Se muestra una vez por versión y dispositivo (`localStorage`), igual que la
 * aceptación de términos, y se puede volver a ver con el botón «¿Cómo funciona?».
 */
import { registrarAcciones } from '../core/eventos.js';
import { $ } from '../core/utils.js';
import { sesion } from '../core/session.js';
import * as vista from '../views/tutorial.view.js';
import * as loginView from '../views/login.view.js';
import * as mapa from '../map/mapa.js';

const CLAVE = 'inc_tutorial_v1';

/** Súbela al cambiar los pasos: el tutorial se vuelve a mostrar una vez. */
export const VERSION_TUTORIAL = '2026-09-25';

/** Pasos de la guía, en orden. */
function pasosDe(usuario) {
  const rol = usuario?.rol || 'anonimo';
  const esEmpleado = rol === 'funcionario' || rol === 'admin';
  const cambiaDeMunicipio = rol !== 'funcionario';

  const pasos = [
    {
      centrado: true,
      titulo: '¡Bienvenido!',
      texto:
        'En menos de un minuto te enseño lo que puedes hacer aquí. Puedes salir con «Saltar» y volver a verlo cuando quieras.'
    }
  ];

  if (cambiaDeMunicipio) {
    pasos.push(
      {
        objetivo: '#municipioBuscar',
        colocacion: 'abajo',
        titulo: 'Tu municipio',
        texto:
          'Escribe aquí para buscar y cambiar de municipio. Verás los reportes del que tengas activo.'
      },
      {
        objetivo: '#colindantesBox',
        colocacion: 'derecha',
        titulo: 'Municipios vecinos',
        texto:
          'Estos botones te llevan a los municipios que colindan con el activo, para seguir los problemas de la zona.'
      }
    );
  }

  pasos.push(
    {
      objetivo: '.filters',
      colocacion: 'derecha',
      titulo: 'Filtros',
      texto:
        'Busca por texto y filtra por estado, tipo, color (antigüedad) o comunidad para encontrar lo que te interesa.'
    },
    {
      objetivo: '#listaIncidencias',
      colocacion: 'derecha',
      titulo: 'Los reportes del municipio',
      texto:
        'Aquí aparece todo lo que ha reportado la gente. Toca cualquier tarjeta para ver el detalle, los comentarios y el seguimiento.'
    },
    {
      objetivo: '#map',
      colocacion: 'dentro-abajo',
      titulo: 'El mapa',
      texto:
        'Cada punto es un reporte y su color dice la antigüedad: amarillo menos de 15 días, naranja de 15 a 30 y rojo más de 30; verde si ya se resolvió. Arriba a la derecha cambias de capa (satélite, calles, relieve).'
    },
    {
      objetivo: '.fab.primary',
      colocacion: 'izquierda',
      titulo: 'Reportar es el botón +',
      texto:
        'Elige el tipo, describe el problema, marca la ubicación en el mapa y adjunta fotografías. Antes de enviar decides si firmas con tu nombre o lo publicas como anónimo.'
    },
    {
      objetivo: '[data-action="notificaciones:toggle"]',
      colocacion: 'abajo',
      titulo: 'Tus avisos',
      texto: esEmpleado
        ? 'En la campana llegan los avisos del municipio: reportes críticos por antigüedad y tu actividad.'
        : 'En la campana verás si tu reporte cambió de estado, si lo resolvieron o si alguien lo comentó.'
    }
  );

  if (esEmpleado) {
    pasos.push(
      {
        objetivo: '#btn-admin',
        colocacion: 'abajo',
        titulo: 'Panel de administración',
        texto:
          'Desde el panel gestionas las incidencias, los tipos, las comunidades, las cuentas del personal y la importación de datos.'
      },
      {
        objetivo: '#btn-informes',
        colocacion: 'abajo',
        titulo: 'Informes',
        texto:
          'Informes reúne las estadísticas y la exportación: informe imprimible y respaldo en JSON.'
      }
    );
  } else {
    pasos.push({
      objetivo: '#notaCuenta',
      colocacion: 'derecha',
      titulo: rol === 'ciudadano' ? 'Tu cuenta' : 'Crea tu cuenta',
      texto:
        rol === 'ciudadano'
          ? 'Con tu cuenta recibes los avisos de tus reportes y puedes editarlos. Sigues pudiendo publicar sin mostrar tu nombre.'
          : 'Como anónimo puedes reportar, pero no recibes avisos. Crea una cuenta (correo y contraseña) y sabrás si tu reporte se atendió, aunque lo firmes como anónimo.'
    });
  }

  pasos.push({
    centrado: true,
    titulo: '¡Listo!',
    texto:
      'Ya sabes lo básico. Puedes repetir esta guía cuando quieras con «¿Cómo funciona?» en el panel lateral.'
  });

  // Si un paso apunta a algo que no está en pantalla (por ejemplo, un municipio
  // sin vecinos), se salta: la guía nunca señala al vacío.
  return pasos.filter((paso) => !paso.objetivo || document.querySelector(paso.objetivo));
}

let pasos = [];
let indice = 0;

/** ¿Ya se vio esta versión del tutorial en este dispositivo? */
export function visto() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) || 'null')?.version === VERSION_TUTORIAL;
  } catch {
    return false;
  }
}

function marcarVisto() {
  localStorage.setItem(
    CLAVE,
    JSON.stringify({ version: VERSION_TUTORIAL, fecha: new Date().toISOString() })
  );
}

/** La barra lateral puede estar recogida: se despliega si el paso apunta dentro. */
function asegurarObjetivoVisible(selector) {
  if (!selector) return;
  const enSidebar = document.querySelector(selector)?.closest('#sidebar');
  if (enSidebar && $('sidebar')?.classList.contains('collapsed')) {
    loginView.alternarSidebar();
    mapa.invalidarTamano();
  }
}

function pintar() {
  const paso = pasos[indice];
  asegurarObjetivoVisible(paso.objetivo);
  vista.renderizar({ paso, indice, total: pasos.length });
}

/** Abre la guía desde el principio. */
export function abrir() {
  if (!$('app')?.classList.contains('active')) return false;
  if ($('onboarding')?.style.display === 'flex') return false;

  pasos = pasosDe(sesion.usuario);
  if (pasos.length < 2) return false;

  indice = 0;
  pintar();
  return true;
}

/** Se muestra sola la primera vez (una vez por versión y dispositivo). */
export function quizáMostrar() {
  if (visto()) return false;
  return abrir();
}

function cerrar() {
  marcarVisto();
  vista.ocultar();
}

function siguiente() {
  if (indice >= pasos.length - 1) {
    cerrar();
    return;
  }
  indice++;
  pintar();
}

function anterior() {
  if (indice === 0) return;
  indice--;
  pintar();
}

export function registrar() {
  registrarAcciones({
    'tutorial:abrir': () => abrir(),
    'tutorial:siguiente': () => siguiente(),
    'tutorial:anterior': () => anterior(),
    'tutorial:saltar': () => cerrar()
  });

  // Teclado: flechas para moverse, Escape para salir.
  document.addEventListener('keydown', (evento) => {
    if (!vista.visible()) return;
    if (evento.key === 'ArrowRight' || evento.key === 'Enter') {
      evento.preventDefault();
      siguiente();
    } else if (evento.key === 'ArrowLeft') {
      evento.preventDefault();
      anterior();
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      cerrar();
    }
  });

  // Al cambiar el tamaño (o girar el móvil) el foco se vuelve a colocar.
  window.addEventListener('resize', () => vista.recolocar());
}
