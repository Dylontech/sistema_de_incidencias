/** Controlador de campañas de promoción por correo (solo administrador). */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, loading, preguntar, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { campanasService } from '../services/campanas.service.js';
import * as vista from '../views/campanas.view.js';
import { descargarBlob, htmlATexto, pendientesDe } from '../views/diseno-publicidad.js';

function nombreMunicipioSegmento() {
  const id = document.getElementById('campSegmentoMunicipio')?.value;
  const m = (store.estado.municipios || []).find((x) => String(x.id) === String(id));
  return m?.nombre || '';
}

let temporizadorCampanas = null;

/** Carga el resumen y la tabla. Se llama al abrir la pestaña y tras guardar. */
export async function cargar() {
  if (!sesion.esAdmin()) return;
  clearTimeout(temporizadorCampanas);
  const [resumen, lista] = await Promise.all([
    campanasService.resumen(),
    campanasService.listar()
  ]);
  vista.renderResumen(resumen);
  vista.renderTabla(lista.campanas || [], {
    municipios: store.estado.municipios || []
  });

  // Mientras haya un envío en curso, la tabla se refresca sola. El temporizador
  // se cancela al salir de la pestaña o cuando ya no queda nada pendiente.
  if ((lista.campanas || []).some((c) => c.estado === 'enviando')) {
    temporizadorCampanas = setTimeout(() => {
      if (document.getElementById('panel-publicidad')?.classList.contains('active')) {
        cargar().catch(() => {});
      }
    }, 6000);
  }
  return lista.campanas || [];
}

async function cargarSuscripciones(estado = '') {
  const { suscripciones } = await campanasService.suscripciones(estado || undefined);
  vista.renderSuscripciones(suscripciones || []);
  const tabla = document.getElementById('suscripcionesBody')?.closest('table');
  if (tabla) {
    tabla.classList.add('campanas-resaltado');
    tabla.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => tabla.classList.remove('campanas-resaltado'), 1800);
  }
}

