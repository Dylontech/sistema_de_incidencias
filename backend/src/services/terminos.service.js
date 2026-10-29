/**
 * Almacenamiento de los términos y condiciones en disco.
 * Se guarda en data/terminos.html para no depender del driver de base de datos.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';

const ARCHIVO = path.join(config.paths.data, 'terminos.html');

/** Texto por defecto si aún no se ha publicado nada. */
export const TERMINOS_POR_DEFECTO = `
<div class="terminos-resumen">
  <strong>Resumen</strong>
  <ol>
    <li>Esta página es informativa: no somos una entidad gubernamental.</li>
    <li>Los datos que generes pueden ser compartidos con terceros conforme a la LFPDPPP.</li>
    <li>Puedes ejercer tus derechos ARCO escribiendo al correo del responsable.</li>
    <li>El mal uso puede provocar un bloqueo permanente.</li>
  </ol>
</div>
<p class="terminos-fecha">Términos y condiciones · pendientes de publicar.</p>
`.trim();

export async function leerTerminos() {
  try {
    return await fs.readFile(ARCHIVO, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return TERMINOS_POR_DEFECTO;
    throw err;
  }
}

export async function guardarTerminos(html) {
  await fs.mkdir(path.dirname(ARCHIVO), { recursive: true });
  await fs.writeFile(ARCHIVO, html, 'utf8');
}