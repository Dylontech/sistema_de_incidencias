/** Contratos estáticos de la interfaz V2.2 (sin navegador). */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const frontend = path.join(raiz, 'frontend');

function leer(relativo) {
  return fs.readFileSync(path.join(frontend, relativo), 'utf8');
}

describe('Documentación viva', () => {
  test('PROJECT_CONTEXT.md existe y contiene las secciones obligatorias', () => {
    const texto = fs.readFileSync(path.join(raiz, 'PROJECT_CONTEXT.md'), 'utf8');
    for (const seccion of [
      'Arquitectura',
      'Roles y permisos',
      'Modelo de datos',
      'API',
      'Eventos de notificación',
      'Configuración',
      'Seguridad y CSP',
      'Changelog'
    ]) {
      assert.match(texto, new RegExp(seccion, 'i'));
    }
  });

  test('las instrucciones del repositorio exigen actualizar PROJECT_CONTEXT.md', () => {
    const texto = fs.readFileSync(
      path.join(raiz, '.github', 'copilot-instructions.md'),
      'utf8'
    );
    assert.match(texto, /PROJECT_CONTEXT\.md/);
  });
});

describe('Mapa: selector de capas', () => {
  test('el catálogo incluye satélite, híbrido, calles y relieve sin capas no disponibles', () => {
    const texto = leer('js/map/mapa.js');
    for (const clave of ['satelite', 'hibrido', 'calles', 'relieve']) {
      assert.match(texto, new RegExp(`${clave}:`));
    }
    // «Terreno y sombras» usaba un servicio de Esri que devuelve
    // «map data not yet available»: se retiró del catálogo.
    assert.doesNotMatch(texto, /terreno:/);
    assert.doesNotMatch(texto, /World_Terrain_Base/);
    assert.match(texto, /export function cambiarCapaBase/);
    assert.match(texto, /inc_capa_mapa/);
  });

  test('el selector se construye como control accesible sin estilos inline', () => {
    const texto = leer('js/map/mapa.js');
    assert.match(texto, /mapa-capas/);
    assert.match(texto, /aria-pressed/);
    assert.doesNotMatch(texto, /style\s*=/);
  });

  test('mi ubicación usa un marcador azul distinto de las incidencias', () => {
    const mapa = leer('js/map/mapa.js');
    assert.match(mapa, /marcarUbicacionUsuario/);
    assert.match(mapa, /marker-usuario/);
    assert.match(mapa, /usuario-pin/);
    assert.match(mapa, /zIndexOffset/);
    const css = leer('css/extensiones.css');
    assert.match(css, /\.marker-usuario/);
    assert.match(css, /\.usuario-pin/);
    assert.match(css, /@keyframes pulso-usuario/);
    assert.match(leer('index.html'), /leyenda-usuario/);
    assert.match(mapa, /centrarEnUsuario/);
  });
});

