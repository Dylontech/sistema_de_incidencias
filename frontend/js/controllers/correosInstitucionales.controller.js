/** Controlador del directorio de correos institucionales. */
import { registrarAcciones } from '../core/eventos.js';
import { abrirModal, cerrarModal, preguntar, toast } from '../core/ui.js';
import { intentar } from '../core/errores.js';
import { store } from '../core/store.js';
import { sesion } from '../core/session.js';
import { correosInstitucionalesService } from '../services/correos-institucionales.service.js';
import * as vista from '../views/correosInstitucionales.view.js';

let pagina = 1;
let correos = [];
let invitacionId = null;

function filtros() {
  return {
    texto: document.getElementById('correosTexto')?.value || '',
    estado: document.getElementById('correosEstado')?.value || '',
    municipioId: document.getElementById('correosMunicipio')?.value || '',
    verificado: document.getElementById('correosVerificado')?.value || ''
  };
}

function llenarMunicipiosModal() {
  const selector = document.getElementById('correoInstitucionalMunicipio');
  if (!selector || selector.dataset.cargado === 'si') return;
  selector.innerHTML =
    '<option value="">Sin municipio (estatal)</option>' +
    (store.estado.municipios || [])
      .map((m) => `<option value="${m.id}">${m.nombre} — ${m.estado}</option>`)
      .join('');
  selector.dataset.cargado = 'si';
}

export async function cargar(destino = pagina) {
  pagina = Math.max(Number(destino) || 1, 1);
  if (!document.getElementById('correosMunicipio')?.dataset.cargado) {
    vista.renderMunicipios(store.estado.municipios || []);
    vista.renderEstados(store.estado.municipios || []);
    const selector = document.getElementById('correosMunicipio');
    if (selector) selector.dataset.cargado = 'si';
  }
  const consulta = filtros();
  const [lista, busquedas] = await Promise.all([
    correosInstitucionalesService.listar({ ...consulta, pagina, limite: 50 }),
    correosInstitucionalesService.busquedas(consulta.municipioId || null)
  ]);
  correos = lista.correos || [];
  vista.renderLista(correos, {
    total: lista.total || 0,
    pagina: lista.pagina || pagina,
    limite: lista.limite || 50
  });
  vista.renderBusquedas(busquedas);
}

