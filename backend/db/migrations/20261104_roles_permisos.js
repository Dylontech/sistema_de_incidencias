/**
 * Roles integrados editables y roles propios.
 *
 * Hasta V2.10 la matriz de permisos de cada rol vivía solo en
 * `PERMISOS_POR_ROL` (código). Esta migración la lleva a la tabla `roles`:
 *
 *  - `tipo = 'integrado'`: los roles del sistema (funcionario, auditor…). Su
 *    matriz se puede editar y «Restablecer a fábrica» vuelve a la constante.
 *  - `tipo = 'propio'`: roles que crea el administrador maestro. Heredan el
 *    comportamiento de `rol_plantilla` (el ENUM `usuarios.rol`) y aportan su
 *    propia matriz de permisos.
 *
 * `usuarios.rol` NO cambia de tipo: sigue siendo el ENUM del rol plantilla.
 * Los roles propios se asignan con `usuarios.rol_propio_id`.
 */
import { rolesIntegradosSemilla } from '../../src/config/roles.js';

async function colacionDeUsuarios(knex) {
  try {
    const filas = await knex.raw(
      "SELECT COLLATION_NAME AS colacion FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'id' LIMIT 1",
      [knex.client.config.connection.database]
    );
    return filas?.[0]?.[0]?.colacion || 'utf8mb4_unicode_ci';
  } catch {
    return 'utf8mb4_unicode_ci';
  }
}

/** Etiqueta y territorio con el que nace cada rol integrado. */
const ahora = new Date();

export async function up(knex) {
  const colacion = await colacionDeUsuarios(knex);

  if (!(await knex.schema.hasTable('roles'))) {
    await knex.schema.createTable('roles', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('clave', 60).notNullable().unique();
      t.string('etiqueta', 120).notNullable();
      t.string('descripcion', 400).nullable();
      t.enum('tipo', ['integrado', 'propio']).notNullable().defaultTo('propio');
      t.string('rol_plantilla', 40).notNullable();
      t.text('permisos', 'longtext').nullable();
      t.enum('territorio', ['municipios', 'estados', 'ambos', 'ninguno'])
        .notNullable()
        .defaultTo('municipios');
      t.boolean('activo').notNullable().defaultTo(true);
      t.integer('orden').notNullable().defaultTo(100);
      t.string('creado_por', 120).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.datetime('actualizado_en', { precision: 3 }).notNullable();
      t.index(['tipo', 'orden'], 'roles_tipo_orden_idx');
    });
  }

  // Sembrado idempotente: solo crea los integrados que falten y nunca pisa la
  // matriz que el administrador ya haya guardado.
  const existentes = new Set((await knex('roles').select('clave')).map((f) => f.clave));
  const filas = rolesIntegradosSemilla({ ahora })
    .filter((rol) => !existentes.has(rol.clave))
    .map((rol) => ({
      id: rol.id,
      clave: rol.clave,
      etiqueta: rol.etiqueta,
      descripcion: rol.descripcion || null,
      tipo: rol.tipo,
      rol_plantilla: rol.rolPlantilla,
      permisos: JSON.stringify(rol.permisos),
      territorio: rol.territorio,
      activo: true,
      orden: rol.orden,
      creado_por: null,
      creado_en: ahora,
      actualizado_en: ahora
    }));
  if (filas.length) await knex('roles').insert(filas);

  if (
    (await knex.schema.hasTable('usuarios')) &&
    !(await knex.schema.hasColumn('usuarios', 'rol_propio_id'))
  ) {
    await knex.raw(
      `ALTER TABLE usuarios ADD COLUMN rol_propio_id VARCHAR(64) NULL COLLATE ${colacion}`
    );
    await knex.raw('ALTER TABLE usuarios ADD INDEX usuarios_rol_propio_idx (rol_propio_id)');
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('usuarios')) {
    if (await knex.schema.hasColumn('usuarios', 'rol_propio_id')) {
      try {
        await knex.raw('ALTER TABLE usuarios DROP INDEX usuarios_rol_propio_idx');
      } catch {
        // El índice pudo eliminarse con la columna.
      }
      await knex.raw('ALTER TABLE usuarios DROP COLUMN rol_propio_id');
    }
  }
  if (await knex.schema.hasTable('roles')) await knex.schema.dropTable('roles');
}
