/**
 * Controlador del paso previo: municipio + términos.
 *
 * `pedir()` devuelve una promesa que se resuelve cuando el usuario termina el
 * paso (o `null` si no había nada que preguntar), para que el arranque espere
 * sin mostrar la aplicación a medias.
 */
import { registrarAcciones } from '../core/eventos.js';
import { loading, toast } from '../core/ui.js';
import { consentimiento } from '../core/consentimiento.js';
import { catalogosService } from '../services/catalogos.service.js';
import * as vista from '../views/onboarding.view.js';

/** Catálogo de municipios (se pide una vez por carga de página). */
let municipios = [];
/** ¿Queda por aceptar esta versión de los términos? */
let pendienteTerminos = false;
/** Resuelve la promesa de `pedir()`. */
let resolver = null;

async function cargarMunicipios() {
  if (municipios.length) return municipios;
  const { municipios: lista } = await catalogosService.municipios();
  municipios = lista || [];
  return municipios;
}

/**
 * Muestra el paso previo si hace falta.
 *
 * El funcionario está atado a su municipio (no se le pregunta); a los demás se
 * les pide el municipio en cada entrada **sin preseleccionar ninguno**: elegir
 * el municipio es una decisión explícita del usuario. Los términos solo se
 * piden una vez por versión y dispositivo.
 */
export async function pedir({ usuario, soloTerminos = false, municipioSugerido = null } = {}) {
  const conMunicipio = !soloTerminos && usuario?.rol !== 'funcionario';
  // El servidor manda: si publicó una versión nueva, la aceptación local deja
  // de ser suficiente y hay que volver a leer y aceptar.
  await consentimiento.cargarEstado();
  pendienteTerminos = !consentimiento.vigente();
  // El municipio elegido se recuerda en el dispositivo: si ya está guardado y
  // los términos siguen vigentes, no se vuelve a preguntar en cada visita (se
  // puede cambiar desde la barra superior). Así la vista principal queda
  // disponible de inmediato, también para quien entra como anónimo.
  const recordado = consentimiento.municipioId();
  if (conMunicipio) await cargarMunicipios();
  const sugerido = municipioSugerido
    ? municipios.find((municipio) => String(municipio.id) === String(municipioSugerido)) || null
    : null;
  if (!pendienteTerminos && (soloTerminos || !conMunicipio || recordado || sugerido)) {
    if (sugerido && !recordado) consentimiento.guardar({ municipioId: sugerido.id });
    return sugerido ? { municipioId: sugerido.id, municipio: sugerido } : null;
  }

  vista.marcarAceptado(false);
  vista.renderTerminos(consentimiento.documentos());
  // El municipio del QR/ubicación tiene prioridad sobre el recordado.
  vista.renderMunicipios(municipios, sugerido?.id || recordado);
  vista.mostrar({ conMunicipio });
  loading(false); // el paso previo trae su propia presentación

  return new Promise((resolverPromesa) => {
    resolver = resolverPromesa;
  });
}

/** Cierra el paso y devuelve el municipio elegido (o null si no aplica). */
function terminar({ municipioId } = {}) {
  const id = municipioId === undefined ? vista.valorMunicipio() : municipioId;
  const municipio = municipios.find((m) => m.id === id) || null;
  vista.ocultar();

  const listo = resolver;
  resolver = null;
  if (listo) listo({ municipioId: municipio?.id || null, municipio });
}

export function registrar() {
  registrarAcciones({
    /** Paso 1 → paso 2 (o al final, si los términos ya estaban aceptados). */
    'onboarding:continuar': () => {
      const id = vista.valorMunicipio();
      if (!id) return toast('Elige tu municipio para continuar', 'err');
      if (pendienteTerminos) return vista.paso('terminos');
      consentimiento.guardar({ municipioId: id });
      terminar({ municipioId: id });
    },

    /** Aceptación de los términos: se registra primero en el servidor. */
    'onboarding:aceptar': async () => {
      if (!vista.aceptado()) return toast('Marca la casilla para aceptar los términos', 'err');
      if (!consentimiento.documentos().length) {
        return toast('No se pudieron cargar los términos publicados. Revisa tu conexión.', 'err');
      }
      loading(true, 'Registrando aceptación…');
      try {
        await consentimiento.aceptar({ municipioId: vista.valorMunicipio() || null });
        pendienteTerminos = false;
        terminar({ municipioId: vista.valorMunicipio() || null });
      } catch (error) {
        vista.renderTerminos(consentimiento.documentos());
        toast(error.message || 'No se pudo registrar la aceptación', 'err');
      } finally {
        loading(false);
      }
    },

    'onboarding:volver': () => vista.paso('municipio'),

    /** La lectura posterior se hace en el modal legal, no en otro onboarding. */
    'onboarding:cerrar': () => {
      if (pendienteTerminos) return;
      vista.ocultar();
    }
  });
}
