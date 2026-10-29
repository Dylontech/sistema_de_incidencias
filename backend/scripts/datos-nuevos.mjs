/**
 * Carga idempotente de datos V2.2 para una base demo.
 *
 * No borra nada: crea solo lo que falta y usa claves fijas para no duplicar.
 * Funciona con STORAGE_DRIVER=json o mysql.
 */
import { obtenerRepositorio, cerrarRepositorio } from '../src/repositories/index.js';
import { nuevoId } from '../src/utils/ids.js';
import { construirUsuario, hashearPassword } from '../src/models/usuario.model.js';
import { permisosDe } from '../src/services/permisos.service.js';
import * as configuracion from '../src/services/configuracion.service.js';
import * as legal from '../src/services/legal.service.js';
import * as incidencias from '../src/services/incidencias.service.js';
import * as firmas from '../src/services/firmas.service.js';
import * as solicitudes from '../src/services/solicitudes.service.js';
import * as publicidad from '../src/services/publicidad.service.js';
import * as correos from '../src/services/correos-institucionales.service.js';
import * as respaldos from '../src/services/respaldos.service.js';

const MUNICIPIO = '16050';
const ACTOR = { username: 'sistema', nombre: 'Datos demo' };

function usuarioDemo(cuenta) {
  return {
    id: cuenta.id,
    username: cuenta.username,
    userKey: cuenta.username,
    nombre: cuenta.nombre,
    correo: cuenta.correo || null,
    rol: cuenta.rol,
    municipioId: cuenta.municipioId || null,
    activo: true,
    esAnonimo: false,
    puedeEscribir: false,
    permisos: permisosDe(cuenta),
    municipios: [],
    estados: []
  };
}

async function asegurarCiudadano(repositorio, { username, nombre, correo }) {
  const existente = await repositorio.usuarioPorUsername(username);
  if (existente) return usuarioDemo(existente);
  const cuenta = construirUsuario({
    username,
    nombre,
    correo,
    rol: 'ciudadano',
    municipioId: MUNICIPIO,
    passwordHash: await hashearPassword('demo12345'),
    pseudonimo: false,
    puedeEscribir: false
  });
  await repositorio.crearUsuario(cuenta);
  return usuarioDemo(cuenta);
}

function resumen(titulo, valor) {
  console.log(`  ${titulo.padEnd(42)} ${valor}`);
}