describe('V2.3: pantallas nuevas', () => {
  test('el informe es un modal con selector multiestado y aviso de privacidad', () => {
    const html = leer('index.html');
    for (const id of [
      'modalSolicitudInforme',
      'solInformeTerritorio',
      'solInformeTipos',
      'solInformeAvisoEstado',
      'modalAvisoLegal',
      'solicitudInformeBloqueo'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /data-action="avisoLegal:abrir"/);
    assert.doesNotMatch(html, /id="solInformeTerminos"/);
    assert.doesNotMatch(html, /href="\/legal"[^>]*>aviso de privacidad/);
    const js = leer('js/controllers/solicitudInformePublica.controller.js');
    assert.match(js, /prepararTerritorio/);
    assert.match(js, /crearSelectorTerritorial/);
    assert.match(js, /selectorTerritorio\?\.municipios/);
    assert.match(js, /aceptaTerminos: true/);
    assert.match(js, /crearSelectorTerritorialPorEstado/);
    assert.match(js, /catalogoEstados: store\.estado\.estados/);
    const bloques = leer('js/core/selector-territorial-bloques.js');
    assert.match(bloques, /Seleccionar todos los municipios/);
    assert.match(bloques, /data-municipio/);
    assert.match(bloques, /data-estado-input/);
    assert.match(html, /Puedes añadir más estados debajo/);
    assert.match(leer('js/data/tutoriales.js'), /Seleccionar todos los municipios/);
    assert.match(
      leer('js/controllers/tutorial.controller.js'),
      /crearSelectorTerritorialPorEstado/
    );
    assert.match(
      leer('js/controllers/tutorial.controller.js'),
      /catalogoEstados: store\.estado\.estados/
    );
    assert.match(leer('js/core/aplicacion.js'), /estados: municipios\.estados/);
    assert.match(leer('sw.js'), /selector-territorial-bloques\.js/);
  });

  test('el selector de informes agrupa por estado y respeta los estados completos', async () => {
    const url = pathToFileURL(
      path.join(frontend, 'js', 'core', 'selector-territorial-bloques.js')
    ).href;
    const modulo = await import(url);
    const catalogo = [
      { id: '1', nombre: 'Morelia', estado: 'Michoacán' },
      { id: '2', nombre: 'Celaya', estado: 'Guanajuato' },
      { id: '3', nombre: 'Maravatío', estado: 'Michoacán' }
    ];
    assert.deepEqual(modulo.estadosDelCatalogo(catalogo), ['Guanajuato', 'Michoacán']);
    assert.deepEqual(
      modulo.estadosDelCatalogo(catalogo, ['Aguascalientes', 'Michoacán']),
      ['Aguascalientes', 'Guanajuato', 'Michoacán']
    );
    assert.deepEqual(
      modulo.construirBloques(catalogo, {
        estados: ['Aguascalientes'],
        catalogoEstados: ['Aguascalientes', 'Guanajuato', 'Michoacán']
      }),
      [{ estado: 'Aguascalientes', completo: true, municipios: [] }]
    );
    assert.deepEqual(
      modulo.construirBloques(catalogo, { estados: ['Michoacán'], seleccionados: ['2'] }),
      [
        { estado: 'Guanajuato', completo: false, municipios: ['2'] },
        { estado: 'Michoacán', completo: true, municipios: [] }
      ]
    );
    assert.deepEqual(
      modulo.construirBloques(catalogo, {
        estados: ['Michoacán'],
        seleccionados: ['1', '2', '999']
      }),
      [
        { estado: 'Guanajuato', completo: false, municipios: ['2'] },
        { estado: 'Michoacán', completo: true, municipios: [] }
      ]
    );
    assert.deepEqual(
      modulo.construirBloques(catalogo, { estados: ['Inexistente'], seleccionados: ['999'] }),
      []
    );
  });

  test('el splash y el overlay de carga no se muestran a la vez', () => {
    const ui = leer('js/core/ui.js');
    assert.match(ui, /retirarArranque/);
    assert.match(ui, /bootScreen/);
    assert.match(ui, /cargaPendiente/);
    const main = leer('js/main.js');
    assert.match(main, /retirarArranque/);
    assert.doesNotMatch(main, /function ocultarArranque/);
  });

  test('el panel tiene estadísticas territoriales, claves, fichas, roles y perfil', () => {
    const html = leer('index.html');
    for (const id of [
      'statsTerritorio',
      'tabClaves',
      'modalFichaMunicipio',
      'modalRolesEspeciales',
      'modalPerfil',
      'solicitudesPermisosLista'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.doesNotMatch(html, /admin:tab[^>]*data-valor="campanas"/);
    assert.match(html, /admin:tab[^>]*data-valor="publicidad"/);
  });

  test('las guías declaran la vista que deben abrir antes de resaltar', () => {
    const texto = leer('js/data/tutoriales.js');
    assert.match(texto, /vista: 'panel'/);
    assert.match(texto, /vista: 'monitoreo'/);
    assert.match(texto, /vista: 'informes'/);
    assert.match(texto, /id: 'panel-publicidad'/);
    assert.match(texto, /id: 'panel-usuarios'/);
  });

  test('V2.11: ayuda de permisos, roles propios, contraseñas y bajas', () => {
    const html = leer('index.html');
    for (const id of [
      'modalPasswordUsuario',
      'modalAyudaPermiso',
      'modalBajaUsuario',
      'modalSolicitudPassword',
      'rolesIntegradosLista',
      'rolesPropiosLista',
      'usuarioTerritorioSelector',
      'usuarioClavePreview',
      'solicitudesPasswordBox',
      'solicitudesBajaBox',
      'perfilSolicitudesPassword',
      'perfilSolicitudesBaja'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    // El tema claro/oscuro se retiró: no debe quedar ningún control ni hoja.
    assert.doesNotMatch(html, /data-action="tema:/);
    assert.doesNotMatch(html, /tema-oscuro\.css/);

    const ayuda = leer('js/data/permisos-ayuda.js');
    assert.match(ayuda, /revelar_password_usuarios/);
    assert.match(ayuda, /ver_solicitudes_permisos/);

    const tutoriales = leer('js/data/tutoriales.js');
    for (const guia of ['permisos-usuarios', 'permisos-claves', 'panel-roles', 'panel-password']) {
      assert.match(tutoriales, new RegExp(`id: '${guia}'`));
    }
    assert.match(tutoriales, /categoria: 'Permisos'/);
  });

  test('V2.11.2: el aviso de baja y contraseña abre la cuenta y su acción', () => {
    const html = leer('index.html');
    assert.match(html, /data-action="password:enviarSolicitudCuenta"/);
    assert.match(html, /id="solicitudPasswordUsuarioId"/);

    const vista = leer('js/views/admin.view.js');
    // Filas identificables para enfocar la cuenta y la solicitud del aviso.
    assert.match(vista, /<tr data-usuario=/);
    assert.match(vista, /data-solicitud=/);
    assert.match(vista, /data-action="password:solicitarCuenta"/);
    assert.match(vista, /prepararModalSolicitudPassword/);

    const controlador = leer('js/controllers/admin.controller.js');
    assert.match(controlador, /export async function enfocarSolicitud/);
    assert.match(controlador, /fila-destacada/);
    assert.match(controlador, /password:solicitarCuenta/);

    const notificaciones = leer('js/controllers/notificaciones.controller.js');
    assert.match(notificaciones, /panelUsuarios/);
    assert.match(notificaciones, /searchParams\.get\('panel'\) === 'usuarios'/);
    assert.match(notificaciones, /enfocarSolicitud/);
    assert.match(notificaciones, /perfil:abrir/);
    const perfil = leer('js/controllers/perfil.controller.js');
    assert.match(perfil, /pintarSolicitudesBaja/);
    assert.match(perfil, /bajaService\.mias\(\)/);

    const css = leer('css/extensiones.css');
    assert.match(css, /tr\.fila-destacada/);
  });

  test('V2.11.3: reactivar cuentas, solicitud de alta y permisos de rol', () => {
    const html = leer('index.html');
    for (const id of [
      'modalSolicitudAlta',
      'solicitudesAltaBox',
      'solicitudesAltaLista',
      'btnSolicitarAlta',
      'altaUsuarioNombre',
      'altaUsuarioUsername',
      'altaUsuarioCorreo',
      'altaUsuarioTelefono',
      'perfilSolicitudesAlta',
      'municipioActivoBox',
      'municipiosFiltroBox',
      'rolEspecialBaseNota'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /data-action="alta:enviar"/);
    assert.match(html, /data-action="alta:solicitar"/);

    const vista = leer('js/views/admin.view.js');
    // Los roles del sistema y propios tienen id numérico: se compara como texto.
    assert.match(
      vista,
      /rolesIntegrados \|\| \[\]\)\.find\(\(r\) => String\(r\.id\) === String\(id\)\)/
    );
    assert.match(vista, /data-action="admin:usuarioReactivar"/);
    assert.match(vista, /renderSolicitudesAlta/);
    assert.match(vista, /prepararModalAlta/);
    assert.match(vista, /municipal/);

    const controlador = leer('js/controllers/admin.controller.js');
    assert.match(controlador, /cargarSolicitudesAlta/);
    assert.match(controlador, /alta:aprobar/);
    assert.match(controlador, /admin:usuarioReactivar/);
    assert.match(controlador, /municipioActivoBox/);
    assert.match(controlador, /municipiosFiltroBox/);

    const servicio = leer('js/services/alta.service.js');
    assert.match(servicio, /alta\/solicitudes/);

    const perfil = leer('js/controllers/perfil.controller.js');
    assert.match(perfil, /pintarSolicitudesAlta/);

    // Texto más grande en la base, las tablas y las notas.
    const base = leer('css/base.css');
    assert.match(base, /font-size: 16px;/);
    assert.match(base, /font-size: 15px; outline: none/);
    const adminCss = leer('css/admin.css');
    assert.match(adminCss, /\.data-table \{\s*width: 100%; border-collapse: collapse; font-size: 14px/);
    const extensiones = leer('css/extensiones.css');
    assert.match(extensiones, /\.campo-nota \{\s*margin-top: 6px;\s*font-size: 13px/);
  });
});

describe('Tutorial por rol y enciclopedia', () => {
  test('el catálogo declara roles y el anónimo no ve guías de administración', async () => {
    const url = pathToFileURL(path.join(frontend, 'js', 'data', 'tutoriales.js')).href;
    const modulo = await import(url);
    assert.ok(Array.isArray(modulo.GUIA_TUTORIALES));
    assert.ok(modulo.GUIA_TUTORIALES.some((g) => g.id === 'admin-legal'));
    const anonimo = modulo.guiasPara({ rol: 'anonimo' });
    assert.ok(anonimo.length > 0);
    assert.ok(!anonimo.some((g) => g.id === 'admin-legal'));
    assert.ok(!anonimo.some((g) => g.id === 'admin-respaldos'));
    const admin = modulo.guiasPara({ rol: 'admin' });
    assert.ok(admin.some((g) => g.id === 'admin-legal'));
    assert.ok(admin.some((g) => g.id === 'admin-respaldos'));
  });

  test('la guía de cuenta abre el login solo a partir del segundo paso', async () => {
    const url = pathToFileURL(path.join(frontend, 'js', 'data', 'tutoriales.js')).href;
    const modulo = await import(url);
    const guia = modulo.GUIA_TUTORIALES.find((g) => g.id === 'cuenta');
    assert.ok(guia);
    assert.equal(guia.pasos[0].contexto, undefined);
    assert.deepEqual(guia.pasos[1].contexto, { vista: 'login', modo: 'registro' });
    const controlador = leer('js/controllers/tutorial.controller.js');
    assert.doesNotMatch(controlador, /guia\?\.id === 'cuenta'[\s\S]{0,80}vista: 'login'/);
  });

  test('la enciclopedia tiene buscador con botón', () => {
    const html = leer('index.html');
    assert.match(html, /id="modalTutoriales"/);
    assert.match(html, /id="tutorialesBuscar"/);
    assert.match(html, /data-action="tutorial:buscar"/);
  });

  test('la bienvenida está en la enciclopedia y solo se autoabre una vez', async () => {
    const url = pathToFileURL(path.join(frontend, 'js', 'data', 'tutoriales.js')).href;
    const modulo = await import(url);
    assert.ok(modulo.guiasPara({ rol: 'anonimo' }).some((g) => g.id === 'bienvenida'));
    const controlador = leer('js/controllers/tutorial.controller.js');
    assert.match(controlador, /inc_tutorial_bienvenida_v1/);
    assert.match(controlador, /inc_tutorial_v1/);
    assert.match(controlador, /quizáMostrar/);
  });
});

describe('Legal público y panel', () => {
  test('existe la página pública y el editor del admin', () => {
    assert.match(leer('legal.html'), /id="legalContenido"/);
    const html = leer('index.html');
    assert.match(html, /id="panel-legal"/);
    assert.match(html, /data-action="legal:guardar"/);
    assert.match(html, /data-action="legal:publicar"/);
  });

  test('el aviso legal se muestra en un modal y el onboarding usa la versión publicada', () => {
    const html = leer('index.html');
    for (const id of ['modalAvisoLegal', 'avisoLegalContenido', 'obTerminosContenido']) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /data-action="avisoLegal:doc"/);
    const consentimiento = leer('js/core/consentimiento.js');
    assert.match(consentimiento, /\/legal\/aceptacion/);
    assert.match(consentimiento, /\/legal\/aceptar/);
    assert.match(consentimiento, /cargarEstado/);
    assert.match(leer('js/controllers/onboarding.controller.js'), /renderTerminos/);
    assert.match(leer('js/controllers/avisoLegal.controller.js'), /legalService\.publicado/);
  });
});

describe('Respaldos', () => {
  test('el panel tiene buscador con botón, creación y restauración', () => {
    const html = leer('index.html');
    assert.match(html, /id="respaldosTexto"/);
    assert.match(html, /data-action="respaldos:buscar"/);
    assert.match(html, /data-action="respaldos:crear"/);
    assert.match(html, /id="modalRestaurarRespaldo"/);
    assert.match(html, /RESTAURAR/);
  });
});

describe('Simulador, publicidad y correos', () => {
  test('el panel declara las tres pestañas y sus acciones principales', () => {
    const html = leer('index.html');
    for (const valor of ['simulador', 'publicidad', 'correos']) {
      assert.match(html, new RegExp(`data-valor="${valor}"`));
      assert.match(html, new RegExp(`panel-${valor}`));
    }
    assert.match(html, /data-action="simulador:abrir"/);
    assert.match(html, /data-action="publicidad:generar"/);
    assert.match(html, /data-action="publicidad:simular"/);
    assert.match(html, /data-action="correos:importar"/);
    assert.match(html, /id="modalCorreoInstitucional"/);
    assert.match(leer('js/views/simulador.view.js'), /data-action="simulador:ejecutar"/);
  });
});

describe('V2.4/V2.5: accesos, informes, tickets y accesibilidad', () => {
  test('el selector territorial filtra por estado y conserva la búsqueda', async () => {
    const url = pathToFileURL(
      path.join(frontend, 'js', 'core', 'selector-territorial.js')
    ).href;
    const modulo = await import(url);
    const catalogo = [
      { id: '1', nombre: 'Morelia', estado: 'Michoacán' },
      { id: '2', nombre: 'Celaya', estado: 'Guanajuato' },
      { id: '3', nombre: 'Maravatío', estado: 'Michoacán' }
    ];
    assert.deepEqual(
      modulo.filtrarMunicipios(catalogo, { estados: ['Michoacán'] }).map((m) => m.id),
      ['1', '3']
    );
    assert.deepEqual(
      modulo
        .filtrarMunicipios(catalogo, { estado: 'Guanajuato', busqueda: 'cel' })
        .map((m) => m.id),
      ['2']
    );
  });

  test('las campañas muestran el nombre del municipio y la accesibilidad tiene niveles', async () => {
    const campanas = await import(
      pathToFileURL(path.join(frontend, 'js', 'views', 'campanas.view.js')).href
    );
    assert.equal(
      campanas.etiquetaSegmento({ municipioId: '1' }, [{ id: '1', nombre: 'Morelia' }]),
      'Municipio Morelia'
    );
    const accesibilidad = await import(
      pathToFileURL(path.join(frontend, 'js', 'core', 'accesibilidad.js')).href
    );
    assert.equal(accesibilidad.normalizarNivel('otro'), 'normal');
    assert.equal(accesibilidad.siguienteNivel('normal'), 'grande');
    assert.equal(accesibilidad.anteriorNivel('muy-grande'), 'grande');
  });

  test('el enlace de soporte nace oculto y la página valida el permiso', () => {
    const html = leer('index.html');
    assert.match(html, /id="linkSoporte"\s+hidden/);
    const login = leer('js/views/login.view.js');
    assert.match(login, /puedeAtenderTickets/);
    assert.match(login, /enlaceSoporte\.hidden/);
    assert.match(leer('js/soporte.js'), /puedeAtenderTickets/);
    assert.match(leer('css/extensiones.css'), /a\.link-terminos\.u-oculto/);
  });

  test('las capas del mapa quedan por encima de las teselas y dentro del contenedor', () => {
    const css = leer('css/extensiones.css');
    assert.match(css, /#map \.leaflet-control-container \.leaflet-top[\s\S]*?z-index: 1000/);
    assert.match(css, /\.map-container \{[\s\S]*?isolation: isolate/);
  });

  test('la barra lateral está agrupada y conserva los selectores de los tutoriales', () => {
    const html = leer('index.html');
    for (const id of ['controlesTexto', 'reglasTicketsPanel', 'reglasSimulacion']) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    const posiciones = [
      html.indexOf('data-action="folios:abrir"'),
      html.indexOf('data-action="ticketsModal:abrir"'),
      html.indexOf('id="linkSoporte"'),
      html.indexOf('data-action="contacto:abrir"'),
      html.indexOf('data-action="solicitudInforme:abrir"'),
      html.indexOf('data-action="tutorial:abrir"'),
      html.indexOf('class="link-terminos" href="/acerca"'),
      html.indexOf('class="filters"'),
      html.indexOf('id="colindantesBox"')
    ];
    assert.ok(posiciones.every((posicion) => posicion >= 0));
    assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b));
  });

  test('el visor de informes y los sandboxes de tutorial existen', () => {
    const html = leer('index.html');
    for (const id of [
      'modalVisorInforme',
      'visorInformeFrame',
      'visorInformePdf',
      'demoInformeNombre',
      'demoTicketAsunto',
      'tutorialSimulacion'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    const controlador = leer('js/controllers/solicitudesInforme.controller.js');
    assert.match(controlador, /solicitudesInforme:archivo/);
    assert.match(controlador, /solicitudesInforme:abrirPdf/);
    assert.match(leer('js/controllers/tutorial.controller.js'), /simularPaso/);
  });

  test('todas las guías tienen una simulación y ninguna es destructiva', async () => {
    const url = pathToFileURL(path.join(frontend, 'js', 'data', 'tutoriales.js')).href;
    const modulo = await import(url);
    const destructivas = /(guardar|crear|enviar|eliminar|publicar|restaurar|revertir|generar)/i;
    for (const guia of modulo.GUIA_TUTORIALES) {
      const pasoDemo = guia.pasos.find((paso) => paso.simulacion);
      assert.ok(pasoDemo, `La guía ${guia.id} no tiene simulación`);
      assert.doesNotMatch(pasoDemo.simulacion.tipo, destructivas);
    }
  });

  test('las guías de tickets e informes no se ofrecen a sesiones anónimas', async () => {
    const url = pathToFileURL(path.join(frontend, 'js', 'data', 'tutoriales.js')).href;
    const modulo = await import(url);
    const ids = modulo.guiasPara({ rol: 'anonimo' }).map((guia) => guia.id);
    assert.ok(!ids.includes('tickets'));
    assert.ok(!ids.includes('informes'));
    assert.ok(ids.includes('reportar'));
  });

  test('la guía de reporte abre el formulario, cierra el modal para el mapa y vuelve a abrirlo', async () => {
    const url = pathToFileURL(path.join(frontend, 'js', 'data', 'tutoriales.js')).href;
    const modulo = await import(url);
    const guia = modulo.GUIA_TUTORIALES.find((g) => g.id === 'reportar');
    const tipos = guia.pasos.map((paso) => paso.simulacion?.tipo).filter(Boolean);
    assert.ok(tipos.includes('demoReportar'));
    assert.ok(tipos.includes('demoReportarMapa'));
    assert.ok(tipos.includes('demoReportarReabrir'));
  });

  test('los tutoriales de informes y tickets usan sus modales y no navegan fuera', async () => {
    const url = pathToFileURL(path.join(frontend, 'js', 'data', 'tutoriales.js')).href;
    const modulo = await import(url);
    for (const id of ['informes', 'tickets']) {
      const guia = modulo.GUIA_TUTORIALES.find((g) => g.id === id);
      assert.match(guia.pasos[0].objetivo, /#demo/);
      assert.notEqual(guia.pasos[0].simulacion?.tipo, 'navegar');
    }
  });

  test('la barra lateral esconde tickets e informes y el panel de diseño tiene sus campos', () => {
    const html = leer('index.html');
    assert.match(html, /id="linkTickets"/);
    assert.match(html, /id="linkInformesPublicos"/);
    assert.match(html, /id="reporteDisenoPanel"/);
    assert.match(html, /id="reporteLogoArchivo"/);
    assert.match(leer('js/views/login.view.js'), /linkTickets/);
    assert.match(leer('js/controllers/reportes.controller.js'), /reportes:guardarDiseno/);
  });

  test('el ciudadano no elige la prioridad del ticket; soporte y admin sí', () => {
    const html = leer('index.html');
    assert.doesNotMatch(html, /id="ticketsModalPrioridad"/);
    assert.doesNotMatch(html, /id="demoTicketPrioridad"/);
    assert.match(html, /id="ticketAdminPrioridad"/);
    assert.match(html, /data-change="tickets:prioridad"/);
    assert.doesNotMatch(
      leer('js/controllers/ticketsModal.controller.js'),
      /prioridad:\s*\$\('ticketsModalPrioridad'\)/
    );
    assert.match(leer('js/controllers/admin.controller.js'), /tickets:prioridad/);
  });

  test('Paged.js vendorizado usa CSSOM y no inserta etiquetas style', () => {
    const vendor = leer('vendor/pagedjs/paged.polyfill.js');
    assert.match(vendor, /adoptedStyleSheets/);
    assert.doesNotMatch(vendor, /createElement\("style"\)/);
    assert.match(leer('vendor/vendor.lock.json'), /pagedjs/);
  });
});

describe('V2.9.5: avisos por clave y resumen de solicitudes', () => {
  test('la notificaci�n de una solicitud abre su resumen detallado', () => {
    const html = leer('index.html');
    assert.match(html, /id="modalSolicitudInformeDetalle"/);
    assert.match(html, /solicitudInformeDetalleCuerpo/);
    const vista = leer('js/views/solicitudesInforme.view.js');
    assert.match(vista, /renderizarDetalle/);
    assert.match(vista, /solicitudesInforme:detalle/);
    const notificaciones = leer('js/controllers/notificaciones.controller.js');
    assert.match(notificaciones, /solicitud_informe/);
    assert.match(notificaciones, /abrirDetalle/);
    assert.match(notificaciones, /solicitudId/);
  });

  test('el panel ofrece avisos por clave y controles de tama�o', () => {
    const html = leer('index.html');
    assert.match(html, /data-valor="avisos-clave"/);
    assert.match(html, /data-permiso="ver_avisos_clave"/);
    assert.match(html, /id="modalAvisosClave"/);
    assert.match(html, /data-action="accesibilidad:textoMas"/);
    assert.match(html, /data-action="admin:tamanoPanel"/);
    const controlador = leer('js/controllers/admin.controller.js');
    assert.match(controlador, /'avisos-clave': 'ver_avisos_clave'/);
    assert.match(controlador, /creandoClave/);
    assert.match(controlador, /aplicarTamanoPanel/);
    const vista = leer('js/views/admin.view.js');
    assert.match(vista, /renderAvisosClave/);
    assert.match(vista, /prepararModalAvisosClave/);
    assert.match(vista, /agregarClaveLista/);
  });

  test('publicidad permite redimensionar secciones y el QR tiene etiqueta corta', () => {
    const html = leer('index.html');
    assert.match(html, /publicidad:secciones/);
    assert.match(html, /Enlace o texto del QR<\/label>/);
    assert.match(html, /pe-grid-qr/);
    assert.match(html, /pe-campo-ancho/);
    const css = leer('css/publicidad-estudio.css');
    assert.match(css, /resize:\s*vertical/);
    assert.match(css, /@media \(min-width: 1600px\)/);
    assert.match(css, /@media \(max-width: 640px\)/);
  });
});

describe('V2.11.1: móvil compacto y sin tema', () => {
  test('en móvil los campos de publicidad y campañas miden su contenido', () => {
    const css = leer('css/publicidad-estudio.css');
    const bloque = css.slice(css.indexOf('@media (max-width: 640px)'));
    assert.match(bloque, /\.admin-panel \.filter-row\s*\{\s*flex-direction:\s*column/);
    // El `flex-basis` de 180px actuaba como altura al apilarse.
    assert.match(bloque, /\.admin-panel \.filter-row > \* \{[^}]*flex:\s*0 0 auto/);
    assert.match(bloque, /\.pe-form \.form-group,[\s\S]{0,80}margin-bottom:\s*10px/);
  });

  test('no quedan restos del tema claro/oscuro', () => {
    const html = leer('index.html');
    const sw = leer('sw.js');
    assert.doesNotMatch(html, /tema-oscuro\.css/);
    assert.doesNotMatch(html, /data-action="tema:/);
    assert.doesNotMatch(html, /data-theme=/);
    assert.doesNotMatch(sw, /tema-oscuro\.css/);
    assert.doesNotMatch(sw, /tema-publico\.js/);
    for (const ruta of ['js/core/tema.js', 'js/core/tema-publico.js', 'css/tema-oscuro.css']) {
      assert.equal(fs.existsSync(path.join(frontend, ruta)), false, ruta);
    }
  });
});
