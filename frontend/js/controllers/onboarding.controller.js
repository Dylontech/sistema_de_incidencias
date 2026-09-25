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
 * les pide el municipio en cada entrada, con el último preseleccionado. Los
 * términos solo se piden una vez por versión y dispositivo.
 */
export async function pedir({ usuario, municipioActivo } = {}) {
  const conMunicipio = usuario?.rol !== 'funcionario';
  pendienteTerminos = !consentimiento.vigente();
  if (!conMunicipio && !pendienteTerminos) return null;

  if (conMunicipio) await cargarMunicipios();
  vista.marcarAceptado(false);
  vista.renderMunicipios(municipios, consentimiento.municipioId() || municipioActivo?.id || null);
  vista.mostrar({ conMunicipio });
  loading(false); // el paso previo trae su propia presentación

  return new Promise((resolverPromesa) => {
    resolver = resolverPromesa;
  });
}

/** Cierra el paso y devuelve el municipio elegido (o null si no aplica). */
function terminar({ municipioId = null } = {}) {
  const id = municipioId || vista.valorMunicipio();
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

    /** Aceptación de los términos: sin marcar la casilla no se entra. */
    'onboarding:aceptar': () => {
      if (!vista.aceptado()) return toast('Marca la casilla para aceptar los términos', 'err');
      pendienteTerminos = false;
      consentimiento.guardar({ municipioId: vista.valorMunicipio() });
      terminar();
    },

    'onboarding:volver': () => vista.paso('municipio'),

    /** Relectura desde la aplicación (ya aceptados): se muestra y se cierra. */
    'onboarding:terminos': () => vista.mostrar({ conMunicipio: false, soloLectura: true }),

    'onboarding:cerrar': () => vista.ocultar()
  });
}
