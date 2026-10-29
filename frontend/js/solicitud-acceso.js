/** Formulario público de solicitud de acceso. */
import { esc } from './core/utils.js';

const aviso = document.getElementById('accesoAviso');
const formulario = document.getElementById('accesoForm');
const selector = document.getElementById('accMunicipios');

function mensaje(texto, tipo = 'info') {
  aviso.className = `publico-msg ${tipo}`;
  aviso.textContent = texto;
}

async function cargarMunicipios() {
  try {
    const respuesta = await fetch('/api/publico/municipios');
    const { municipios } = await respuesta.json();
    selector.innerHTML = (municipios || [])
      .map((m) => `<option value="${esc(m.id)}">${esc(m.nombre)}, ${esc(m.estado)}</option>`)
      .join('');
  } catch {
    mensaje('No se pudo cargar el catálogo de municipios.', 'err');
  }
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const municipios = [...selector.selectedOptions].map((o) => o.value);
  try {
    const respuesta = await fetch('/api/publico/solicitudes-acceso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: document.getElementById('accNombre').value,
        correo: document.getElementById('accCorreo').value,
        rolSolicitado: document.getElementById('accRol').value,
        municipios,
        justificacion: document.getElementById('accJustificacion').value
      })
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos?.error || 'No se pudo enviar la solicitud');
    formulario.reset();
    mensaje(`Solicitud recibida. Folio: ${datos.folio}. Un administrador la revisará.`, 'ok');
  } catch (error) {
    mensaje(error.message, 'err');
  }
});

cargarMunicipios();
