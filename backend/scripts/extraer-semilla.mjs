/**
 * Extrae los datos semilla del monolito original (legacy/) y los escribe como
 * JSON en src/config/seed-data/. Se ejecuta una sola vez:
 *
 *   npm --prefix backend run extraer-semilla
 *
 * Se hace por programa y no a mano para garantizar fidelidad exacta
 * (polígonos de zonas y emojis de los tipos incluidos).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const legacyHtml = path.resolve(backendRoot, '../legacy/sistema_de_incidencias.html');
const outDir = path.join(backendRoot, 'src/config/seed-data');

const html = fs.readFileSync(legacyHtml, 'utf8');

/**
 * Devuelve el primer literal (array u objeto) que aparece en `texto`,
 * respetando cadenas, comentarios y anidamiento.
 */
function recortarLiteral(texto) {
  let profundidad = 0;
  let inicio = -1;
  let cadena = null;
  let enLinea = false;
  let enBloque = false;

  // Los primitivos (números, cadenas) terminan en el primer punto y coma.
  let j = 0;
  while (j < texto.length && /\s/.test(texto[j])) j++;
  if (texto[j] !== '[' && texto[j] !== '{') {
    const fin = texto.indexOf(';', j);
    return texto.slice(j, fin === -1 ? undefined : fin);
  }

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const sig = texto[i + 1];

    if (enLinea) { if (c === '\n') enLinea = false; continue; }
    if (enBloque) { if (c === '*' && sig === '/') { enBloque = false; i++; } continue; }
    if (cadena) {
      if (c === '\\') { i++; continue; }
      if (c === cadena) cadena = null;
      continue;
    }
    if (c === '/' && sig === '/') { enLinea = true; i++; continue; }
    if (c === '/' && sig === '*') { enBloque = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { cadena = c; continue; }
    if (c === '[' || c === '{') {
      if (inicio === -1) inicio = i;
      profundidad++;
      continue;
    }
    if (c === ']' || c === '}') {
      profundidad--;
      if (profundidad === 0) return texto.slice(inicio, i + 1);
      if (profundidad < 0) break;
    }
  }
  throw new Error('Literal sin cerrar');
}

/** Extrae un literal JS declarado como `const <nombre> = ...`. */
function extraerLiteral(nombre) {
  const marker = `const ${nombre} = `;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`No se encontró la constante ${nombre} en el monolito`);

  const fuente = recortarLiteral(html.slice(start + marker.length));
  // Los literales son datos puros: evaluarlos preserva los emojis tal cual.
  return new Function(`return (${fuente});`)();
}

const semilla = {
  'municipios.json': extraerLiteral('MUNICIPIOS_DEFAULT'),
  'zonas.json': extraerLiteral('ZONAS_DEFAULT'),
  'tipos.json': extraerLiteral('TIPOS_DEFAULT'),
  'ejemplos-tipo.json': extraerLiteral('EJEMPLOS_TIPO'),
  'iconos.json': extraerLiteral('ICONOS_DISPONIBLES'),
  'politica.json': {
    DIAS_LIMITES: extraerLiteral('DIAS_LIMITES'),
    MAX_FOTO: extraerLiteral('MAX_FOTO'),
    MAX_VIDEO: extraerLiteral('MAX_VIDEO'),
    MAX_VIDEO_SEG: extraerLiteral('MAX_VIDEO_SEG')
  }
};

/** Usuarios demo: viven dentro de DB.getUsuarios() como `const defaults = [...]`. */
const usuariosLegacy = extraerLiteral('defaults').map((u) => ({
  id: u.id,
  username: u.username,
  nombre: u.nombre,
  rol: u.rol,
  municipioId: u.municipioId,
  activo: u.activo !== false,
  passwordInicial: u.password
}));
semilla['usuarios.json'] = usuariosLegacy;

fs.mkdirSync(outDir, { recursive: true });
for (const [archivo, contenido] of Object.entries(semilla)) {
  fs.writeFileSync(path.join(outDir, archivo), JSON.stringify(contenido, null, 2) + '\n', 'utf8');
}

const resumen = Object.entries(semilla)
  .map(([archivo, valor]) => {
    const n = Array.isArray(valor) ? valor.length : Object.keys(valor).length;
    return `  ${archivo.padEnd(22)} ${n} registro(s)`;
  })
  .join('\n');

console.log('Datos semilla extraídos desde legacy/sistema_de_incidencias.html:\n' + resumen);

// Verificación de integridad de los emojis (evita el bug de U+FFFD al escribir).
const tipos = semilla['tipos.json'];
const corruptos = tipos.filter((t) => !t.icono || t.icono.codePointAt(0) === 0xfffd);
if (corruptos.length) {
  console.error('ATENCIÓN: iconos corruptos detectados:', corruptos.map((t) => t.id));
  process.exitCode = 1;
} else {
  console.log(`Iconos verificados: ${tipos.length} tipos con emoji válido (ej. ${tipos[0].icono} ${tipos[0].nombre}).`);
}
