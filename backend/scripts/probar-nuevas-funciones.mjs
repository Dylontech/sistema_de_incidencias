import { crearApp } from '../src/app.js';
import request from 'supertest';

const app = crearApp();
const admin = await request(app).post('/api/auth/admin').send({ username: 'admin', password: 'admin123' });
if (admin.status !== 200) throw new Error(`admin: ${JSON.stringify(admin.body)}`);
const token = admin.body.token;
const auth = { Authorization: `Bearer ${token}` };

const respaldo = await request(app)
  .post('/api/admin/respaldos')
  .set(auth)
  .send({ nombre: 'Respaldo de prueba V2.2', notas: 'Verificación funcional' });
console.log('crear respaldo', respaldo.status, respaldo.body.respaldo?.estado, respaldo.body.respaldo?.tamano);

const busqueda = await request(app)
  .get('/api/admin/respaldos?texto=prueba')
  .set(auth);
console.log('buscar respaldo', busqueda.status, busqueda.body.total, busqueda.body.respaldos?.length);

const stats = await request(app).get('/api/admin/respaldos/estadisticas').set(auth);
console.log('stats respaldos', stats.status, stats.body.estadisticas?.total);

const historial = await request(app).get('/api/notificaciones/historial').set(auth);
console.log('historial notificaciones', historial.status, historial.body.total);

const informes = await request(app).get('/api/admin/solicitudes-informe').set(auth);
console.log('solicitudes informe', informes.status, informes.body.solicitudes?.length);

const correo = `folios-${Date.now()}@test.local`;
const registro = await request(app)
  .post('/api/auth/registro')
  .send({ correo, password: 'prueba123', nombre: `Usuario Folios ${Date.now()}`, municipioId: '16050' });
const tokenCiudadano = registro.body.token;
const folios = await request(app)
  .get('/api/folios/mios?texto=&limite=50')
  .set({ Authorization: `Bearer ${tokenCiudadano}` });
console.log('folios ciudadano', folios.status, folios.body.total, folios.body.folios?.length);

const contacto = await request(app)
  .post('/api/contacto/funcionarios/solicitar-admin')
  .set({ Authorization: `Bearer ${tokenCiudadano}` })
  .send({ municipioId: '16050', mensaje: 'No hay funcionario en este municipio' });
console.log('solicitud admin (municipio con funcionarios, debe fallar)', contacto.status, contacto.body.error);