async function main() {
  const repositorio = await obtenerRepositorio();
  try {
    const municipio = await repositorio.municipioPorId(MUNICIPIO);
    if (!municipio) throw new Error('No existe el municipio 16050; ejecuta la semilla primero');

    console.log('Datos V2.2 — base:', repositorio.driver);
    const config = await configuracion.todas(repositorio);
    resumen('Claves de configuración', config.length);

    for (const clave of ['terminos', 'privacidad', 'acerca']) {
      const { documento } = await legal.administrar(repositorio, clave);
      if (!documento.versionPublicada) {
        await legal.publicar(repositorio, ACTOR, clave);
        console.log(`  Documento legal publicado: ${clave}`);
      }
    }

    const autor = await asegurarCiudadano(repositorio, {
      username: 'demo_vecino',
      nombre: 'Vecino Demo',
      correo: 'demo_vecino@example.test'
    });
    const firmante = await asegurarCiudadano(repositorio, {
      username: 'demo_firmante',
      nombre: 'Firmante Demo',
      correo: 'demo_firmante@example.test'
    });

    let incidencia = await repositorio.incidenciaPorIdempotencia(autor.userKey, 'datos-nuevos-v22');
    if (!incidencia) {
      incidencia = await incidencias.crear(repositorio, autor, {
        tipoId: 'bache',
        titulo: '[DEMO V2.2] Bache en la avenida principal',
        descripcion: 'Reporte de demostración para firmas, comentarios y folios.',
        indicaciones: 'Datos de demostración.',
        lat: municipio.center[0],
        lng: municipio.center[1],
        municipioId: MUNICIPIO,
        ambito: 'urbano',
        claveIdempotencia: 'datos-nuevos-v22'
      });
      console.log('  Incidencia demo creada:', incidencia.folio);
    }
    resumen('Folio de incidencia demo', incidencia.folio || '—');

    const recoleccion = await repositorio.recoleccionFirmaPorIncidencia(incidencia.id);
    if (!recoleccion) {
      await firmas.fijarMetaIncidencia(repositorio, autor, incidencia.id, 3);
      const resumenFirma = await firmas.firmarIncidencia(repositorio, firmante, incidencia.id);
      resumen('Firmas de la incidencia demo', resumenFirma.total);
    }

    const municipales = await repositorio.recoleccionesFirmas({ limite: 500 });
    if (!municipales.some((r) => r.tipo === 'municipio' && r.titulo.startsWith('[DEMO V2.2]'))) {
      await firmas.crearRecoleccionMunicipal(repositorio, autor, {
        municipioId: MUNICIPIO,
        titulo: '[DEMO V2.2] Recolección municipal',
        descripcion: 'Solicitud de atención vecinal de demostración.',
        meta: 25
      });
      console.log('  Recolección municipal demo creada');
    }

    const solicitudCorreo = 'datos-nuevos@example.test';
    const solicitudesExistentes = await repositorio.solicitudesInforme({
      correo: solicitudCorreo,
      limite: 10
    });
    if (!solicitudesExistentes.length) {
      await solicitudes.crearSolicitud(
        repositorio,
        {
          nombre: 'Solicitante Demo',
          correo: solicitudCorreo,
          aceptaTerminos: true,
          municipios: [MUNICIPIO, '16053'],
          tiposTodos: true,
          formato: 'csv',
          mensaje: 'Solicitud de demostración V2.2.'
        },
        { ip: '127.0.0.1', userAgent: 'datos-nuevos' }
      );
      console.log('  Solicitud de informe multi-territorio creada');
    }

    const correosDemo = await repositorio.correosInstitucionales({
      municipioId: MUNICIPIO,
      texto: 'contacto@maravatio.gob.mx',
      limite: 10
    });
    if (!correosDemo.correos.length) {
      await correos.crear(repositorio, ACTOR, {
        estado: municipio.estado,
        municipioId: MUNICIPIO,
        dependencia: 'Ayuntamiento de Maravatío',
        cargo: 'Atención ciudadana',
        correo: 'contacto@maravatio.gob.mx',
        verificado: true
      });
      console.log('  Correo institucional demo creado');
    }

    const publicaciones = await repositorio.publicacionesRed({
      municipioId: MUNICIPIO,
      texto: '[DEMO V2.2]',
      limite: 10
    });
    if (!publicaciones.publicaciones.length) {
      await publicidad.generar(repositorio, ACTOR, {
        red: 'facebook',
        plantilla: 'reportar',
        municipioId: MUNICIPIO,
        titulo: '[DEMO V2.2] Reporta los problemas de tu municipio',
        texto: 'Publicación de demostración generada por datos-nuevos.',
        enlace: 'http://localhost:3000/'
      });
      console.log('  Publicación de redes demo creada');
    }

    const { total: totalRespaldos } = await repositorio.respaldos({ limite: 1 });
    if (!totalRespaldos) {
      await respaldos.crear(repositorio, ACTOR, {
        tipo: 'manual',
        nombre: 'Respaldo inicial datos V2.2'
      });
      console.log('  Respaldo inicial creado');
    }

    const recoleccionFinal = await repositorio.recoleccionFirmaPorIncidencia(incidencia.id);
    const conteos = {
      incidencias: (await repositorio.buscarIncidencias({ incluirSimulados: true, limite: 5000 })).length,
      firmas: (await repositorio.firmasDeRecoleccion(recoleccionFinal?.id || '')).length,
      legales: (await repositorio.documentosLegales()).filter((d) => d.versionPublicada > 0).length,
      correos: (await repositorio.correosInstitucionales({ limite: 500 })).total,
      publicaciones: (await repositorio.publicacionesRed({ limite: 500 })).total,
      respaldos: (await repositorio.respaldos({ limite: 500 })).total
    };
    console.log('\nConteos finales:');
    for (const [clave, valor] of Object.entries(conteos)) resumen(clave, valor);
    console.log('\nListo. Credenciales demo: demo_vecino / demo12345 (sin rol de personal).');
  } finally {
    await cerrarRepositorio();
  }
}

main().catch((error) => {
  console.error('No se pudieron cargar los datos nuevos:', error.message);
  process.exitCode = 1;
});
