/**
 * CONTRATO DE REPOSITORIO
 *
 * Cualquier driver de almacenamiento (json, mysql, …) debe implementar estos
 * métodos. Los servicios solo conocen esta interfaz, de modo que cambiar de
 * motor es cambiar STORAGE_DRIVER.
 *
 * @typedef {Object} Municipio
 * @property {string} id
 * @property {string} nombre
 * @property {string} estado
 * @property {string} clave       código de acceso (solo visible para admin)
 * @property {[number,number]} center
 * @property {number} zoom
 * @property {Array<[number,number]>} poligono  límite municipal real
 *
 * @typedef {Object} Zona
 * @property {string} id
 * @property {string} municipioId
 * @property {string} nombre
 * @property {'colonia'|'tenencia'|'zona'} tipo
 * @property {string} color
 * @property {Array<[number,number]>} poligono
 *
 * @typedef {Object} Tipo
 * @property {string} id
 * @property {string} nombre
 * @property {string} icono
 * @property {boolean} [custom]
 *
 * @typedef {Object} Usuario
 * @property {string} id
 * @property {string} username       identificador interno (también `userKey`)
 * @property {string} nombre         nombre visible (real o pseudónimo)
 * @property {string|null} correo    solo en cuentas ciudadanas
 * @property {'ciudadano'|'funcionario'|'admin'} rol
 * @property {string|null} municipioId
 * @property {boolean} activo
 * @property {boolean} pseudonimo    `true` si `nombre` es un pseudónimo generado
 * @property {string} passwordHash
 * @property {number} advertencias   avisos acumulados por moderación
 * @property {boolean} suspendido    cuenta bloqueada por moderación
 * @property {string|null} suspendidoHasta  fin de la suspensión; vacío = indefinida
 * @property {string} [suspendidoMotivo]
 * @property {string|null} [suspendidoPor]
 *
 * @typedef {Object} Evidencia
 * @property {string} id
 * @property {string} nombre
 * @property {string} tipo      MIME
 * @property {number} tamano    bytes
 * @property {string} url       /uploads/<archivo>
 * @property {number|null} duracion segundos (vestigio del video: ya no se sube)
 *
 * @typedef {Object} Incidencia
 * @property {string} id
 * @property {string} tipoId
 * @property {string} iconoCustom
 * @property {string} titulo
 * @property {string} descripcion
 * @property {string} indicaciones
 * @property {number} lat
 * @property {number} lng
 * @property {string} fecha            ISO de creación
 * @property {string} actualizado      ISO de última modificación
 * @property {'reportada'|'en_proceso'|'resuelta'} estado
 * @property {boolean} esAnonimo
 * @property {string} autor            identidad interna (username); no se muestra si es anónimo
 * @property {string} autorNombre      lo que ve el vecindario ('Anónimo' o el nombre/pseudónimo)
 * @property {string} userKey          'anon_<id>' o username del autor
 * @property {string} municipioId
 * @property {string|null} zonaId
 * @property {string|null} zonaNombre
 * @property {Evidencia[]} evidencia
 * @property {Array<{fecha:string,estado:string,accion:string,por:string}>} historial
 * @property {Array<{id:string,fecha:string,autor:string,texto:string,userKey?:string|null,oculto?:boolean}>} comentarios
 * @property {string|null} fechaResolucion
 * @property {string|null} solucion
 * @property {Evidencia[]} evidenciaSolucion
 * @property {boolean} oculta         retirada de la vista pública por moderación
 * @property {string|null} ocultaPor
 * @property {string|null} ocultaFecha
 * @property {string} ocultaMotivo
 *
 * @typedef {Object} Denuncia
 * @property {string} id
 * @property {string} fecha
 * @property {'incidencia'|'comentario'} objetivo
 * @property {string} incidenciaId
 * @property {string|null} comentarioId
 * @property {string|null} municipioId
 * @property {string} objetivoTitulo   copia del título denunciado
 * @property {string} objetivoResumen  copia del comentario denunciado
 * @property {string} objetivoAutor
 * @property {string|null} objetivoUserKey  autor del contenido (para sancionar)
 * @property {string|null} autorUserKey     quién denuncia (solo lo ve el personal)
 * @property {string} autorNombre
 * @property {string} motivo
 * @property {string} detalle
 * @property {'pendiente'|'atendida'|'descartada'} estado
 * @property {string|null} accion
 * @property {string} resolucion
 * @property {string|null} moderadoPor
 * @property {string|null} moderadoFecha
 *
 * @typedef {Object} Notificacion
 * @property {string} id
 * @property {string} fecha
 * @property {boolean} leida
 * @property {'reporte'|'resuelta'|'estado'|'alerta'|'comentario'} tipo
 * @property {string} titulo
 * @property {string} mensaje
 * @property {string|null} incidenciaId
 * @property {string|null} paraUsuario
 *
 * @typedef {Object} FiltrosIncidencias
 * @property {string} [municipioId]  limita a un municipio
 * @property {string} [userKey]      limita a los reportes de un ciudadano
 * @property {string} [texto]        busca en título y descripción
 * @property {string} [estado]       reportada | en_proceso | resuelta | todos
 * @property {string} [tipoId]
 * @property {string} [zonaId]
 * @property {'reciente'|'antigua'} [orden]  `prioridad` se resuelve en el servicio
 * @property {'excluir'|'incluir'|'propias'} [ocultas]  qué hacer con las publicaciones
 *           ocultas por moderación: `excluir` (público), `incluir` (personal) o
 *           `propias` (las ocultas del autor indicado en `ocultasDe`)
 * @property {string} [ocultasDe]  `userKey` del autor cuyas publicaciones ocultas se
 *           incluyen cuando `ocultas` es `'propias'`
 *
 * @typedef {Object} FiltrosDenuncias
 * @property {string} [incidenciaId]
 * @property {string} [comentarioId]
 * @property {string} [municipioId]
 * @property {string} [autorUserKey]      denuncias presentadas por una sesión
 * @property {string} [objetivoUserKey]   denuncias recibidas por una cuenta
 * @property {'pendiente'|'atendida'|'descartada'} [estado]
 * @property {'reciente'|'antigua'} [orden]
 *
 * @typedef {Object} Repositorio
 * @property {string} driver
 * @property {() => Promise<void>} inicializar
 * @property {() => Promise<void>} cerrar
 * @property {() => Promise<boolean>} ping      comprueba que el almacén responde (salud)
 * @property {() => Promise<Municipio[]>} todosMunicipios
 * @property {(id:string) => Promise<Municipio|null>} municipioPorId
 * @property {(clave:string) => Promise<Municipio|null>} municipioPorClave
 * @property {() => Promise<Zona[]>} todasLasZonas
 * @property {(municipioId:string) => Promise<Zona[]>} zonasPorMunicipio
 * @property {() => Promise<Tipo[]>} todosLosTipos
 * @property {(id:string) => Promise<Tipo|null>} tipoPorId
 * @property {(tipo:Tipo) => Promise<Tipo>} crearTipo
 * @property {(id:string) => Promise<boolean>} eliminarTipo
 * @property {() => Promise<Usuario[]>} todosLosUsuarios
 * @property {(username:string) => Promise<Usuario|null>} usuarioPorUsername
 * @property {(correo:string) => Promise<Usuario|null>} usuarioPorCorreo
 * @property {(id:string) => Promise<Usuario|null>} usuarioPorId
 * @property {(usuario:Usuario) => Promise<Usuario>} crearUsuario
 * @property {(id:string, cambios:Object) => Promise<Usuario|null>} actualizarUsuario
 * @property {(filtros:FiltrosIncidencias) => Promise<Incidencia[]>} buscarIncidencias
 * @property {() => Promise<Incidencia[]>} todasLasIncidencias
 * @property {(id:string) => Promise<Incidencia|null>} incidenciaPorId
 * @property {(incidencia:Incidencia) => Promise<Incidencia>} crearIncidencia
 * @property {(id:string, incidencia:Incidencia) => Promise<Incidencia|null>} actualizarIncidencia
 * @property {(id:string) => Promise<boolean>} eliminarIncidencia
 * @property {(incidencias:Incidencia[]) => Promise<number>} insertarIncidencias
 * @property {() => Promise<number>} borrarIncidencias
 * @property {(userKey:string) => Promise<Notificacion[]>} notificacionesDe
 * @property {() => Promise<Notificacion[]>} todasLasNotificaciones
 * @property {(notificacion:Notificacion) => Promise<Notificacion>} crearNotificacion
 * @property {(id:string) => Promise<boolean>} marcarNotificacionLeida
 * @property {(userKey:string) => Promise<number>} marcarNotificacionesLeidas
 * @property {(id:string) => Promise<boolean>} eliminarNotificacion
 * @property {() => Promise<number>} borrarNotificaciones
 * @property {(denuncia:Denuncia) => Promise<Denuncia>} crearDenuncia
 * @property {(id:string) => Promise<Denuncia|null>} denunciaPorId
 * @property {(filtros:FiltrosDenuncias) => Promise<Denuncia[]>} denunciasDe
 * @property {(id:string, denuncia:Denuncia) => Promise<Denuncia|null>} actualizarDenuncia
 * @property {() => Promise<number>} borrarDenuncias
 */

