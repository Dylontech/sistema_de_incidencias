/**
 * Controlador de moderación.
 *
 * Cubre los dos lados:
 *  - **denunciar** (cualquier sesión): el modal pide el motivo de la lista
 *    cerrada y un detalle opcional.
 *  - **moderar** (personal): la cola de denuncias, el ocultamiento de
 *    publicaciones y comentarios, y las advertencias o suspensiones de cuenta.
 *
 * Todas las decisiones que llevan motivo usan el mismo modal (`#modalModeracion`)
 * para no depender de `window.prompt`, que no está disponible en todos los
 * navegadores (ni en la vista embebida del editor).
 */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, modalAbierto, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { $ } from '../core/utils.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { moderacionService } from '../services/moderacion.service.js';
import * as aplicacion from '../core/aplicacion.js';
import { abrirDesdePanel } from './incidencias.controller.js';

/** Qué se está moderando y con qué acción (se confirma en el modal). */
let decision = null;

/** Motivo y contexto de la denuncia que se está escribiendo. */
let denunciaPendiente = null;

const TEXTOS_DECISION = {
  descartar: {
    titulo: 'Descartar la denuncia',
    nota: 'El contenido se queda como está y quien denunció recibe el aviso de que se revisó.',
    confirmar: 'Descartar denuncia',
    motivo: false
  },
  ocultar: {
    titulo: 'Ocultar el contenido denunciado',
    nota: 'Dejará de verse en el listado y el mapa. Su autor y el personal siguen viéndolo.',
    confirmar: 'Ocultar contenido',
    motivo: true
  },
  eliminar: {
    titulo: 'Eliminar el contenido denunciado',
    nota: 'Es irreversible: se borra el reporte con sus comentarios y su evidencia.',
    confirmar: 'Eliminar definitivamente',
    motivo: true
  },
  advertir: {
    titulo: 'Advertir al autor',
    nota: 'Suma una advertencia a su cuenta. Con tres, la cuenta queda suspendida sola.',
    confirmar: 'Enviar advertencia',
    motivo: true
  },
  suspender: {
    titulo: 'Suspender la cuenta del autor',
    nota: 'No podrá entrar, reportar ni comentar. Sus publicaciones sin resolver se ocultan.',
    confirmar: 'Suspender cuenta',
    motivo: true,
    conFecha: true
  },
  mostrar: {
    titulo: 'Volver a mostrar la publicación',
    nota: 'Vuelve al listado público y su autor recibe el aviso.',
    confirmar: 'Volver a mostrar',
    motivo: false
  },
  comentarioOcultar: {
    titulo: 'Ocultar el comentario',
    nota: 'Deja de verse el texto (su autor y el personal lo siguen leyendo).',
    confirmar: 'Ocultar comentario',
    motivo: true
  },
  comentarioMostrar: {
    titulo: 'Volver a mostrar el comentario',
    nota: 'El texto vuelve a ser visible para todo el municipio.',
    confirmar: 'Volver a mostrar',
    motivo: false
  }
};

/** Rellena el modal común de decisiones y lo abre encima de lo que haya. */
function abrirDecision(datos) {
  const texto = TEXTOS_DECISION[datos.clave] || TEXTOS_DECISION.descartar;
  decision = { ...datos, accion: datos.accion || datos.clave };

  const titulo = $('moderacionTitulo');
  if (titulo) titulo.textContent = texto.titulo;
  const nota = $('moderacionNota');
  if (nota) nota.textContent = texto.nota;
  const confirmar = $('moderacionConfirmar');
  if (confirmar) confirmar.textContent = texto.confirmar;

  const campo = $('moderacionMotivo');
  if (campo) {
    campo.value = '';
    campo.required = texto.motivo === true;
  }
  const cajaMotivo = $('moderacionMotivoBox');
  if (cajaMotivo) cajaMotivo.hidden = texto.motivo !== true;

  const cajaFecha = $('moderacionFechaBox');
  if (cajaFecha) cajaFecha.hidden = texto.conFecha !== true;
  const indefinida = $('moderacionIndefinida');
  if (indefinida) indefinida.checked = true;
  const hasta = $('moderacionHasta');
  if (hasta) hasta.value = '';

  abrirModal('modalModeracion', { nested: true });
}

/** Fecha de fin de la suspensión: `null` cuando es indefinida. */
function fechaDeSuspension() {
  if ($('moderacionIndefinida')?.checked) return null;
  const valor = $('moderacionHasta')?.value || '';
  return valor ? new Date(`${valor}T23:59:59`).toISOString() : null;
}

