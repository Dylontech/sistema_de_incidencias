/**
 * Arranque de desarrollo con protección contra watchers duplicados.
 *
 * `node --watch` deja el proceso esperando si el hijo falla. Si se lanza dos
 * veces `npm run dev`, el segundo watcher choca con el puerto y se queda en un
 * bucle de «Failed running». Antes de crear el watcher comprobamos el puerto:
 * si ya hay un servidor, se informa y se sale con código 0 sin dejar procesos
 * en cola. Así solo puede quedar un servidor de desarrollo activo.
 */
import net from 'node:net';
import { spawn } from 'node:child_process';
import { backendRoot, config } from '../src/config/index.js';

const puerto = Number(config.port) || 3000;

function puertoLibre() {
  return new Promise((resolver) => {
    const sonda = net.createServer();
    sonda.once('error', (error) => {
      resolver(error.code !== 'EADDRINUSE');
    });
    sonda.once('listening', () => {
      sonda.close(() => resolver(true));
    });
    sonda.listen(puerto);
  });
}

if (!(await puertoLibre())) {
  console.log(`\n[dev] El puerto ${puerto} ya está en uso.`);
  console.log('[dev] No se inicia otro watcher para no dejar procesos en cola.');
  console.log(`[dev] Abre http://localhost:${puerto} o detén el servidor existente.`);
  process.exit(0);
}

const hijo = spawn(process.execPath, ['--watch', 'src/server.js'], {
  cwd: backendRoot,
  stdio: 'inherit',
  env: process.env
});

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    if (!hijo.killed) hijo.kill(senal);
  });
}

hijo.on('exit', (codigo, senal) => {
  if (senal) process.kill(process.pid, senal);
  else process.exit(codigo ?? 0);
});
