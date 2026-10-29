import { crearApp } from '../src/app.js';
import request from 'supertest';

const app = crearApp();
const login = await request(app).post('/api/auth/admin').send({ username: 'admin', password: 'admin123' });
const token = login.body.token;
const auth = { Authorization: `Bearer ${token}` };

const lista = await request(app).get('/api/admin/solicitudes-informe').set(auth);
const solicitud = lista.body.solicitudes?.find((s) => s.municipios?.length > 1);
console.log('solicitud multi', solicitud?.id, solicitud?.folio, solicitud?.municipios, solicitud?.tiposTodos);
if (!solicitud) process.exit(1);

const vista = await request(app)
  .get(`/api/admin/solicitudes-informe/${solicitud.id}/vista-previa?formato=csv`)
  .set(auth);
console.log('vista previa', vista.status, vista.headers['content-type'], vista.text?.split('\n')[0]);

const generar = await request(app)
  .post(`/api/admin/solicitudes-informe/${solicitud.id}/generar`)
  .set(auth);
console.log('generar', generar.status, generar.body.archivo, generar.body.tamano);

const enviar = await request(app)
  .post(`/api/admin/solicitudes-informe/${solicitud.id}/enviar`)
  .set(auth);
console.log('enviar', enviar.status, enviar.body.solicitud?.estado, enviar.body.solicitud?.enviadoEn ? 'con fecha' : 'sin fecha');
