/**
 * Selector territorial reutilizable.
 *
 * Sustituye los `<select multiple>` planos de 175 opciones por:
 *  - búsqueda con autocompletado (nombre o estado, sin acentos),
 *  - resultados agrupados por estado,
 *  - chips de lo seleccionado con su «×»,
 *  - selección rápida: todos, ninguno y «todo el estado X».
 *
 * Se usa en el alta/edición de usuarios, en las claves de acceso y en la
 * configuración de notificaciones. No guarda nada: el formulario dueño lee
 * `municipios()` y `estados()` al enviar.
 */
import { esc } from './utils.js';

const normalizar = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Filtro puro compartido por el selector y las pruebas.
 *
 * `estados` son los estados ya añadidos a la solicitud; `estado` es el filtro
 * visual «ver municipios de…». Si hay un filtro visual, manda ese estado para
 * que la lista no mezcle municipios de varios estados.
 */
export function filtrarMunicipios(catalogo = [], { estados = [], busqueda = '', estado = '' } = {}) {
  const objetivo = normalizar(busqueda);
  const permitidos = new Set(estado ? [estado] : estados);
  return catalogo.filter((municipio) => {
    if (permitidos.size && !permitidos.has(municipio.estado)) return false;
    if (!objetivo) return true;
    return (
      normalizar(municipio.nombre).includes(objetivo) ||
      normalizar(municipio.estado).includes(objetivo)
    );
  });
}

let contador = 0;

/**
 * @param {Object} opciones
 * @param {string} opciones.contenedor id del elemento donde se pinta.
 * @param {Array}  opciones.municipios catálogo completo visible.
 * @param {Array}  opciones.seleccionados ids de municipios marcados.
 * @param {Array}  opciones.estados estados marcados (modo estatal).
 * @param {string} opciones.modo 'municipios' | 'estados' | 'ambos'.
 * @param {Array}  opciones.catalogoEstados entidades que deben ofrecerse aunque
 *                 todavía no tengan municipios importados.
 */
