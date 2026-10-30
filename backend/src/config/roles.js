/**
 * Catálogo de roles integrados.
 *
 * La matriz de permisos efectiva vive en la tabla `roles` (V2.11). Este módulo
 * guarda lo que no cambia con el tiempo —clave, etiqueta y tipo de territorio
 * que exige cada rol del sistema— y construye la semilla que usan las
 * migraciones y el driver JSON.
 */
import { PERMISOS_POR_ROL, ROLES_PERSONAL } from './constantes.js';

/**
 * Roles del sistema con su etiqueta visible y el territorio que exigen.
 *
 * `territorio`:
 *  - `municipios`: obliga a elegir al menos un municipio.
 *  - `estados`: obliga a elegir al menos un estado.
 *  - `ambos`: acepta municipios, estados o los dos.
 *  - `ninguno`: no exige territorio (solo el administrador maestro).
 */
export const ROLES_INTEGRADOS = [
  {
    clave: 'funcionario',
    etiqueta: 'Funcionario municipal',
    descripcion: 'Atiende incidencias dentro de sus municipios.',
    territorio: 'municipios'
  },
  {
    clave: 'auditor',
    etiqueta: 'Auditor',
    descripcion: 'Consulta e informa sin modificar datos.',
    territorio: 'ambos'
  },
  {
    clave: 'enlace_estatal',
    etiqueta: 'Enlace estatal',
    descripcion: 'Solo lectura sobre todos los municipios de sus estados.',
    territorio: 'estados'
  },
  {
    clave: 'enlace_federal',
    etiqueta: 'Enlace federal',
    descripcion: 'Solo lectura sobre los estados asignados.',
    territorio: 'estados'
  },
  {
    clave: 'soporte',
    etiqueta: 'Soporte técnico',
    descripcion: 'Atiende tickets y consulta su ámbito sin escribir incidencias.',
    territorio: 'ambos'
  },
  {
    clave: 'admin_municipal',
    etiqueta: 'Administrador municipal',
    descripcion: 'Administra cuentas, claves y catálogos de su municipio.',
    territorio: 'municipios'
  },
  {
    clave: 'admin_estatal',
    etiqueta: 'Administrador estatal',
    descripcion: 'Administra cuentas, claves y catálogos de sus estados.',
    territorio: 'ambos'
  }
];

/** Metadatos de un rol integrado (o `null` si la clave no es del sistema). */
export function rolIntegrado(clave) {
  return ROLES_INTEGRADOS.find((rol) => rol.clave === clave) || null;
}

/** Territorio exigido por un rol integrado; los roles propios lo declaran. */
export function territorioDeRol(clave) {
  return rolIntegrado(clave)?.territorio || 'municipios';
}

/**
 * Filas listas para insertar en `roles`. Solo incluye roles del personal; el
 * administrador maestro queda fuera porque siempre tiene todos los permisos.
 */
export function rolesIntegradosSemilla({ ahora = new Date().toISOString() } = {}) {
  return ROLES_INTEGRADOS.filter((rol) => ROLES_PERSONAL.includes(rol.clave)).map(
    (rol, indice) => ({
      id: rol.clave,
      clave: rol.clave,
      etiqueta: rol.etiqueta,
      descripcion: rol.descripcion || '',
      tipo: 'integrado',
      rolPlantilla: rol.clave,
      permisos: [...(PERMISOS_POR_ROL[rol.clave] || [])],
      territorio: rol.territorio,
      activo: true,
      orden: (indice + 1) * 10,
      creadoPor: null,
      creadoEn: ahora,
      actualizadoEn: ahora
    })
  );
}
