/**
 * Contratos del rediseño Bento (2026-11).
 *
 * El rediseño vive casi por completo en `frontend/css/extensiones.css` y en el
 * orden del marcado del panel lateral. Estas pruebas vigilan lo que una captura
 * no detecta: conflictos de fusión sin resolver, IDs duplicados, que los tokens
 * de la paleta existan y que la capa visual no introduzca estilos en línea.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('../../frontend', import.meta.url));
const leer = (relativo) => fs.readFileSync(path.join(FRONTEND, relativo), 'utf8');

describe('Rediseño Bento: integridad del marcado', () => {
  test('index.html no conserva marcadores de conflicto', () => {
    const html = leer('index.html');
    assert.doesNotMatch(html, /^<<<<<<< /m);
    assert.doesNotMatch(html, /^=======$/m);
    assert.doesNotMatch(html, /^>>>>>>> /m);
  });

  test('los id de index.html son únicos', () => {
    const html = leer('index.html');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const duplicados = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual([...new Set(duplicados)], [], `IDs duplicados: ${duplicados.join(', ')}`);
  });

  test('el panel conserva los filtros y el control de plegado', () => {
    const html = leer('index.html');
    assert.match(html, /id="sidebarFilters"/);
    assert.match(html, /data-action="lista:filtros:toggle"/);
    for (const id of [
      'filterText',
      'filterEstado',
      'filterTipo',
      'filterColor',
      'filterOrden',
      'filterZona',
      'filterAmbito'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`), `falta ${id}`);
    }
  });
});

describe('Rediseño Bento: tokens y capa visual', () => {
  const css = leer('css/extensiones.css');

  test('la paleta declarada está disponible como variables', () => {
    for (const token of [
      '--bento-magenta: #9C1C55',
      '--bento-gold: #C5A059',
      '--bento-canvas: #F4F5F7',
      '--bento-card: #FFFFFF',
      '--bento-ink: #1E232A',
      '--bento-muted: #8C939E'
    ]) {
      assert.ok(css.includes(token), `token ausente: ${token}`);
    }
  });

  test('los nombres heredados apuntan a la paleta nueva', () => {
    assert.match(css, /--primario:\s*var\(--bento-magenta\)/);
    assert.match(css, /--fondo:\s*var\(--bento-canvas\)/);
    assert.match(css, /--texto:\s*var\(--bento-ink\)/);
  });

  test('los estados semánticos conservan su color', () => {
    // Un reporte peligroso o resuelto no puede confundirse con un acento.
    assert.match(css, /\.incidencia-card\.estado-rojo\s*\{\s*border-left-color:\s*var\(--rojo\)/);
    assert.match(css, /\.incidencia-card\.estado-verde\s*\{\s*border-left-color:\s*var\(--verde\)/);
  });

  test('la capa Bento no puede tapar los elementos ocultos', () => {
    // Las vistas alternan `hidden`, `.u-oculto` y `style.display`; cualquier
    // clase nueva que fije `display` debe respetar esa regla.
    assert.match(leer('css/base.css'), /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
    assert.match(css, /REDISEÑO BENTO/);
  });

  test('las páginas públicas comparten los tokens', () => {
    for (const pagina of [
      'personal.html',
      'cuenta.html',
      'acerca.html',
      'legal.html',
      'suscripcion.html',
      'solicitud-acceso.html'
    ]) {
      assert.match(leer(pagina), /css\/extensiones\.css/, `${pagina} no carga extensiones.css`);
    }
  });
});
