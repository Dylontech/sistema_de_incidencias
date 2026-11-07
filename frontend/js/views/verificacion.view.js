/** Vista de acceso y verificación de cuentas. */
import { $, esc } from '../core/utils.js';

const ETIQUETAS = {
  'cuentas.activacion_ciudadano': 'Activación de cuentas ciudadanas',
  'cuentas.token_verificacion_horas': 'Vigencia del enlace de verificación (horas)',
  'cuentas.token_recuperacion_minutos': 'Vigencia del enlace de recuperación (minutos)',
  'cuentas.congelar_inactivas': 'Congelar cuentas inactivas',
  'cuentas.dias_inactividad': 'Días sin actividad antes de congelar'
};

function fila(configuracion, clave, porDefecto = '') {
  return configuracion.find((f) => f.clave === clave)?.valor ?? porDefecto;
}

export function renderizar(configuracion = []) {
  const contenedor = $('verificacionLista');
  if (!contenedor) return;

  const activacion = String(fila(configuracion, 'cuentas.activacion_ciudadano', 'correo'));
  const tokenVerificacion = fila(configuracion, 'cuentas.token_verificacion_horas', 24);
  const tokenRecuperacion = fila(configuracion, 'cuentas.token_recuperacion_minutos', 60);
  const congelar = fila(configuracion, 'cuentas.congelar_inactivas', true) === true;
  const diasInactividad = fila(configuracion, 'cuentas.dias_inactividad', 30);

  contenedor.innerHTML = `
    <div class="panel-blanco u-mb-12">
      <h4 class="titulo-seccion u-mb-8">Ciudadanos</h4>
      <div class="form-group">
        <label for="verifActivacion">${esc(ETIQUETAS['cuentas.activacion_ciudadano'])}</label>
        <select id="verifActivacion" data-config-key="cuentas.activacion_ciudadano">
          <option value="correo" ${activacion === 'correo' ? 'selected' : ''}>Confirmar el correo antes de entrar</option>
          <option value="automatica" ${activacion === 'automatica' ? 'selected' : ''}>Activación automática al registrarse</option>
        </select>
        <p class="campo-nota">
          Con «Confirmar el correo» el alta queda pendiente hasta abrir el enlace enviado al correo.
          Con «Activación automática» la cuenta puede entrar de inmediato; úsalo solo para pruebas
          o instalaciones controladas.
        </p>
      </div>
      <div class="filter-row">
        <div class="form-group">
          <label for="verifTokenVerificacion">${esc(ETIQUETAS['cuentas.token_verificacion_horas'])}</label>
          <input type="number" min="1" max="720" id="verifTokenVerificacion"
                 autocomplete="off" data-config-key="cuentas.token_verificacion_horas"
                 value="${esc(String(tokenVerificacion))}">
        </div>
        <div class="form-group">
          <label for="verifTokenRecuperacion">${esc(ETIQUETAS['cuentas.token_recuperacion_minutos'])}</label>
          <input type="number" min="5" max="1440" id="verifTokenRecuperacion"
                 autocomplete="off" data-config-key="cuentas.token_recuperacion_minutos"
                 value="${esc(String(tokenRecuperacion))}">
        </div>
      </div>
    </div>

    <div class="panel-blanco u-mb-12">
      <h4 class="titulo-seccion u-mb-8">Inactividad</h4>
      <label class="check-line">
        <input type="checkbox" id="verifCongelarInactivas"
               data-config-key="cuentas.congelar_inactivas" ${congelar ? 'checked' : ''}>
        <span>${esc(ETIQUETAS['cuentas.congelar_inactivas'])}</span>
      </label>
      <div class="form-group u-mt-8">
        <label for="verifDiasInactividad">${esc(ETIQUETAS['cuentas.dias_inactividad'])}</label>
        <input type="number" min="1" max="365" id="verifDiasInactividad"
               autocomplete="off" data-config-key="cuentas.dias_inactividad"
               value="${esc(String(diasInactividad))}">
      </div>
      <p class="campo-nota">
        El job revisa la actividad cada 6 horas. Si se desactiva, las cuentas no se congelan
        automáticamente, pero el titular todavía puede congelar o eliminar la suya.
      </p>
    </div>

    <div class="panel-blanco u-mb-12">
      <h4 class="titulo-seccion u-mb-8">Personal</h4>
      <p class="campo-nota u-m-0">
        La clave de activación del personal sigue siendo obligatoria y no se puede desactivar
        desde esta vista: protege el acceso al panel y define territorio y permisos. Para probar
        altas de personal, crea o renueva una clave desde «Claves de acceso».
      </p>
    </div>`;
}

export function leer() {
  const datos = {};
  document.querySelectorAll('#panel-verificacion [data-config-key]').forEach((elemento) => {
    const clave = elemento.dataset.configKey;
    if (elemento.type === 'checkbox') datos[clave] = elemento.checked;
    else if (elemento.type === 'number') datos[clave] = Number(elemento.value);
    else datos[clave] = elemento.value;
  });
  return datos;
}
