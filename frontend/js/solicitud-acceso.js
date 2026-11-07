/** Formulario público de solicitud de acceso. */
import { crearSelectorTerritorialPorEstado } from './core/selector-territorial-bloques.js';
import { vigilarCorreo } from './core/correo-cuenta.js';

const aviso = document.getElementById('accesoAviso');
const formulario = document.getElementById('accesoForm');
let selectorTerritorio = null;
const vigilanciaCorreo = vigilarCorreo(document.getElementById('accCorreo'), {
  contexto: 'solicitud_acceso',
  estadoEl: document.getElementById('accCorreoEstado')
});

function mensaje(texto, tipo = 'info') {
  aviso.className = `publico-msg ${tipo}`;
  aviso.textContent = texto;
}

async function cargarTerritorio() {
  try {
    const respuesta = await fetch('/api/publico/municipios');
    const { municipios = [], estados = [] } = await respuesta.json();
    selectorTerritorio = crearSelectorTerritorialPorEstado({
      contenedor: 'accTerritorio',
      municipios,
      catalogoEstados: estados
    });
  } catch {
    mensaje('No se pudo cargar el catálogo de municipios.', 'err');
  }
}

async function subirDocumentos() {
  const archivos = [...(document.getElementById('accDocumentos')?.files || [])];
  if (!archivos.length) return [];
  if (archivos.length > 3) {
    throw new Error('Puedes adjuntar hasta 3 documentos.');
  }
  const datos = new FormData();
  archivos.forEach((archivo) => datos.append('documentos', archivo, archivo.name));
  const respuesta = await fetch('/api/publico/solicitudes-acceso/documentos', {
    method: 'POST',
    body: datos
  });
  const resultado = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(resultado?.error || 'No se pudieron subir los documentos.');
  }
  return (resultado.documentos || []).map((documento) => documento.id);
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const municipios = selectorTerritorio?.municipios() || [];
  const estados = selectorTerritorio?.estados() || [];
  if (!municipios.length && !estados.length) {
    mensaje('Elige al menos un estado o municipio.', 'err');
    return;
  }
  const estadoCorreo = document.getElementById('accCorreo')?.dataset.estadoCorreo || '';
  if (estadoCorreo && !['disponible', 'sin-verificar'].includes(estadoCorreo)) {
    mensaje(
      'Ese correo no está disponible para una solicitud nueva. Revisa el aviso del campo o inicia sesión si ya tienes cuenta.',
      'err'
    );
    document.getElementById('accCorreo')?.focus();
    return;
  }
  const boton = formulario.querySelector('button[type="submit"]');
  if (boton) boton.disabled = true;
  try {
    const documentos = await subirDocumentos();
    const respuesta = await fetch('/api/publico/solicitudes-acceso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: document.getElementById('accNombre').value,
        correo: document.getElementById('accCorreo').value,
        municipios,
        estados,
        justificacion: document.getElementById('accJustificacion').value,
        documentos
      })
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos?.error || 'No se pudo enviar la solicitud');
    formulario.reset();
    selectorTerritorio?.limpiar();
    vigilanciaCorreo.limpiar();
    const rol = datos.rolSugerido ? ` El rol sugerido es ${datos.rolSugerido}.` : '';
    mensaje(
      `Solicitud recibida. Folio: ${datos.folio}.${rol} Un administrador la revisará.`,
      'ok'
    );
  } catch (error) {
    mensaje(error.message, 'err');
  } finally {
    if (boton) boton.disabled = false;
  }
});

cargarTerritorio();