export const METODOS_REQUERIDOS = [
  'inicializar',
  'cerrar',
  'ping',
  'todosMunicipios',
  'municipioPorId',
  'municipioPorClave',
  'todasLasZonas',
  'zonasPorMunicipio',
  'todosLosTipos',
  'tipoPorId',
  'crearTipo',
  'eliminarTipo',
  'todosLosUsuarios',
  'usuarioPorUsername',
  'usuarioPorCorreo',
  'usuarioPorId',
  'crearUsuario',
  'actualizarUsuario',
  'buscarIncidencias',
  'todasLasIncidencias',
  'incidenciaPorId',
  'crearIncidencia',
  'actualizarIncidencia',
  'eliminarIncidencia',
  'insertarIncidencias',
  'borrarIncidencias',
  'notificacionesDe',
  'todasLasNotificaciones',
  'crearNotificacion',
  'marcarNotificacionLeida',
  'marcarNotificacionesLeidas',
  'eliminarNotificacion',
  'borrarNotificaciones',
  'crearDenuncia',
  'denunciaPorId',
  'denunciasDe',
  'actualizarDenuncia',
  'borrarDenuncias'
];

/** Comprueba que un repositorio cumple el contrato (usado en pruebas). */
export function validarContrato(repositorio) {
  const faltantes = METODOS_REQUERIDOS.filter((m) => typeof repositorio[m] !== 'function');
  if (faltantes.length) {
    throw new Error(`El repositorio ${repositorio?.driver} no implementa: ${faltantes.join(', ')}`);
  }
  return true;
}
