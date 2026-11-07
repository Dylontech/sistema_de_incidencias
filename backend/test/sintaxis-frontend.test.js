/** Regresión de sintaxis: todos los módulos del navegador deben ser válidos. */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const carpeta = path.join(raiz, 'frontend/js');

function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(dir, entrada.name);
    return entrada.isDirectory() ? archivos(ruta) : entrada.name.endsWith('.js') ? [ruta] : [];
  });
}

describe('Sintaxis del frontend', () => {
  test('todos los módulos JS pasan la comprobación del motor', () => {
    for (const archivo of archivos(carpeta)) {
      // La entrada estándar obliga a analizar como módulo: el navegador ejecuta
      // estos archivos con `type="module"` y un error de plantilla solo aparece
      // ahí (por ejemplo, un `${` sin cerrar que convierte `/div>` en regex).
      const resultado = spawnSync(process.execPath, ['--input-type=module', '--check'], {
        encoding: 'utf8',
        input: fs.readFileSync(archivo, 'utf8')
      });
      assert.equal(resultado.status, 0, `${archivo}\n${resultado.stderr}`);
    }
  });

  test('no quedan secuencias de escape literales de una edición rota', () => {
    for (const archivo of archivos(carpeta)) {
      const contenido = fs.readFileSync(archivo, 'utf8');
      assert.ok(
        !contenido.includes('*/\\nexport'),
        `Secuencia literal */\\nexport en ${archivo}`
      );
    }
  });
});