export function crearSelectorTerritorial({
  contenedor,
  municipios = [],
  seleccionados = [],
  estados = [],
  modo = 'municipios',
  catalogoEstados = []
} = {}) {
  const raiz = document.getElementById(contenedor);
  if (!raiz) return null;

  const idBase = `terr${++contador}`;
  const catalogo = [...municipios].sort(
    (a, b) =>
      String(a.estado).localeCompare(String(b.estado), 'es') ||
      String(a.nombre).localeCompare(String(b.nombre), 'es')
  );
  const estadosCatalogoCompleto = [
    ...new Set([
      ...catalogo.map((m) => m.estado),
      ...catalogoEstados
    ].filter(Boolean))
  ].sort((a, b) => String(a).localeCompare(String(b), 'es'));
  // En modo municipios el filtro por estado solo ofrece las entidades donde el
  // usuario tiene municipios: si no, un funcionario veía las 32 entidades y
  // podía pedir datos de otro estado.
  const estadosCatalogo = modo === 'municipios'
    ? [...new Set(catalogo.map((m) => m.estado).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), 'es'))
    : estadosCatalogoCompleto;

  const seleccion = new Set(seleccionados.map(String));
  const estadosSeleccionados = new Set(estados.map(String));
  let busqueda = '';
  let filtroEstado = '';

  const porId = new Map(catalogo.map((m) => [String(m.id), m]));

  raiz.innerHTML = `
    <div class="terr" id="${idBase}">
      ${
        modo !== 'estados'
          ? `
      <div class="terr-busqueda">
        <input type="text" class="terr-input" autocomplete="off" placeholder="Escribe un municipio o estado…"
               autocomplete="off" aria-label="Buscar municipio">
        <select class="terr-filtro-estado" aria-label="Filtrar municipios por estado">
          <option value="">Todos los estados</option>
          ${estadosCatalogo
            .map((e) => `<option value="${esc(e)}">${esc(e)}</option>`)
            .join('')}
        </select>
        <div class="terr-acciones">
          <button type="button" class="btn btn-sm btn-outline" data-terr="todos">Todos</button>
          <button type="button" class="btn btn-sm btn-outline" data-terr="ninguno">Ninguno</button>
          <select class="terr-estado-rapido" aria-label="Seleccionar todos los municipios de un estado">
            <option value="">Seleccionar todos los municipios de…</option>
            ${estadosCatalogo
              .map((e) => `<option value="${esc(e)}">${esc(e)}</option>`)
              .join('')}
          </select>
        </div>
      </div>
      <div class="terr-chips" data-terr="chips"></div>
      <div class="terr-resultados" data-terr="resultados"></div>`
          : ''
      }
      ${
        modo !== 'municipios'
          ? `
      <div class="terr-estados">
        <span class="campo-nota">Estados asignados:</span>
        <div class="terr-chips" data-terr="chips-estados"></div>
        <select class="terr-estado" aria-label="Añadir estado">
          <option value="">Añadir un estado…</option>
          ${estadosCatalogo.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join('')}
        </select>
      </div>`
          : ''
      }
    </div>`;

  const buscar = raiz.querySelector('.terr-input');
  const filtroEstadoSelect = raiz.querySelector('.terr-filtro-estado');
  const chips = raiz.querySelector('[data-terr="chips"]');
  const resultados = raiz.querySelector('[data-terr="resultados"]');
  const chipsEstados = raiz.querySelector('[data-terr="chips-estados"]');
  const selectEstado = raiz.querySelector('.terr-estado');
  const estadoRapido = raiz.querySelector('.terr-estado-rapido');

  function pintarChips() {
    if (!chips) return;
    const items = [...seleccion].map((id) => {
      const m = porId.get(id);
      return `<button type="button" class="terr-chip" data-quitar="${esc(id)}"
        title="Quitar ${esc(m?.nombre || id)}">${esc(m?.nombre || id)} ×</button>`;
    });
    chips.innerHTML = items.length
      ? items.join('')
      : '<span class="u-fs-11px u-suave">Ningún municipio seleccionado.</span>';
    if (chipsEstados) {
      chipsEstados.innerHTML = estadosSeleccionados.size
        ? [...estadosSeleccionados]
            .map(
              (e) =>
                `<button type="button" class="terr-chip" data-quitar-estado="${esc(e)}">${esc(e)} ×</button>`
            )
            .join('')
        : '<span class="u-fs-11px u-suave">Ningún estado seleccionado.</span>';
    }
  }

  function pintarResultados() {
    if (!resultados) return;
    const objetivo = normalizar(busqueda);
    const lista = filtrarMunicipios(catalogo, {
      estados: [...estadosSeleccionados],
      busqueda,
      estado: filtroEstado
    });
    const limite = objetivo ? 60 : 40;
    const visibles = lista.slice(0, limite);

    if (!visibles.length) {
      resultados.innerHTML = '<p class="u-fs-12px u-suave">Sin coincidencias.</p>';
      return;
    }

    const porEstado = new Map();
    for (const m of visibles) {
      if (!porEstado.has(m.estado)) porEstado.set(m.estado, []);
      porEstado.get(m.estado).push(m);
    }

    resultados.innerHTML =
      [...porEstado.entries()]
        .map(([estado, items]) => {
          const delEstado = catalogo.filter((m) => m.estado === estado);
          const todos = delEstado.length > 0 && delEstado.every((m) => seleccion.has(String(m.id)));
          return `
        <div class="terr-grupo">
          <div class="terr-grupo-cabecera">
            <div class="terr-grupo-titulo">${esc(estado || 'Sin estado')}</div>
            ${estado ? `<button type="button" class="terr-grupo-todos" data-estado-todos="${esc(estado)}">${todos ? 'Quitar todos' : 'Seleccionar todos'}</button>` : ''}
          </div>
          ${items
            .map(
              (m) => `
            <button type="button" class="terr-opcion${seleccion.has(String(m.id)) ? ' activo' : ''}"
              data-id="${esc(m.id)}">
              ${esc(m.nombre)}
            </button>`
            )
            .join('')}
        </div>`;
        })
        .join('') +
      (lista.length > visibles.length
        ? '<p class="campo-nota">Escribe para acotar la lista.</p>'
        : '');
  }

  function alternarEstado(estado, marcar) {
    if (!estado) return;
    for (const municipio of catalogo) {
      if (municipio.estado !== estado) continue;
      if (marcar) seleccion.add(String(municipio.id));
      else seleccion.delete(String(municipio.id));
    }
    pintarChips();
    pintarResultados();
  }

  function alternar(id) {
    const clave = String(id);
    if (seleccion.has(clave)) seleccion.delete(clave);
    else seleccion.add(clave);
    pintarChips();
    pintarResultados();
  }

  buscar?.addEventListener('input', () => {
    busqueda = buscar.value;
    pintarResultados();
  });

  // Enter dentro de un formulario no debe enviarlo: en el buscador de
  // territorio sirve para marcar la primera coincidencia visible.
  buscar?.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    const primera = resultados?.querySelector('[data-id]');
    if (primera) alternar(primera.dataset.id);
  });

  filtroEstadoSelect?.addEventListener('change', () => {
    filtroEstado = filtroEstadoSelect.value;
    pintarResultados();
  });

  resultados?.addEventListener('click', (evento) => {
    const todos = evento.target.closest('[data-estado-todos]');
    if (todos) {
      const estado = todos.dataset.estadoTodos;
      const delEstado = catalogo.filter((m) => m.estado === estado);
      const marcar = !delEstado.every((m) => seleccion.has(String(m.id)));
      alternarEstado(estado, marcar);
      return;
    }
    const boton = evento.target.closest('[data-id]');
    if (boton) alternar(boton.dataset.id);
  });

  chips?.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-quitar]');
    if (boton) alternar(boton.dataset.quitar);
  });

  chipsEstados?.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-quitar-estado]');
    if (boton) {
      const estado = boton.dataset.quitarEstado;
      estadosSeleccionados.delete(estado);
      if (filtroEstado === estado) {
        filtroEstado = [...estadosSeleccionados][0] || '';
        if (filtroEstadoSelect) filtroEstadoSelect.value = filtroEstado;
      }
      pintarChips();
      pintarResultados();
    }
  });

  selectEstado?.addEventListener('change', () => {
    const estado = selectEstado.value;
    if (estado) {
      estadosSeleccionados.add(estado);
      // Al añadir un estado se muestra su listado de inmediato, aunque antes
      // hubiera otro estado elegido en el filtro visual.
      filtroEstado = estado;
      if (filtroEstadoSelect) filtroEstadoSelect.value = estado;
    }
    selectEstado.value = '';
    pintarChips();
    pintarResultados();
  });

  estadoRapido?.addEventListener('change', () => {
    const estado = estadoRapido.value;
    if (!estado) return;
    for (const m of catalogo) {
      if (m.estado === estado) seleccion.add(String(m.id));
    }
    filtroEstado = estado;
    if (filtroEstadoSelect) filtroEstadoSelect.value = estado;
    estadoRapido.value = '';
    pintarChips();
    pintarResultados();
  });

  raiz.querySelector('[data-terr="todos"]')?.addEventListener('click', () => {
    catalogo.forEach((m) => seleccion.add(String(m.id)));
    pintarChips();
    pintarResultados();
  });

  raiz.querySelector('[data-terr="ninguno"]')?.addEventListener('click', () => {
    seleccion.clear();
    estadosSeleccionados.clear();
    filtroEstado = '';
    if (filtroEstadoSelect) filtroEstadoSelect.value = '';
    pintarChips();
    pintarResultados();
  });

  pintarChips();
  pintarResultados();

  return {
    municipios: () => [...seleccion],
    estados: () => [...estadosSeleccionados],
    fijarMunicipios(ids = []) {
      seleccion.clear();
      ids.forEach((id) => seleccion.add(String(id)));
      pintarChips();
      pintarResultados();
    },
    fijarEstados(lista = []) {
      estadosSeleccionados.clear();
      lista.forEach((e) => estadosSeleccionados.add(String(e)));
      filtroEstado = '';
      if (filtroEstadoSelect) filtroEstadoSelect.value = '';
      pintarChips();
      pintarResultados();
    },
    limpiar() {
      seleccion.clear();
      estadosSeleccionados.clear();
      filtroEstado = '';
      if (buscar) buscar.value = '';
      if (filtroEstadoSelect) filtroEstadoSelect.value = '';
      busqueda = '';
      pintarChips();
      pintarResultados();
    }
  };
}
