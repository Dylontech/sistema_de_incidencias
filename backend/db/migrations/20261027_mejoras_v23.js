/**
 * Mejoras V2.3: fichas municipales con aprobación, roles especiales,
 * solicitudes de permisos, correo de contacto en claves y personalización de
 * publicaciones.
 *
 * Las tablas nuevas usan la misma colación que `usuarios` cuando guardan una
 * referencia a una cuenta. Los catálogos municipales no llevan FK para no
 * atar la migración al orden de carga del INEGI.
 */
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

export async function up(knex) {
  const colacion = await colacionDeUsuarios(knex);
  /* ---------------------- fichas de información municipal ------------------ */
  if (!(await knex.schema.hasTable('municipios_informacion'))) {
    await knex.schema.createTable('municipios_informacion', (t) => {
      t.string('id', 64).primary();
      t.string('municipio_id', 64).notNullable().unique();
      t.string('sitio_web', 500).nullable();
      t.string('telefono', 80).nullable();
      t.string('correo', 160).nullable();
      t.string('direccion', 300).nullable();
      t.string('horario', 200).nullable();
      t.text('notas', 'longtext').nullable();
      t.enum('estado', ['borrador', 'pendiente', 'aprobado', 'rechazado'])
        .notNullable()
        .defaultTo('borrador');
      t.string('propuesto_por', 120).nullable();
      t.string('aprobado_por', 120).nullable();
      t.string('motivo_rechazo', 600).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.datetime('actualizado_en', { precision: 3 }).notNullable();
      t.index(['estado'], 'ficha_estado_idx');
    });
  }

  /* --------------------------- roles especiales --------------------------- */
  if (!(await knex.schema.hasTable('roles_personalizados'))) {
    await knex.schema.createTable('roles_personalizados', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('nombre', 120).notNullable();
      t.string('descripcion', 400).nullable();
      t.string('rol_base', 40).notNullable().defaultTo('funcionario');
      t.text('permisos', 'longtext').nullable();
      t.boolean('activo').notNullable().defaultTo(true);
      t.string('creado_por', 120).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.datetime('actualizado_en', { precision: 3 }).notNullable();
    });
  }

  if (
    (await knex.schema.hasTable('usuarios')) &&
    !(await knex.schema.hasColumn('usuarios', 'rol_personalizado_id'))
  ) {
    await knex.schema.alterTable('usuarios', (t) => {
      t.string('rol_personalizado_id', 64).nullable();
    });
    await knex.raw(
      'ALTER TABLE usuarios ADD INDEX usuarios_rol_personalizado_idx (rol_personalizado_id)'
    );
  }

  /* ----------------------- solicitudes de permisos ------------------------ */
  if (!(await knex.schema.hasTable('solicitudes_permisos'))) {
    await knex.schema.createTable('solicitudes_permisos', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('usuario_id', 64).notNullable();
      t.string('username', 120).notNullable();
      t.string('nombre', 160).nullable();
      t.string('municipio_id', 64).nullable();
      t.text('permisos', 'longtext').nullable();
      t.string('motivo', 600).notNullable();
      t.enum('estado', ['pendiente', 'aprobada', 'rechazada'])
        .notNullable()
        .defaultTo('pendiente');
      t.string('resuelto_por', 120).nullable();
      t.datetime('resuelto_en', { precision: 3 }).nullable();
      t.string('respuesta', 600).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.foreign('usuario_id').references('usuarios.id').onDelete('CASCADE');
      t.index(['estado', 'creado_en'], 'solicitud_permiso_estado_idx');
      t.index(['usuario_id'], 'solicitud_permiso_usuario_idx');
    });
  }

  /* ------------------------ claves: correo de contacto --------------------- */
  if (await knex.schema.hasTable('claves_acceso')) {
    if (!(await knex.schema.hasColumn('claves_acceso', 'correo_contacto'))) {
      await knex.schema.alterTable('claves_acceso', (t) => {
        t.string('correo_contacto', 160).nullable();
      });
    }
    if (!(await knex.schema.hasColumn('claves_acceso', 'correo_institucional_id'))) {
      await knex.schema.alterTable('claves_acceso', (t) => {
        t.string('correo_institucional_id', 64).nullable();
      });
    }
  }

  /* --------------------- publicaciones: color y estructura ---------------- */
  if (await knex.schema.hasTable('publicaciones_redes')) {
    const columnas = [
      ['color_primario', (t) => t.string('color_primario', 7).nullable()],
      ['color_secundario', (t) => t.string('color_secundario', 7).nullable()],
      ['estructura', (t) => t.string('estructura', 40).nullable()],
      ['cta', (t) => t.string('cta', 80).nullable()],
      ['cuerpo', (t) => t.text('cuerpo', 'longtext').nullable()],
      ['actualizado_en', (t) => t.datetime('actualizado_en', { precision: 3 }).nullable()]
    ];
    for (const [nombre, crear] of columnas) {
      if (!(await knex.schema.hasColumn('publicaciones_redes', nombre))) {
        await knex.schema.alterTable('publicaciones_redes', crear);
      }
    }
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('publicaciones_redes')) {
    for (const nombre of ['color_primario', 'color_secundario', 'estructura', 'cta', 'cuerpo', 'actualizado_en']) {
      if (await knex.schema.hasColumn('publicaciones_redes', nombre)) {
        await knex.schema.alterTable('publicaciones_redes', (t) => t.dropColumn(nombre));
      }
    }
  }
  if (await knex.schema.hasTable('claves_acceso')) {
    for (const nombre of ['correo_contacto', 'correo_institucional_id']) {
      if (await knex.schema.hasColumn('claves_acceso', nombre)) {
        await knex.schema.alterTable('claves_acceso', (t) => t.dropColumn(nombre));
      }
    }
  }
  if (await knex.schema.hasTable('usuarios')) {
    if (await knex.schema.hasColumn('usuarios', 'rol_personalizado_id')) {
      await knex.raw('ALTER TABLE usuarios DROP INDEX usuarios_rol_personalizado_idx');
      await knex.schema.alterTable('usuarios', (t) => t.dropColumn('rol_personalizado_id'));
    }
  }
  await knex.schema.dropTableIfExists('solicitudes_permisos');
  await knex.schema.dropTableIfExists('roles_personalizados');
  await knex.schema.dropTableIfExists('municipios_informacion');
}
