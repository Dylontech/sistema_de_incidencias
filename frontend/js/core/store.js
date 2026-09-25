/**
 * Estado compartido de la aplicación con notificación de cambios.
 *
 * Sustituye a las variables globales sueltas del monolito (App.municipioActivo,
 * Incidencias.evidenciaTemp…) por un único objeto observable: cada vista se
 * suscribe y se vuelve a pintar cuando cambia la parte que le interesa.
 */
import { sesion } from './session.js';

const estado = {
  /** Sesión y municipio activo */
  usuario: null,
  municipioActivo: null,

  /** Datos cargados del backend */
  incidencias: [],
  tipos: [],
  zonas: [],
  municipio: null,
  catalogos: { iconos: [], ejemplos: {}, diasLimites: { amarillo: 15, naranja: 30 }, limites: {} },
  notificaciones: [],
  /** Cuentas del personal cargadas en el panel de administración */
  usuarios: [],
  /** Municipios que colindan con el activo */
  colindantes: [],
  estadisticas: { panel: null, informes: null },

  /** Filtros del listado (los lee el servicio al pedir incidencias) */
  filtros: {
    texto: '',
    estado: 'todos',
    tipo: 'todos',
    color: 'todos',
    zona: 'todos',
    orden: 'reciente'
  },

  /** Búsqueda del panel de administración */
  busquedaAdmin: '',
  /** Panel de administración: mostrar solo las incidencias peligrosas */
  soloPeligrosas: false,

  /** Estado del formulario de incidencia (equivale a los *Temp del monolito) */
  formulario: {
    editarId: null,
    ubicacion: null,
    zona: null,
    iconoSeleccionado: '',
    evidencia: [],
    evidenciaResolver: []
  }
};

const oyentes = new Set();

export const store = {
  estado,

  actualizar(parcial = {}, cambio = 'general') {
    Object.assign(estado, parcial);
    oyentes.forEach((fn) => {
      try {
        fn(estado, cambio);
      } catch (e) {
        console.error('[store] fallo en un oyente', e);
      }
    });
  },

  /** Cambios dentro de `estado.formulario` o `estado.filtros`. */
  actualizarSeccion(seccion, parcial, cambio) {
    Object.assign(estado[seccion], parcial);
    oyentes.forEach((fn) => fn(estado, cambio));
  },

  suscribir(fn) {
    oyentes.add(fn);
    return () => oyentes.delete(fn);
  },

  /** Datos derivados útiles para las vistas. */
  tipoPorId(id) {
    return estado.tipos.find((t) => t.id === id) || null;
  },

  zonaPorId(id) {
    return estado.zonas.find((z) => z.id === id) || null;
  },

  limpiarDatos() {
    store.actualizar(
      {
        incidencias: [],
        tipos: [],
        zonas: [],
        notificaciones: [],
        estadisticas: { panel: null, informes: null }
      },
      'limpieza'
    );
  },

  sesion
};