/** Vuelve a pintar todo lo que cambia tras moderar. */
async function refrescarModeracion({ incidenciaId = null } = {}) {
  await aplicacion.recargarIncidencias();
  if (sesion.esEmpleado()) {
    await aplicacion.cargarEstadisticas();
    await aplicacion.cargarModeracion();
  }
  if (incidenciaId && modalAbierto('modalDetalle')) {
    await abrirDesdePanel(incidenciaId, { nested: true });
  }
}

/** Opciones del selector de motivos de denuncia (llegan del catálogo). */
function rellenarMotivos() {
  const select = $('denunciaMotivo');
  if (!select) return;
  const motivos = store.estado.catalogos.motivosDenuncia || {};
  const actual = select.dataset.cargado;
  if (actual === 'si') return;
  select.innerHTML = Object.entries(motivos)
    .map(([valor, etiqueta]) => `<option value="${valor}">${etiqueta}</option>`)
    .join('');
  select.dataset.cargado = 'si';
}

export function registrar() {
  registrarAcciones({
    /* ----------------------------- denunciar ----------------------------- */

    /** Abre el formulario de denuncia (con `valor` = id del comentario). */
    'denuncia:abrir': ({ id, valor }) => {
      if (!sesion.datos?.usuario && !store.estado.usuario) {
        toast('Necesitas una sesión para denunciar', 'err');
        return;
      }
      rellenarMotivos();
      denunciaPendiente = { incidenciaId: id, comentarioId: valor || null };
      const nota = $('denunciaObjetivo');
      if (nota) {
        nota.textContent = valor
          ? 'Estás denunciando un comentario de este reporte.'
          : 'Estás denunciando este reporte.';
      }
      const detalle = $('denunciaDetalle');
      if (detalle) detalle.value = '';
      abrirModal('modalDenuncia', { nested: true });
    },

    'denuncia:confirmar': () =>
      intentar(async () => {
        if (!denunciaPendiente) {
          toast('No se seleccionó qué denunciar', 'err');
          return;
        }
        const motivo = $('denunciaMotivo')?.value || '';
        if (!motivo) {
          toast('Elige un motivo', 'err');
          return;
        }
        const detalle = ($('denunciaDetalle')?.value || '').trim();

        const { incidenciaId, comentarioId } = denunciaPendiente;
        denunciaPendiente = null;
        cerrarModal('modalDenuncia');

        await moderacionService.denunciar(incidenciaId, { motivo, detalle, comentarioId });
        toast('Denuncia enviada. El personal del municipio la revisará.', 'ok');
        await aplicacion.recargarNotificaciones();
      }),

    /* ---------------------------- cola de trabajo ------------------------ */

    /** Decide sobre una denuncia concreta (la acción llega en `valor`). */
    'moderacion:decidir': ({ id, valor }) => {
      if (!sesion.esEmpleado()) {
        toast('Solo el personal puede moderar', 'err');
        return;
      }
      const grupo = (store.estado.gruposDenuncia || []).find((g) =>
        (g.denuncias || []).some((d) => d.id === id)
      );
      abrirDecision({
        clave: valor,
        accion: valor,
        tipo: 'cola',
        denunciaId: id,
        incidenciaId: grupo?.incidenciaId || null,
        comentarioId: grupo?.comentarioId || null
      });
    },

    /* ------------------------------- contenido --------------------------- */

    /** Oculta o vuelve a mostrar una publicación (`valor`: ocultar | mostrar). */
    'moderacion:ocultar': ({ id, valor }) => {
      if (!sesion.esEmpleado()) {
        toast('Solo el personal puede ocultar publicaciones', 'err');
        return;
      }
      const oculta = valor !== 'mostrar';
      abrirDecision({
        clave: oculta ? 'ocultar' : 'mostrar',
        accion: oculta ? 'ocultar' : 'mostrar',
        tipo: 'contenido',
        incidenciaId: id
      });
    },

    /** Oculta o vuelve a mostrar un comentario (`id`: incidencia:comentario). */
    'moderacion:comentario': ({ id, valor }) => {
      if (!sesion.esEmpleado()) {
        toast('Solo el personal puede ocultar comentarios', 'err');
        return;
      }
      const [incidenciaId, comentarioId] = String(id).split(':');
      const ocultar = valor !== 'mostrar';
      abrirDecision({
        clave: ocultar ? 'comentarioOcultar' : 'comentarioMostrar',
        accion: ocultar ? 'ocultar' : 'mostrar',
        tipo: 'comentario',
        incidenciaId,
        comentarioId
      });
    },

    /* -------------------------------- cuentas ---------------------------- */

    /** Advierte al autor del reporte abierto en el detalle. */
    'moderacion:advertir': ({ id }) => {
      if (!sesion.esEmpleado()) {
        toast('Solo el personal puede advertir', 'err');
        return;
      }
      abrirDecision({ clave: 'advertir', accion: 'advertir', tipo: 'advertir', incidenciaId: id });
    },

    /** Suspende una cuenta (`id` = username). */
    'moderacion:suspender': ({ id }) => {
      if (!sesion.esEmpleado()) {
        toast('Solo el personal puede suspender cuentas', 'err');
        return;
      }
      abrirDecision({ clave: 'suspender', accion: 'suspender', tipo: 'suspender', username: id });
    },

    /** Levanta la suspensión (sin diálogo nativo: no es destructivo). */
    'moderacion:reactivar': ({ id }) =>
      intentar(async () => {
        if (!sesion.esEmpleado()) {
          toast('Solo el personal puede reactivar cuentas', 'err');
          return;
        }
        const { cuenta } = await moderacionService.reactivar(id);
        toast(`Cuenta de ${cuenta.nombre} reactivada. Sus advertencias vuelven a 0.`, 'ok');
        await refrescarModeracion();
      }),

    /* ------------------------- confirmar la decisión ---------------------- */

    'moderacion:confirmar': () =>
      intentar(async () => {
        if (!decision) {
          toast('No hay ninguna decisión pendiente', 'err');
          return;
        }
        const pendiente = decision;
        decision = null;

        const motivo = ($('moderacionMotivo')?.value || '').trim();
        const conMotivo = TEXTOS_DECISION[pendiente.clave]?.motivo === true;
        if (conMotivo && !motivo) {
          decision = pendiente;
          toast('Escribe el motivo', 'err');
          return;
        }

        cerrarModal('modalModeracion');

        if (pendiente.tipo === 'cola') {
          const resultado = await moderacionService.resolver(pendiente.denunciaId, {
            accion: pendiente.accion,
            motivo,
            hasta: pendiente.accion === 'suspender' ? fechaDeSuspension() : null
          });
          toast(
            pendiente.accion === 'descartar'
              ? 'Denuncia descartada'
              : `Decisión aplicada (${resultado.cerradas} ${
                  resultado.cerradas === 1 ? 'denuncia cerrada' : 'denuncias cerradas'
                })`,
            'ok'
          );
        } else if (pendiente.tipo === 'contenido') {
          const { incidencia } = await moderacionService.ocultar(pendiente.incidenciaId, {
            oculta: pendiente.accion === 'ocultar',
            motivo
          });
          toast(incidencia.oculta ? 'Publicación ocultada' : 'La publicación vuelve a mostrarse', 'ok');
        } else if (pendiente.tipo === 'comentario') {
          await moderacionService.ocultarComentario(pendiente.incidenciaId, pendiente.comentarioId, {
            oculto: pendiente.accion === 'ocultar',
            motivo
          });
          toast(pendiente.accion === 'ocultar' ? 'Comentario ocultado' : 'El comentario vuelve a verse', 'ok');
        } else if (pendiente.tipo === 'advertir') {
          const resultado = await moderacionService.advertir(pendiente.incidenciaId, { motivo });
          toast(
            resultado.suspendida
              ? `⚠️ ${resultado.aviso}`
              : `⚠️ Advertencia enviada (${resultado.advertencias}/3)`,
            'ok'
          );
        } else if (pendiente.tipo === 'suspender') {
          const { cuenta, ocultas } = await moderacionService.suspender(pendiente.username, {
            motivo,
            hasta: fechaDeSuspension()
          });
          toast(
            `Cuenta de ${cuenta.nombre} suspendida${
              ocultas ? ` · ${ocultas} ${ocultas === 1 ? 'publicación oculta' : 'publicaciones ocultas'}` : ''
            }`,
            'ok'
          );
        }

        await refrescarModeracion({ incidenciaId: pendiente.incidenciaId });
      }),

    /** Abre la publicación desde la cola, encima del panel. */
    'moderacion:ver': ({ id }) => abrirDesdePanel(id, { nested: true })
  });
}
