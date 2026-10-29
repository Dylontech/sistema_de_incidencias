/**
 * Selector territorial por bloques de estado.
 *
 * Se usa solo en la solicitud de informes. Sustituye el buscador único
 * «municipio o estado» y los chips por un flujo por estados:
 *
 *  - un combobox de estado con escritura,
 *  - un bloque por estado con buscador de municipios y lista de selección rápida,
 *  - «Seleccionar todos los municipios» para incluir el estado completo,
 *  - un bloque vacío final para añadir otro estado.
 *
 * `seleccion` guarda IDs de municipios concretos y `estadosSeleccionados`
 * guarda estados completos. Los estados completos no se repiten como IDs:
 * el backend expande `estados` y el informe consulta la unión.
 */
import { esc } from './utils.js';
import { filtrarMunicipios } from './selector-territorial.js';
import { normalizarTexto } from './buscador.js';

const ordenarEstados = (a, b) => String(a).localeCompare(String(b), 'es');

/** Estados únicos del catálogo, más los nombres adicionales, ordenados alfabéticamente. */
export function estadosDelCatalogo(catalogo = [], adicionales = []) {
  return [
    ...new Set([
      ...catalogo.map((municipio) => String(municipio.estado || '')).filter(Boolean),
      ...adicionales.map((estado) => String(estado || '')).filter(Boolean)
    ])
  ].sort(ordenarEstados);
}

/**
 * Construye los bloques iniciales a partir de una selección ya guardada.
 * Los estados completos mandan sobre los IDs sueltos de ese mismo estado.
 * Los estados o IDs que no estén en el catálogo se ignoran.
 */
export function construirBloques(
  catalogo = [],
  { seleccionados = [], estados = [], catalogoEstados = [] } = {}
) {
  const disponibles = estadosDelCatalogo(catalogo, catalogoEstados);
  const completos = new Set(
    estados.map(String).filter((estado) => disponibles.includes(estado))
  );
  const ids = new Set(seleccionados.map(String));

  return disponibles
    .map((estado) => {
      if (completos.has(estado)) return { estado, completo: true, municipios: [] };
      const municipios = catalogo
        .filter(
          (municipio) =>
            String(municipio.estado) === estado && ids.has(String(municipio.id))
        )
        .map((municipio) => String(municipio.id));
      return municipios.length ? { estado, completo: false, municipios } : null;
    })
    .filter(Boolean);
}

let contador = 0;

/**
 * @param {Object} opciones
 * @param {string} opciones.contenedor id del elemento donde se pinta.
 * @param {Array}  opciones.municipios catálogo completo visible.
 * @param {Array}  opciones.seleccionados ids de municipios marcados.
 * @param {Array}  opciones.estados estados completos marcados.
 * @param {Array}  opciones.catalogoEstados las 32 entidades disponibles, aunque
 *                 todavía no tengan municipios importados.
 */
