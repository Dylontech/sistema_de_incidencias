/**
 * Servidor local de mapas offline (PMTiles).
 *
 * La app NO descarga teselas de OpenStreetMap. El paquete `.pmtiles` se genera
 * aparte con datos de Geofabrik y herramientas open source (ver
 * `scripts/generar-mapas-offline.mjs`). Este servidor solo lo sirve en
 * 127.0.0.1 para que el visor lo lea sin depender de internet.
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const TIPOS = {
  '.pmtiles': 'application/vnd.pmtiles',
  '.json': 'application/json; charset=utf-8',
  '.mbtiles': 'application/vnd.mbtiles'
};

function carpetaMapas(app) {
  const empaquetado = path.join(process.resourcesPath || '', 'recursos', 'mapas');
  if (fs.existsSync(empaquetado)) return empaquetado;
  return path.join(app.getAppPath(), 'recursos', 'mapas');
}

function listar(carpeta) {
  try {
    return fs
      .readdirSync(carpeta)
      .filter((nombre) => Object.keys(TIPOS).includes(path.extname(nombre).toLowerCase()));
  } catch {
    return [];
  }
}

function servirArchivo(req, res, carpeta, nombre) {
  const ruta = path.join(carpeta, path.basename(nombre));
  if (!ruta.startsWith(carpeta) || !fs.existsSync(ruta)) {
    res.writeHead(404).end('No encontrado');
    return;
  }

  const estadistica = fs.statSync(ruta);
  const tipo = TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream';
  const cabeceras = {
    'Content-Type': tipo,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=86400'
  };

  const rango = req.headers.range;
  if (!rango) {
    res.writeHead(200, { ...cabeceras, 'Content-Length': estadistica.size });
    fs.createReadStream(ruta).pipe(res);
    return;
  }

  const coincidencia = /^bytes=(\d*)-(\d*)$/.exec(rango);
  if (!coincidencia) {
    res.writeHead(416, { ...cabeceras, 'Content-Range': `bytes */${estadistica.size}` }).end();
    return;
  }

  const inicio = coincidencia[1] ? Number(coincidencia[1]) : 0;
  const fin = coincidencia[2] ? Number(coincidencia[2]) : estadistica.size - 1;
  if (inicio >= estadistica.size || fin >= estadistica.size || inicio > fin) {
    res.writeHead(416, { ...cabeceras, 'Content-Range': `bytes */${estadistica.size}` }).end();
    return;
  }

  res.writeHead(206, {
    ...cabeceras,
    'Content-Range': `bytes ${inicio}-${fin}/${estadistica.size}`,
    'Content-Length': fin - inicio + 1
  });
  fs.createReadStream(ruta, { start: inicio, end: fin }).pipe(res);
}

/**
 * Arranca el servidor si hay archivos. Devuelve `{ url, archivos, cerrar }`.
 * Si no hay paquete offline, `url` es null y la app usa las teselas online.
 */
function iniciar(app) {
  const carpeta = carpetaMapas(app);
  const archivos = listar(carpeta);
  if (!archivos.length) {
    return { url: null, archivos: [], carpeta, cerrar: () => {} };
  }

  const servidor = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type'
      });
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://127.0.0.1');
    const coincidencia = /^\/mapas\/(.+)$/.exec(url.pathname);
    if (!coincidencia) {
      res.writeHead(404).end('No encontrado');
      return;
    }
    if (req.method === 'HEAD') {
      const ruta = path.join(carpeta, path.basename(coincidencia[1]));
      if (!fs.existsSync(ruta)) return res.writeHead(404).end();
      const estadistica = fs.statSync(ruta);
      return res
        .writeHead(200, {
          'Content-Type': TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream',
          'Content-Length': estadistica.size,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        })
        .end();
    }
    servirArchivo(req, res, carpeta, coincidencia[1]);
  });

  servidor.listen(0, '127.0.0.1');
  const direccion = servidor.address();
  return {
    url: `http://127.0.0.1:${direccion.port}`,
    archivos,
    carpeta,
    cerrar: () => servidor.close()
  };
}

module.exports = { iniciar, carpetaMapas };