export function registrar() {
  registrarAcciones({
    'campanas:recargar': () =>
      intentar(async () => {
        await cargar();
        toast('Campañas actualizadas');
      }),

    'campanas:suscripciones': () =>
      intentar(async () => {
        await cargarSuscripciones();
        toast('Listado de suscripciones actualizado');
      }),

    'campanas:nueva': () => {
      if (!sesion.esAdmin()) return toast('Solo un administrador puede crear campañas', 'err');
      vista.prepararModal({ municipios: store.estado.municipios || [] });
      abrirModal('modalCampana', { nested: true });
    },

    'campanas:editar': ({ valor: id }) =>
      intentar(async () => {
        loading(true, 'Abriendo campaña…');
        try {
          const { campana } = await campanasService.detalle(id);
          vista.prepararModal({
            campana,
            municipios: store.estado.municipios || []
          });
          abrirModal('modalCampana', { nested: true });
        } finally {
          loading(false);
        }
      }),

    'campanas:filtroSuscripciones': () =>
      intentar(async () => {
        const estado = document.getElementById('suscripcionesFiltro')?.value || '';
        await cargarSuscripciones(estado);
      }),

    'campanas:copiarEnlace': () =>
      intentar(async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/suscripcion`);
        toast('Enlace de suscripción copiado');
      }),

    'campanas:duplicar': ({ valor: id }) =>
      intentar(async () => {
        if (!sesion.esAdmin()) return toast('Solo un administrador puede crear campañas', 'err');
        loading(true, 'Copiando campaña…');
        try {
          const { campana } = await campanasService.detalle(id);
          vista.prepararModal({
            campana: {
              ...campana,
              id: '',
              estado: 'borrador',
              nombre: `${campana.nombre} (copia)`
            },
            municipios: store.estado.municipios || [],
            copia: true
          });
          abrirModal('modalCampana', { nested: true });
        } finally {
          loading(false);
        }
      }),

    'campanas:segmento': () => vista.actualizarSegmento(),

    'campanas:preview': () => {
      // Si la persona escribe a mano, el HTML deja de regenerarse solo.
      vista.marcarHtmlManual();
      vista.actualizarPreview();
    },

    'campanas:plantilla': () => {
      const clave = document.getElementById('campPlantilla')?.value || '';
      if (!clave) return;
      const t = vista.cargarPlantilla(clave, { municipio: nombreMunicipioSegmento() });
      if (!t) return;
      const asunto = document.getElementById('campAsunto');
      if (asunto && !asunto.value.trim()) asunto.value = t.asunto;
      vista.aplicarPlantilla();
      toast('Plantilla aplicada. Ajusta los textos a la derecha o abajo.');
    },

    // Cambios en los campos de la plantilla: regenera solo si el HTML vino de ella.
    'campanas:campos': () => {
      if (vista.htmlEsAutogenerado()) vista.aplicarPlantilla();
    },

    'campanas:aplicar': () => {
      if (!document.getElementById('campTitular')?.value.trim()) {
        return toast('Escribe un titular o elige una plantilla', 'err');
      }
      const html = document.getElementById('campHtml')?.value.trim();
      if (html && !vista.htmlEsAutogenerado()) {
        return preguntar('Esto reemplazará el HTML actual con la plantilla. ¿Continuar?').then((ok) => {
          if (ok) vista.aplicarPlantilla();
        });
      }
      vista.aplicarPlantilla();
    },

    'campanas:textoPlano': () => {
      const html = document.getElementById('campHtml')?.value || '';
      if (!html.trim()) return toast('Primero escribe o genera el contenido', 'err');
      document.getElementById('campTexto').value = htmlATexto(html);
      toast('Texto plano generado desde el HTML');
    },

    'campanas:vista': ({ valor: modo }) => vista.modoVista(modo),

    'campanas:copiarHtml': () =>
      intentar(async () => {
        const html = document.getElementById('campHtml')?.value || '';
        if (!html.trim()) return toast('No hay contenido que copiar', 'err');
        await navigator.clipboard.writeText(html);
        toast('HTML copiado');
      }),

    'campanas:descargarHtml': () => {
      const html = document.getElementById('campHtml')?.value || '';
      if (!html.trim()) return toast('No hay contenido que descargar', 'err');
      descargarBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), 'correo-campana.html');
    },

    'campanas:guardar': () =>
      intentar(async () => {
        if (!sesion.esAdmin()) return toast('Solo un administrador puede guardar campañas', 'err');
        const datos = vista.valoresForm();
        if (!datos.nombre) return toast('Escribe un nombre para la campaña', 'err');
        if (!datos.asunto) return toast('Escribe el asunto del correo', 'err');
        if (!datos.html.trim()) return toast('Escribe el contenido del correo', 'err');
        if (pendientesDe(datos.asunto, datos.html) && !(await preguntar('Quedan textos entre [corchetes] sin completar. ¿Guardar de todos modos?'))) {
          return;
        }
        if (datos.segmento.municipioId === '') {
          return toast('Elige el municipio del segmento', 'err');
        }
        if (datos.segmento.estado === '') {
          return toast('Elige el estado del segmento', 'err');
        }

        loading(true, 'Guardando campaña…');
        try {
          const respuesta = datos.id
            ? await campanasService.actualizar(datos.id, datos)
            : await campanasService.crear(datos);
          await cargar();
          const guardada = respuesta.campana || respuesta;
          vista.prepararModal({
            campana: guardada,
            municipios: store.estado.municipios || []
          });
          toast('Campaña guardada como borrador');
        } finally {
          loading(false);
        }
      }),

    'campanas:prueba': () =>
      intentar(async () => {
        const id = document.getElementById('campId')?.value;
        const correo = document.getElementById('campPruebaCorreo')?.value.trim();
        if (!id) return toast('Guarda la campaña antes de enviar la prueba', 'err');
        if (!correo) return toast('Escribe el correo de prueba', 'err');
        loading(true, 'Enviando prueba…');
        try {
          const resultado = await campanasService.prueba(id, correo);
          toast(
            resultado.simulado
              ? 'Prueba registrada (envío simulado: configura SMTP para enviarla de verdad)'
              : 'Correo de prueba enviado'
          );
        } finally {
          loading(false);
        }
      }),

    'campanas:enviar': () =>
      intentar(async () => {
        const id = document.getElementById('campId')?.value;
        if (!id) return toast('Guarda la campaña antes de enviarla', 'err');
        if (pendientesDe(document.getElementById('campAsunto')?.value, document.getElementById('campHtml')?.value)) {
          return toast('Hay textos entre [corchetes] sin completar: corrígelos y guarda antes de enviar', 'err');
        }
        if (
          !(await preguntar(
            'Se enviará la campaña a todos los suscriptores confirmados del segmento. No se puede deshacer. ¿Continuar?'
          ))
        ) {
          return;
        }
        loading(true, 'Preparando envío…');
        const boton = document.getElementById('btnCampEnviar');
        if (boton) boton.disabled = true;
        try {
          await campanasService.enviar(id);
          await cargar();
          toast('Envío iniciado. El progreso se ve en la tabla.');
          cerrarModal('modalCampana');
        } finally {
          if (boton) boton.disabled = false;
          loading(false);
        }
      }),

    'campanas:cerrar': () => cerrarModal('modalCampana')
  });
}
