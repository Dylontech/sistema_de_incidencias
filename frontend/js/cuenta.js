/**
 * Página pública de la cuenta.
 *
 * - `?token=...` valida el enlace y muestra confirmación de correo o el
 *   formulario de nueva contraseña.
 * - Sin token muestra la solicitud de recuperación y el reenvío de confirmación.
 *
 * No usa el armazón de la aplicación: esta página debe funcionar sin sesión.
 */
import { $ } from './core/utils.js';

const API = '/api/auth/cuenta';

function mostrar(texto, tipo = 'info') {
  const caja = $('cuentaEstado');
  if (!caja) return;
  caja.className = `publico-msg ${tipo}`;
  caja.textContent = texto || '';
  caja.hidden = false;
  caja.classList.remove('u-oculto');
}

function limpiarMensaje() {
  const caja = $('cuentaEstado');
  if (!caja) return;
  caja.className = 'publico-msg u-oculto';
  caja.textContent = '';
  caja.hidden = true;
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
    error.detalles = cuerpo.detalles || null;
    throw error;
  }
  return cuerpo;
}

function ocultarBloques() {
  for (const id of [
    'cuentaSolicitudBox',
    'cuentaVerificarBox',
    'cuentaPasswordBox',
    'cuentaAccionesBox'
  ]) {
    const bloque = $(id);
    if (bloque) bloque.hidden = true;
  }
}

function mostrarAcceso({ nombre, username, rol }) {
  ocultarBloques();
  const caja = $('cuentaAccionesBox');
  const enlace = $('cuentaIrLogin');
  const texto = $('cuentaAccesoTexto');
  const esPersonal = rol && rol !== 'ciudadano';
  if (texto) {
    texto.textContent = esPersonal
      ? `Tu usuario es «${username}». Entra por el acceso del personal con ese usuario o tu correo y tu contraseña; se te pedirá la clave de activación.`
      : `Tu nombre de acceso es «${nombre}». También puedes entrar con el correo de tu cuenta y tu contraseña.`;
  }
  if (enlace) {
    enlace.href = esPersonal
      ? `/personal?usuario=${encodeURIComponent(username || '')}`
      : `/?login=1&usuario=${encodeURIComponent(nombre || '')}`;
  }
  if (caja) caja.hidden = false;
}

async function validarEnlace(token) {
  ocupado(true, 'Validando enlace…');
  try {
    const datos = await pedir('/validar-token', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    ocultarBloques();
    if (datos.tipo === 'verificar_correo') {
      $('cuentaSubtitulo').textContent = 'Confirma tu correo para activar la cuenta.';
      $('cuentaVerificarTexto').textContent = `Hola ${datos.nombre || ''}. Pulsa el botón para confirmar tu correo.`;
      $('cuentaVerificarBox').hidden = false;
      $('cuentaVerificarBtn').dataset.token = token;
      $('cuentaVerificarBtn').dataset.nombre = datos.nombre || '';
      $('cuentaVerificarBtn').dataset.username = datos.username || '';
      $('cuentaVerificarBtn').dataset.rol = datos.rol || 'ciudadano';
      return;
    }
    if (datos.tipo === 'recuperar_password') {
      $('cuentaSubtitulo').textContent = 'Elige una contraseña nueva.';
      $('cuentaPasswordBox').hidden = false;
      $('formCuentaPassword').dataset.token = token;
      $('formCuentaPassword').dataset.nombre = datos.nombre || '';
      $('formCuentaPassword').dataset.username = datos.username || '';
      $('formCuentaPassword').dataset.rol = datos.rol || 'ciudadano';
      $('cuentaPass').focus();
      return;
    }
    mostrar('Este enlace no corresponde a una acción válida.', 'err');
  } catch (error) {
    mostrar(error.message, 'err');
    $('cuentaSolicitudBox').hidden = false;
  } finally {
    ocupado(false);
  }
}

async function confirmarCorreo(boton) {
  const token = boton.dataset.token || '';
  ocupado(true, 'Confirmando correo…');
  try {
    const resultado = await pedir('/verificar', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    limpiarMensaje();
    mostrar('Correo confirmado. Tu cuenta está lista.', 'ok');
    mostrarAcceso({
      nombre: resultado.nombre,
      username: resultado.username,
      rol: resultado.rol
    });
  } catch (error) {
    mostrar(error.message, 'err');
  } finally {
    ocupado(false);
  }
}

async function guardarPassword(form) {
  const password = $('cuentaPass')?.value || '';
  const repetida = $('cuentaPass2')?.value || '';
  if (password.length < 8) {
    return mostrar('La contraseña debe tener al menos 8 caracteres.', 'err');
  }
  if (password !== repetida) {
    return mostrar('Las contraseñas no coinciden.', 'err');
  }
  ocupado(true, 'Guardando contraseña…');
  try {
    const resultado = await pedir('/restablecer', {
      method: 'POST',
      body: JSON.stringify({ token: form.dataset.token || '', password })
    });
    limpiarMensaje();
    mostrar('Contraseña actualizada. Ya puedes iniciar sesión.', 'ok');
    mostrarAcceso({
      nombre: resultado.nombre,
      username: resultado.username,
      rol: resultado.rol
    });
  } catch (error) {
    mostrar(error.message, 'err');
  } finally {
    ocupado(false);
  }
}

async function solicitar(tipo) {
  const correo = $('cuentaCorreo')?.value.trim() || '';
  if (!correo) return mostrar('Escribe el correo de la cuenta.', 'err');
  const ruta = tipo === 'verificacion' ? '/reenviar-verificacion' : '/recuperar';
  ocupado(true, tipo === 'verificacion' ? 'Reenviando confirmación…' : 'Enviando enlace…');
  try {
    await pedir(ruta, {
      method: 'POST',
      body: JSON.stringify({ correo })
    });
    mostrar(
      tipo === 'verificacion'
        ? 'Si el correo pertenece a una cuenta sin confirmar, recibirás un enlace nuevo.'
        : 'Si el correo pertenece a una cuenta, recibirás un enlace para cambiar la contraseña.',
      'ok'
    );
  } catch (error) {
    mostrar(error.message, 'err');
  } finally {
    ocupado(false);
  }
}

function conectar() {
  $('formCuentaSolicitud')?.addEventListener('submit', (evento) => {
    evento.preventDefault();
    solicitar('recuperacion');
  });
  $('cuentaReenviarBtn')?.addEventListener('click', () => solicitar('verificacion'));
  $('cuentaVerificarBtn')?.addEventListener('click', (evento) =>
    confirmarCorreo(evento.currentTarget)
  );
  $('formCuentaPassword')?.addEventListener('submit', (evento) => {
    evento.preventDefault();
    guardarPassword(evento.currentTarget);
  });
}

function iniciar() {
  conectar();
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    validarEnlace(token);
    return;
  }
  if (params.get('reenviar') === '1') {
    mostrar('Escribe el correo de la cuenta y pulsa «Reenviar confirmación».', 'info');
  }
  $('cuentaCorreo')?.focus();
}

iniciar();
