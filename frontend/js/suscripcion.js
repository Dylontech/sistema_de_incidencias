/**
 * Página pública de suscripción a las campañas informativas.
 *
 * - `?confirmar=token` confirma el doble opt-in.
 * - `?baja=token` da de baja en un clic.
 * - Sin parámetros muestra el formulario de alta.
 */
import { $ } from './core/utils.js';

const API = '/api/publico';

function mostrar(texto, tipo = 'info') {
  const caja = $('suscEstado');
  if (!caja) return;
  caja.className = `publico-msg ${tipo}`;
  caja.textContent = texto;
  caja.classList.remove('u-oculto');
}

function ocupado(activo, texto = 'Procesando…') {
  const overlay = $('loading');
  if (!overlay) return;
  if (activo) {
    $('loadingText').textContent = texto;
    overlay.classList.add('show');
  } else {
    overlay.classList.remove('show');
  }
}

async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(`${API}${ruta}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones
  });
  let cuerpo = {};
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = {};
  }
  if (!respuesta.ok) {
    const error = new Error(cuerpo.error || 'No se pudo completar la operación');
    error.estado = respuesta.status;
    throw error;
  }
  return cuerpo;
}

let municipios = [];

function llenarCatalogos() {
  const est = $('susEstado');
  const mun = $('susMunicipio');
  if (!est || !mun) return;
  const estados = [...new Set(municipios.map((m) => m.estado))].sort((a, b) =>
    String(a).localeCompare(String(b), 'es')
  );
  est.innerHTML =
    '<option value="">— Cualquiera —</option>' +
    estados.map((e) => `<option value="${e}">${e}</option>`).join('');
  mun.innerHTML =
    '<option value="">— Todos —</option>' +
    municipios
      .slice()
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
      .map((m) => `<option value="${m.id}">${m.nombre} (${m.estado})</option>`)
      .join('');
}

function filtrarMunicipios() {
  const estado = $('susEstado')?.value || '';
  const mun = $('susMunicipio');
  if (!mun) return;
  const lista = estado ? municipios.filter((m) => m.estado === estado) : municipios;
  mun.innerHTML =
    `<option value="">${estado ? '— Todos los del estado —' : '— Todos —'}</option>` +
    lista
      .slice()
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
      .map((m) => `<option value="${m.id}">${m.nombre}</option>`)
      .join('');
}

async function cargarCatalogos() {
  try {
    const { municipios: lista } = await pedir('/municipios', { method: 'GET' });
    municipios = lista || [];
  } catch {
    municipios = [];
  }
  llenarCatalogos();
}

async function confirmar(token) {
  ocupado(true, 'Confirmando suscripción…');
  try {
    const resultado = await pedir('/suscripciones/confirmar', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    mostrar(resultado.mensaje || 'Suscripción confirmada.', 'ok');
    $('suscFormBox')?.classList.add('u-oculto');
  } catch (error) {
    mostrar(error.message, 'err');
  } finally {
    ocupado(false);
  }
}

async function darDeBaja(token) {
  ocupado(true, 'Procesando la baja…');
  try {
    const resultado = await pedir('/suscripciones/baja', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    mostrar(resultado.mensaje || 'Te dimos de baja.', 'ok');
    $('suscFormBox')?.classList.add('u-oculto');
  } catch (error) {
    mostrar(error.message, 'err');
  } finally {
    ocupado(false);
  }
}

function conectarFormulario() {
  const form = $('formSuscripcion');
  if (!form) return;
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const correo = $('susCorreo')?.value.trim() || '';
    if (!correo) return mostrar('Escribe tu correo', 'err');
    if ($('susAviso')?.checked !== true) {
      return mostrar('Debes aceptar el aviso de privacidad para suscribirte', 'err');
    }
    ocupado(true, 'Enviando confirmación…');
    try {
      const resultado = await pedir('/suscripciones', {
        method: 'POST',
        body: JSON.stringify({
          nombre: $('susNombre')?.value.trim() || '',
          correo,
          municipioId: $('susMunicipio')?.value || null,
          aceptaAviso: true,
          origen: 'pagina-suscripcion'
        })
      });
      mostrar(resultado.mensaje || 'Revisa tu correo para confirmar.', 'ok');
      form.reset();
    } catch (error) {
      mostrar(error.message, 'err');
    } finally {
      ocupado(false);
    }
  });
}

async function iniciar() {
  const params = new URLSearchParams(window.location.search);
  const tokenConfirmar = params.get('confirmar');
  const tokenBaja = params.get('baja');

  if (tokenConfirmar) return confirmar(tokenConfirmar);
  if (tokenBaja) return darDeBaja(tokenBaja);

  await cargarCatalogos();
  $('susEstado')?.addEventListener('change', filtrarMunicipios);
  conectarFormulario();
}

iniciar();
