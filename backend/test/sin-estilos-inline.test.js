/**
 * Guarda contra la vuelta de los estilos y scripts en línea.
 *
 * La política de contenidos va con `style-src 'self'`, `style-src-attr 'none'`
 * y `script-src 'self'`: cualquier atributo `style="…"`, cualquier bloque
 * `<style>` o `<script>` sin `src`, o cualquier manejador `onclick="…"` haría
 * que el navegador descartara justo esa parte de la interfaz (y a veces solo esa,
 * así que el fallo se ve como un elemento «descolocado» difícil de atribuir).
 *
 * Se revisa el frontend entero: los tres HTML y todos los módulos JS, incluidas
 * las plantillas que generan las vistas con innerHTML.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('../../frontend', import.meta.url));

// `vendor/` son librerías de terceros copiadas tal cual (Leaflet aplica sus
// posiciones por CSSOM, que la CSP sí permite). No se editan.
const DIRECTORIOS_IGNORADOS = new Set(['vendor']);

const PATRONES = [
  {
    nombre: 'atributo style en línea',
    patron: /style\s*=\s*["']/,
    ayuda: 'usa una clase de css/extensiones.css o aplica el valor por CSSOM con aplicarEstilosDinamicos()'
  },
  {
    nombre: 'style aplicado con setAttribute',
    patron: /setAttribute\(\s*['"]style['"]/,
    ayuda: 'asigna la propiedad por CSSOM (elemento.style.x = …), que la CSP sí permite'
  },
  {
    nombre: 'manejador de evento en línea',
    patron: /\son(click|change|input|submit|load|error|focus|blur|mouseover)\s*=\s*["']/,
    ayuda: 'usa un atributo data-action/data-change/data-input y regístralo con registrarAcciones()'
  },
  {
    nombre: 'script en línea',
    patron: /<script(?![^>]*\bsrc=)[^>]*>/i,
    ayuda: 'muévelo a un archivo propio enlazado con <script src="…">'
  },
  {
    nombre: 'bloque de estilos en línea',
    patron: /<style[\s>]/i,
    ayuda: 'muévelo a un archivo .css enlazado con <link rel="stylesheet">'
  }
];

/** Rutas de los HTML y JS del frontend, sin las librerías copiadas. */
function archivosDelFrontend(dir = FRONTEND) {
  const encontrados = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (DIRECTORIOS_IGNORADOS.has(entrada.name)) continue;
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) encontrados.push(...archivosDelFrontend(completo));
    else if (/\.(html|js)$/.test(entrada.name)) encontrados.push(completo);
  }
  return encontrados;
}

test('el frontend no usa nada en línea que la CSP bloquearía', () => {
  const infracciones = [];

  for (const archivo of archivosDelFrontend()) {
    const lineas = fs.readFileSync(archivo, 'utf8').split('\n');
    lineas.forEach((linea, indice) => {
      for (const { nombre, patron, ayuda } of PATRONES) {
        if (patron.test(linea)) {
          infracciones.push(
            `${path.relative(FRONTEND, archivo)}:${indice + 1} → ${nombre} (${ayuda})`
          );
        }
      }
    });
  }

  assert.deepEqual(
    infracciones,
    [],
    `La política de contenidos bloquearía estos elementos:\n  ${infracciones.join('\n  ')}`
  );
});
