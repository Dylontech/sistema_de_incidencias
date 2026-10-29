import { crearApp } from '../src/app.js';
import request from 'supertest';

const app = crearApp();
const correo = `informe-${Date.now()}@test.local`;

const futuro = await request(app)
  .post('/api/publico/solicitudes-informe')
  .send({
    nombre: 'Prueba futura',
    correo,
    municipios: ['16050', '16053'],
    estados: [],
    tiposTodos: true,
    desde: '2026-10-01',
    hasta: '2029-12-31',
    aceptaTerminos: true
  });
console.log('futuro (debe fallar)', futuro.status, futuro.body.error);

const valido = await request(app)
  .post('/api/publico/solicitudes-informe')
  .send({
    nombre: 'Prueba multi',
    correo,
    municipios: ['16050', '16053'],
    estados: [],
    tiposTodos: true,
    ambitos: ['urbano', 'carretera_estatal'],
    desde: '2026-01-01',
    hasta: '2026-10-25',
    aceptaTerminos: true,
    formato: 'csv'
  });
console.log('valido', valido.status, JSON.stringify(valido.body).slice(0, 250));
