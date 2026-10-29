import { crearApp } from '../src/app.js';
import request from 'supertest';
import { obtenerRepositorio, cerrarRepositorio } from '../src/repositories/index.js';

const app = crearApp();
const admin = await request(app).post('/api/auth/admin').send({ username: 'admin', password: 'admin123' });
const token = admin.body.token;
const auth = { Authorization: `Bearer ${token}` };

const marca = `RESPALDO-${Date.now()}`;
const sugerencia = await request(app)
  .post('/api/publico/sugerencias')
  .send({ tipo: 'mejora', nombre: 'Prueba respaldo', correo: 'respaldo@test.local', mensaje: marca });
console.log('sugerencia creada', sugerencia.status, sugerencia.body.folio);

const creado = await request(app)
  .post('/api/admin/respaldos')
  .set(auth)
  .send({ nombre: `Respaldo restauración ${marca}`, notas: 'Prueba de restauración' });
console.log('respaldo', creado.status, creado.body.respaldo?.id, creado.body.respaldo?.estado);
const id = creado.body.respaldo.id;

const repo = await obtenerRepositorio();
await repo.knex('sugerencias').where({ mensaje: marca }).del();
const antes = await repo.knex('sugerencias').where({ mensaje: marca }).first();
console.log('sugerencia borrada', Boolean(antes) === false);
await cerrarRepositorio();

const restaurado = await request(app)
  .post(`/api/admin/respaldos/${id}/restaurar`)
  .set(auth)
  .send({ confirmacion: 'RESTAURAR' });
console.log('restaurar', restaurado.status, restaurado.body.respaldo?.estado, restaurado.body.error || '');

const repo2 = await obtenerRepositorio();
const despues = await repo2.knex('sugerencias').where({ mensaje: marca }).first();
console.log('sugerencia recuperada', Boolean(despues));
await cerrarRepositorio();