export function registrar() {
  registrarAcciones({
    'correos:cargar': () => intentar(() => cargar()),

    'correos:buscar': () => intentar(() => cargar(1)),
    'correos:limpiar': () =>
      intentar(async () => {
        for (const id of ['correosTexto', 'correosEstado', 'correosMunicipio', 'correosVerificado']) {
          const campo = document.getElementById(id);
          if (campo) campo.value = '';
        }
        await cargar(1);
      }),
    'correos:pagina': ({ valor }) => intentar(() => cargar(valor)),

    'correos:nuevo': () => {
      if (!sesion.esAdmin()) return toast('Solo el administrador maestro gestiona el directorio', 'err');
      llenarMunicipiosModal();
      vista.llenarFormulario(null);
      abrirModal('modalCorreoInstitucional', { nested: true });
    },

    'correos:editar': ({ id }) => {
      const correo = correos.find((c) => c.id === id);
      if (!correo) return;
      llenarMunicipiosModal();
      vista.llenarFormulario(correo);
      abrirModal('modalCorreoInstitucional', { nested: true });
    },

    'correos:guardar': () =>
      intentar(async () => {
        const id = document.getElementById('correoInstitucionalId')?.value || '';
        const datos = {
          correo: document.getElementById('correoInstitucionalCorreo')?.value || '',
          estado: document.getElementById('correoInstitucionalEstado')?.value || '',
          municipioId: document.getElementById('correoInstitucionalMunicipio')?.value || null,
          dependencia: document.getElementById('correoInstitucionalDependencia')?.value || '',
          cargo: document.getElementById('correoInstitucionalCargo')?.value || '',
          telefono: document.getElementById('correoInstitucionalTelefono')?.value || '',
          fuenteUrl: document.getElementById('correoInstitucionalFuente')?.value || '',
          notas: document.getElementById('correoInstitucionalNotas')?.value || '',
          verificado: document.getElementById('correoInstitucionalVerificado')?.checked === true
        };
        if (id) await correosInstitucionalesService.actualizar(id, datos);
        else await correosInstitucionalesService.crear(datos);
        cerrarModal('modalCorreoInstitucional');
        toast(id ? 'Correo actualizado' : 'Correo registrado', 'ok');
        await cargar(1);
      }),

    'correos:eliminar': ({ id }) =>
      intentar(async () => {
        if (!(await preguntar('¿Eliminar este correo del directorio?'))) return;
        await correosInstitucionalesService.eliminar(id);
        toast('Correo eliminado', 'ok');
        await cargar(1);
      }),

    'correos:asignarClave': ({ id }) =>
      intentar(async () => {
        const resultado = await correosInstitucionalesService.asignarClave(id);
        const codigo = document.getElementById('claveGeneradaCodigo');
        const nota = document.getElementById('claveGeneradaNota');
        if (codigo) codigo.textContent = resultado.clave?.codigo || '—';
        if (nota) {
          nota.textContent = resultado.creada
            ? 'Se creó la clave del municipio con este correo como contacto.'
            : 'El correo quedó asignado a la clave activa del municipio.';
        }
        abrirModal('modalClaveGenerada');
        toast(
          resultado.creada ? 'Clave municipal creada y correo asignado' : 'Correo asignado a la clave',
          'ok'
        );
      }),

    'correos:exportar': () =>
      intentar(() => correosInstitucionalesService.exportar(filtros())),

    'correos:abrirImportar': () => {
      const area = document.getElementById('correosImportarTexto');
      if (area) area.value = '';
      abrirModal('modalImportarCorreos', { nested: true });
    },
    'correos:importar': () =>
      intentar(async () => {
        const csv = document.getElementById('correosImportarTexto')?.value || '';
        const resultado = await correosInstitucionalesService.importar(csv);
        cerrarModal('modalImportarCorreos');
        toast(
          `Importados ${resultado.creados} de ${resultado.total} correos` +
            (resultado.errores.length ? ` · ${resultado.errores.length} con error` : ''),
          resultado.errores.length ? 'err' : 'ok'
        );
        await cargar(1);
      }),

    'correos:invitar': () => {
      invitacionId = null;
      const asunto = document.getElementById('correosInvitacionAsunto');
      const mensaje = document.getElementById('correosInvitacionMensaje');
      if (asunto) asunto.value = 'Invitación al Sistema de Incidencias Municipales';
      if (mensaje) mensaje.value = 'Te invitamos a conocer el sistema y a registrar un canal de contacto para la ciudadanía.';
      abrirModal('modalInvitarCorreos', { nested: true });
    },
    'correos:invitar-uno': ({ id }) => {
      invitacionId = id;
      const asunto = document.getElementById('correosInvitacionAsunto');
      const mensaje = document.getElementById('correosInvitacionMensaje');
      if (asunto) asunto.value = 'Invitación al Sistema de Incidencias Municipales';
      if (mensaje) mensaje.value = 'Te invitamos a conocer el sistema y a registrar un canal de contacto para la ciudadanía.';
      abrirModal('modalInvitarCorreos', { nested: true });
    },
    'correos:confirmarInvitacion': () =>
      intentar(async () => {
        const resultado = await correosInstitucionalesService.invitar({
          ids: invitacionId ? [invitacionId] : undefined,
          ...filtros(),
          asunto: document.getElementById('correosInvitacionAsunto')?.value || '',
          mensaje: document.getElementById('correosInvitacionMensaje')?.value || ''
        });
        cerrarModal('modalInvitarCorreos');
        toast(
          `Invitaciones: ${resultado.enviados} enviadas` +
            (resultado.simulados ? ` · ${resultado.simulados} simuladas` : ''),
          'ok'
        );
        invitacionId = null;
        await cargar();
      })
  });
}