export function crearSelectorTerritorialPorEstado({
  contenedor,
  municipios = [],
  seleccionados = [],
  estados = [],
  catalogoEstados = []
} = {}) {
  const raiz = document.getElementById(contenedor);
  if (!raiz) return null;

  const idBase = `terrBloques${++contador}`;
  const catalogo = [...municipios].sort(
    (a, b) =>
      ordenarEstados(a.estado, b.estado) ||
      String(a.nombre).localeCompare(String(b.nombre), 'es')
  );
  const estadosBase = estadosDelCatalogo(catalogo, catalogoEstados);

  /** @type {Array<{estado: string, completo: boolean, busqueda: string}>} */
  const bloques = [];
  const seleccion = new Set();
  const estadosSeleccionados = new Set();
  let comboAbierto = null;

  raiz.innerHTML = `<div class="terr-bloques" id="${idBase}"></div>`;
  const zona = raiz.querySelector('.terr-bloques');

  const delEstado = (estado) =>
    catalogo.filter((municipio) => String(municipio.estado) === estado);

  function resumenBloque(bloque) {
    if (bloque.completo) return 'Todo el estado incluido';
    const municipiosDelEstado = delEstado(bloque.estado);
    if (!municipiosDelEstado.length) return 'Estado sin municipios cargados';
    const marcados = municipiosDelEstado.filter((municipio) =>
      seleccion.has(String(municipio.id))
    ).length;
    if (!marcados) return 'Ningún municipio seleccionado';
    return `${marcados} de ${municipiosDelEstado.length} municipios seleccionados`;
  }

  function listaHtml(bloque, indice) {
    const municipiosDelEstado = delEstado(bloque.estado);
    if (!municipiosDelEstado.length) {
      return '<p class="campo-nota">Este estado aún no tiene municipios cargados. Puedes usar «Incluir el estado completo».</p>';
    }
    const visibles = filtrarMunicipios(catalogo, {
      estado: bloque.estado,
      busqueda: bloque.busqueda.trim()
    });
    if (!visibles.length) return '<p class="campo-nota">Sin coincidencias.</p>';
    return visibles
      .map((municipio) => {
        const activo = seleccion.has(String(municipio.id));
        return `<label class="terr-opcion${activo ? ' activo' : ''}">
          <input type="checkbox" data-municipio="${esc(municipio.id)}" data-bloque="${indice}"
            ${activo ? 'checked' : ''} ${bloque.completo ? 'disabled' : ''}>
          <span>${esc(municipio.nombre)}</span>
        </label>`;
      })
      .join('');
  }

  function bloqueHtml(bloque, indice) {
    const sinMunicipios = delEstado(bloque.estado).length === 0;
    return `
      <div class="terr-bloque${bloque.completo ? ' terr-bloque-completo' : ''}" data-bloque="${indice}">
        <div class="terr-bloque-cabecera">
          <div class="combo terr-estado-combo">
            <input type="text" class="terr-estado-input" data-estado-input="${indice}"
              value="${esc(bloque.estado)}" placeholder="Escribe o elige un estado…"
              autocomplete="off" role="combobox" aria-expanded="false"
              aria-controls="${idBase}-estado-${indice}" aria-autocomplete="list"
              aria-label="Estado: ${esc(bloque.estado)}">
            <ul class="combo-lista" id="${idBase}-estado-${indice}" role="listbox" hidden></ul>
          </div>
          <button type="button" class="terr-bloque-quitar" data-quitar-bloque="${indice}"
            aria-label="Quitar ${esc(bloque.estado)}">&times;</button>
        </div>
        <p class="terr-bloque-resumen" data-estado-resumen="${indice}">${esc(
          resumenBloque(bloque)
        )}</p>
        <input type="text" class="terr-municipio-input" data-municipio-busqueda="${indice}"
          value="${esc(bloque.busqueda)}"
          placeholder="${
            sinMunicipios ? 'Sin municipios cargados' : `Escribe un municipio de ${esc(bloque.estado)}…`
          }"
          autocomplete="off" aria-label="Buscar municipio en ${esc(bloque.estado)}"
          ${bloque.completo || sinMunicipios ? 'disabled' : ''}>
        <label class="check-line terr-todos-linea">
          <input type="checkbox" data-todos="${indice}" ${bloque.completo ? 'checked' : ''}>
          <span>${sinMunicipios ? 'Incluir el estado completo' : 'Seleccionar todos los municipios'}</span>
        </label>
        <div class="terr-lista" data-lista="${indice}" role="group"
          aria-label="Municipios de ${esc(bloque.estado)}"
          ${bloque.completo ? 'aria-disabled="true"' : ''}>
          ${listaHtml(bloque, indice)}
        </div>
      </div>`;
  }

  function estadosPermitidos(indice) {
    const usados = new Set(
      bloques
        .filter((_, posicion) => posicion !== indice)
        .map((bloque) => bloque.estado)
        .filter(Boolean)
    );
    const actual = bloques[indice]?.estado || '';
    return estadosBase.filter((estado) => estado === actual || !usados.has(estado));
  }

  function bloqueVacioHtml(indice) {
    const disponibles = estadosPermitidos(indice);
    const sinDisponibles = disponibles.length === 0;
    const notaSinEstados =
      estadosBase.length === 0
        ? 'No hay estados en el catálogo.'
        : 'Todos los estados del catálogo ya están agregados.';
    return `
      <div class="terr-bloque terr-bloque-vacio" data-bloque="${indice}">
        <p class="campo-nota terr-agregar-nota">${
          bloques.length ? 'Añadir otro estado' : 'Estado'
        }</p>
        <div class="terr-bloque-cabecera">
          <div class="combo terr-estado-combo">
            <input type="text" class="terr-estado-input" data-estado-input="${indice}"
              placeholder="${
                sinDisponibles ? 'No hay estados disponibles' : 'Escribe o elige un estado…'
              }"
              autocomplete="off" role="combobox" aria-expanded="false"
              aria-controls="${idBase}-estado-${indice}" aria-autocomplete="list"
              aria-label="${bloques.length ? 'Añadir otro estado' : 'Elegir un estado'}"
              ${sinDisponibles ? 'disabled' : ''}>
            <ul class="combo-lista" id="${idBase}-estado-${indice}" role="listbox" hidden></ul>
          </div>
        </div>
        ${
          sinDisponibles
            ? `<p class="campo-nota u-mt-6">${notaSinEstados}</p>`
            : ''
        }
      </div>`;
  }

  function pintar() {
    comboAbierto = null;
    zona.innerHTML =
      bloques.map((bloque, indice) => bloqueHtml(bloque, indice)).join('') +
      bloqueVacioHtml(bloques.length);
  }

  function actualizarResumen(indice) {
    const bloque = bloques[indice];
    if (!bloque) return;
    const resumen = zona.querySelector(`[data-estado-resumen="${indice}"]`);
    if (resumen) resumen.textContent = resumenBloque(bloque);
  }

  function pintarLista(indice) {
    const bloque = bloques[indice];
    if (!bloque) return;
    const lista = zona.querySelector(`[data-lista="${indice}"]`);
    if (lista) lista.innerHTML = listaHtml(bloque, indice);
    actualizarResumen(indice);
  }

  function cerrarCombo({ revertir = false } = {}) {
    if (!comboAbierto) return;
    const { input, lista, indice } = comboAbierto;
    lista.hidden = true;
    lista.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    if (revertir) input.value = bloques[indice]?.estado || '';
    comboAbierto = null;
  }

  function opcionesCombo(indice, input, ignorarValor = false) {
    const consulta = ignorarValor ? '' : normalizarTexto(input.value);
    return estadosPermitidos(indice).filter(
      (estado) => !consulta || normalizarTexto(estado).includes(consulta)
    );
  }

  function abrirCombo(indice, input, { ignorarValor = false } = {}) {
    const lista = input.parentElement?.querySelector('.combo-lista');
    if (!lista) return;
    const opciones = opcionesCombo(indice, input, ignorarValor);
    lista.innerHTML = opciones.length
      ? opciones
          .map(
            (estado, posicion) => `
          <li class="combo-opcion" role="option" aria-selected="false"
            id="${idBase}-estado-${indice}-op-${posicion}"
            data-estado-sugerencia="${esc(estado)}" data-indice="${indice}">
            ${esc(estado)}
          </li>`
          )
          .join('')
      : '<li class="combo-vacio">Sin coincidencias en el catálogo</li>';
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    comboAbierto = {
      indice,
      input,
      lista,
      opciones: [...lista.querySelectorAll('[data-estado-sugerencia]')],
      activo: -1
    };
  }

  function moverCombo(paso) {
    if (!comboAbierto || !comboAbierto.opciones.length) return;
    const total = comboAbierto.opciones.length;
    comboAbierto.activo = (comboAbierto.activo + paso + total) % total;
    comboAbierto.opciones.forEach((opcion, posicion) => {
      const activa = posicion === comboAbierto.activo;
      opcion.classList.toggle('activo', activa);
      opcion.setAttribute('aria-selected', activa ? 'true' : 'false');
    });
    const activa = comboAbierto.opciones[comboAbierto.activo];
    comboAbierto.input.setAttribute('aria-activedescendant', activa.id);
    activa.scrollIntoView({ block: 'nearest' });
  }

  function elegirEstado(indice, estado) {
    const nombre = String(estado || '').trim();
    if (!estadosBase.includes(nombre)) return;
    if (
      bloques.some(
        (bloque, posicion) => posicion !== indice && bloque.estado === nombre
      )
    ) {
      return;
    }

    if (indice === bloques.length) {
      bloques.push({ estado: nombre, completo: false, busqueda: '' });
    } else if (indice >= 0 && indice < bloques.length) {
      const bloque = bloques[indice];
      if (bloque.estado !== nombre) {
        estadosSeleccionados.delete(bloque.estado);
        delEstado(bloque.estado).forEach((municipio) =>
          seleccion.delete(String(municipio.id))
        );
        bloque.estado = nombre;
        bloque.completo = false;
        bloque.busqueda = '';
      }
    } else {
      return;
    }

    pintar();
  }

  function alternarTodos(indice, marcar) {
    const bloque = bloques[indice];
    if (!bloque) return;
    if (marcar) {
      estadosSeleccionados.add(bloque.estado);
      bloque.completo = true;
      delEstado(bloque.estado).forEach((municipio) =>
        seleccion.delete(String(municipio.id))
      );
    } else {
      estadosSeleccionados.delete(bloque.estado);
      bloque.completo = false;
    }
    bloque.busqueda = '';
    const input = zona.querySelector(`[data-municipio-busqueda="${indice}"]`);
    if (input) {
      input.value = '';
      input.disabled = bloque.completo || delEstado(bloque.estado).length === 0;
    }
    const lista = zona.querySelector(`[data-lista="${indice}"]`);
    if (lista) {
      lista.innerHTML = listaHtml(bloque, indice);
      if (bloque.completo) lista.setAttribute('aria-disabled', 'true');
      else lista.removeAttribute('aria-disabled');
    }
    const contenedorBloque = zona.querySelector(`[data-bloque="${indice}"]`);
    contenedorBloque?.classList.toggle('terr-bloque-completo', bloque.completo);
    actualizarResumen(indice);
  }

  function alternarMunicipio(indice, id, marcado, opcion) {
    const bloque = bloques[indice];
    if (!bloque || bloque.completo) return;
    if (marcado) seleccion.add(String(id));
    else seleccion.delete(String(id));
    opcion?.classList.toggle('activo', marcado);
    actualizarResumen(indice);
  }

  function quitarBloque(indice) {
    const bloque = bloques[indice];
    if (!bloque) return;
    estadosSeleccionados.delete(bloque.estado);
    delEstado(bloque.estado).forEach((municipio) =>
      seleccion.delete(String(municipio.id))
    );
    bloques.splice(indice, 1);
    pintar();
  }

  function cargarBloques(iniciales = []) {
    bloques.length = 0;
    seleccion.clear();
    estadosSeleccionados.clear();
    for (const inicial of iniciales) {
      bloques.push({ estado: inicial.estado, completo: inicial.completo, busqueda: '' });
      if (inicial.completo) estadosSeleccionados.add(inicial.estado);
      else inicial.municipios.forEach((id) => seleccion.add(String(id)));
    }
    pintar();
  }

  // --- Eventos delegados -----------------------------------------------------

  zona.addEventListener('focusin', (evento) => {
    const input = evento.target.closest('[data-estado-input]');
    if (!input || input.disabled) return;
    input.select();
    abrirCombo(Number(input.dataset.estadoInput), input, { ignorarValor: true });
  });

  zona.addEventListener('input', (evento) => {
    const estadoInput = evento.target.closest('[data-estado-input]');
    if (estadoInput) {
      abrirCombo(Number(estadoInput.dataset.estadoInput), estadoInput);
      return;
    }
    const busqueda = evento.target.closest('[data-municipio-busqueda]');
    if (busqueda) {
      const indice = Number(busqueda.dataset.municipioBusqueda);
      const bloque = bloques[indice];
      if (!bloque) return;
      bloque.busqueda = busqueda.value;
      pintarLista(indice);
    }
  });

  zona.addEventListener('keydown', (evento) => {
    const estadoInput = evento.target.closest('[data-estado-input]');
    if (estadoInput) {
      if (evento.key === 'ArrowDown') {
        evento.preventDefault();
        if (!comboAbierto) {
          abrirCombo(Number(estadoInput.dataset.estadoInput), estadoInput, {
            ignorarValor: true
          });
        }
        moverCombo(1);
      } else if (evento.key === 'ArrowUp') {
        evento.preventDefault();
        if (!comboAbierto) {
          abrirCombo(Number(estadoInput.dataset.estadoInput), estadoInput, {
            ignorarValor: true
          });
        }
        moverCombo(-1);
      } else if (evento.key === 'Enter') {
        evento.preventDefault();
        if (!comboAbierto) {
          abrirCombo(Number(estadoInput.dataset.estadoInput), estadoInput);
        }
        const opcion = comboAbierto
          ? comboAbierto.opciones[comboAbierto.activo] || comboAbierto.opciones[0]
          : null;
        if (opcion) elegirEstado(comboAbierto.indice, opcion.dataset.estadoSugerencia);
      } else if (evento.key === 'Escape') {
        evento.preventDefault();
        cerrarCombo({ revertir: true });
      }
      return;
    }
    const busqueda = evento.target.closest('[data-municipio-busqueda]');
    if (busqueda && evento.key === 'Enter') evento.preventDefault();
  });

  zona.addEventListener('mousedown', (evento) => {
    if (evento.target.closest('.combo-lista')) evento.preventDefault();
  });

  zona.addEventListener('click', (evento) => {
    const sugerencia = evento.target.closest('[data-estado-sugerencia]');
    if (sugerencia) {
      elegirEstado(Number(sugerencia.dataset.indice), sugerencia.dataset.estadoSugerencia);
      return;
    }
    const quitar = evento.target.closest('[data-quitar-bloque]');
    if (quitar) quitarBloque(Number(quitar.dataset.quitarBloque));
  });

  zona.addEventListener('change', (evento) => {
    const todos = evento.target.closest('[data-todos]');
    if (todos) {
      alternarTodos(Number(todos.dataset.todos), todos.checked);
      return;
    }
    const municipio = evento.target.closest('[data-municipio]');
    if (municipio) {
      alternarMunicipio(
        Number(municipio.dataset.bloque),
        municipio.dataset.municipio,
        municipio.checked,
        municipio.closest('.terr-opcion')
      );
    }
  });

  zona.addEventListener('focusout', (evento) => {
    if (!comboAbierto) return;
    const input = evento.target.closest('[data-estado-input]');
    if (!input || input !== comboAbierto.input) return;
    setTimeout(() => {
      if (comboAbierto && comboAbierto.input === input && document.activeElement !== input) {
        cerrarCombo({ revertir: true });
      }
    }, 0);
  });

  document.addEventListener('click', (evento) => {
    if (!comboAbierto) return;
    if (
      comboAbierto.input.contains(evento.target) ||
      comboAbierto.lista.contains(evento.target)
    ) {
      return;
    }
    cerrarCombo({ revertir: true });
  });

  // --- API -------------------------------------------------------------------

  cargarBloques(construirBloques(catalogo, { seleccionados, estados, catalogoEstados }));

  return {
    municipios: () => [...seleccion],
    estados: () => [...estadosSeleccionados],
    /** Estados que todavía no tienen bloque, en orden alfabético. */
    estadosDisponibles: () =>
      estadosBase.filter(
        (estado) => !bloques.some((bloque) => bloque.estado === estado)
      ),
    fijarMunicipios(ids = []) {
      cargarBloques(
        construirBloques(catalogo, { seleccionados: ids, catalogoEstados })
      );
    },
    fijarEstados(lista = []) {
      cargarBloques(construirBloques(catalogo, { estados: lista, catalogoEstados }));
    },
    limpiar() {
      cargarBloques([]);
    },
    agregarEstado(estado) {
      const nombre = String(estado || '').trim();
      if (!estadosBase.includes(nombre)) return false;
      if (bloques.some((bloque) => bloque.estado === nombre)) return false;
      bloques.push({ estado: nombre, completo: false, busqueda: '' });
      pintar();
      return true;
    },
    marcarTodoElEstado(estado) {
      const nombre = String(estado || '').trim();
      const indice = bloques.findIndex((bloque) => bloque.estado === nombre);
      if (indice < 0) return false;
      estadosSeleccionados.add(nombre);
      delEstado(nombre).forEach((municipio) =>
        seleccion.delete(String(municipio.id))
      );
      bloques[indice].completo = true;
      bloques[indice].busqueda = '';
      pintar();
      return true;
    }
  };
}
