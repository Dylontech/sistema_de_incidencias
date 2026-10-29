import { crearApp } from '../src/app.js';
import request from 'supertest';

const app = crearApp();

const admin = await request(app).post('/api/auth/admin').send({ username: 'admin', password: 'admin123' });
if (admin.status !== 200) throw new Error(`Admin no entra: ${admin.status} ${JSON.stringify(admin.body)}`);
const tokenAdmin = admin.body.token;

const personal = await request(app)
  .get('/api/usuarios?tipo=personal')
  .set('Authorization', `Bearer ${tokenAdmin}`);
const funcionario = personal.body.usuarios?.find((u) => u.username === 'funcionario');
if (!funcionario) throw new Error('No existe el funcionario demo');

const patch = await request(app)
  .patch(`/api/usuarios/${funcionario.id}`)
  .set('Authorization', `Bearer ${tokenAdmin}`)
  .send({ password: 'func1234', activo: true });
console.log('patch funcionario', patch.status, patch.body.error || 'ok');

const loginFuncionario = await request(app)
  .post('/api/auth/funcionario')
  .send({ username: 'funcionario', password: 'func1234', claveMunicipio: '16050' });
console.log('login funcionario', loginFuncionario.status, loginFuncionario.body.error || 'ok');
if (loginFuncionario.status !== 200) process.exit(1);
const tokenFuncionario = loginFuncionario.body.token;

const correo = `contacto-${Date.now()}@test.local`;
const registro = await request(app)
  .post('/api/auth/registro')
  .send({ correo, password: 'prueba123', nombre: `Contactante ${Date.now()}`, municipioId: '16050' });
if (registro.status !== 201) throw new Error(`Registro: ${JSON.stringify(registro.body)}`);
const tokenCiudadano = registro.body.token;

const disponibles = await request(app)
  .get('/api/contacto/funcionarios?municipioId=16050')
  .set('Authorization', `Bearer ${tokenCiudadano}`);
console.log('funcionarios', disponibles.status, disponibles.body.funcionarios?.length);

const creado = await request(app)
  .post('/api/contacto/funcionarios')
  .set('Authorization', `Bearer ${tokenCiudadano}`)
  .send({
    municipioId: '16050',
    funcionarioIds: [disponibles.body.funcionarios[0].id],
    asunto: 'Prueba de contacto directo',
    mensaje: 'Mensaje real de prueba'
  });
console.log('crear contacto', creado.status, JSON.stringify(creado.body).slice(0, 180));

const bandeja = await request(app)
  .get('/api/contacto/directo')
  .set('Authorization', `Bearer ${tokenFuncionario}`);
console.log('bandeja', bandeja.status, bandeja.body.contactos?.length);
const contactoId = bandeja.body.contactos?.[0]?.id;
if (contactoId) {
  const respuesta = await request(app)
    .post(`/api/contacto/directo/${contactoId}/mensajes`)
    .set('Authorization', `Bearer ${tokenFuncionario}`)
    .send({ cuerpo: 'Respuesta del funcionario' });
  console.log('respuesta', respuesta.status, respuesta.body.contacto?.estado);

  const detalleCiudadano = await request(app)
    .get(`/api/contacto/directo/${contactoId}`)
    .set('Authorization', `Bearer ${tokenCiudadano}`);
  console.log('detalle ciudadano', detalleCiudadano.status, detalleCiudadano.body.contacto?.mensajes?.length);
}
