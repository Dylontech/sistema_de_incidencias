/**
 * Notificaciones v2: eventos, destinatarios y configuración.
 *
 * Hasta aquí una notificación solo sabía de qué incidencia hablaba y a quién
 * iba dirigida (`para_usuario`). Esta migración añade lo necesario para que el
 * despachador central pueda decidir destinatarios por rol y territorio, evitar
 * duplicados, enlazar al origen y respetar preferencias por tipo de aviso.
 *
 *  - `notificaciones.evento`: identificador estable del suceso
 *    (`ticket_creado`, `sugerencia_creada`, …). Las filas antiguas se rellenan
 *    con su `tipo` para no perderlas.
 *  - `entidad_tipo`/`entidad_id`: a qué se puede navegar desde la campana.
 *  - `municipio_id`: permite filtrar avisos por territorio.
 *  - `clave_dedupe`: evita repetir el mismo aviso (por usuario + clave).
 *  - `leida_en`: momento exacto de lectura.
 *  - `preferencia_eventos`: canal elegido por cada cuenta para cada evento.
 *  - `configuracion_notificaciones`: reglas globales por evento (canal, roles
 *    destinatarios, alcance territorial y severidad).
 */
async function colacionDeUsuarios(knex) {
  const resultado = await knex.raw(
    `SELECT COLLATION_NAME AS col FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'id'`
  );
  const filas = Array.isArray(resultado) ? resultado[0] : null;
  return filas?.[0]?.col || 'utf8mb4_unicode_ci';
}

async function agregarColumna(knex, tabla, columna, definidor) {
  if (await knex.schema.hasColumn(tabla, columna)) return;
  await knex.schema.alterTable(tabla, (t) => definidor(t));
}

export async function up(knex) {
  const colacion = await colacionDeUsuarios(knex);

  await agregarColumna(knex, 'notificaciones', 'evento', (t) => t.string('evento', 60).nullable());
  await agregarColumna(knex, 'notificaciones', 'severidad', (t) =>
    t.string('severidad', 20).notNullable().defaultTo('info')
  );
  await agregarColumna(knex, 'notificaciones', 'entidad_tipo', (t) =>
    t.string('entidad_tipo', 30).nullable()
  );
  await agregarColumna(knex, 'notificaciones', 'entidad_id', (t) =>
    t.string('entidad_id', 64).nullable()
  );
  await agregarColumna(knex, 'notificaciones', 'municipio_id', (t) =>
    t.string('municipio_id', 64).nullable()
  );
  await agregarColumna(knex, 'notificaciones', 'url', (t) => t.string('url', 200).nullable());
  await agregarColumna(knex, 'notificaciones', 'clave_dedupe', (t) =>
    t.string('clave_dedupe', 120).nullable()
  );
  await agregarColumna(knex, 'notificaciones', 'leida_en', (t) =>
    t.datetime('leida_en', { precision: 3 }).nullable()
  );

  // Las notificaciones anteriores conservan su tipo como evento.
  await knex('notificaciones').whereNull('evento').update({ evento: knex.ref('tipo') });
  await knex('notificaciones')
    .where('leida', true)
    .whereNull('leida_en')
    .update({ leida_en: knex.ref('fecha') });

  if (!(await knex.schema.hasTable('preferencia_eventos'))) {
    await knex.schema.createTable('preferencia_eventos', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('usuario_id', 64).notNullable();
      t.string('evento', 60).notNullable();
      t.string('canal', 20).notNullable().defaultTo('app');
      t.datetime('actualizado_en', { precision: 3 }).defaultTo(knex.fn.now());
      t.primary(['usuario_id', 'evento']);
      t.foreign('usuario_id').references('usuarios.id').onDelete('CASCADE');
    });
  }

  if (!(await knex.schema.hasTable('configuracion_notificaciones'))) {
    await knex.schema.createTable('configuracion_notificaciones', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('evento', 60).notNullable().primary();
      t.boolean('activo').notNullable().defaultTo(true);
      t.string('canal', 20).notNullable().defaultTo('app');
      t.string('severidad', 20).notNullable().defaultTo('info');
      t.string('alcance', 20).notNullable().defaultTo('asignados');
      t.text('roles', 'longtext').nullable();
      t.text('municipios', 'longtext').nullable();
      t.text('estados', 'longtext').nullable();
      t.string('actualizado_por', 60).nullable();
      t.datetime('actualizado_en', { precision: 3 }).defaultTo(knex.fn.now());
    });
  }

  // Índices de consulta del buzón y del dedupe. Se crean solo si no existen.
  const indices = await knex.raw('SHOW INDEX FROM notificaciones');
  const filasIndices = Array.isArray(indices) ? indices[0] : [];
  const nombres = new Set(filasIndices.map((i) => i.Key_name));
  if (!nombres.has('notificaciones_usuario_dedupe_unique')) {
    // MySQL permite varios NULL en un índice único: solo deduplica cuando hay clave.
    await knex.raw(
      'ALTER TABLE `notificaciones` ADD UNIQUE INDEX `notificaciones_usuario_dedupe_unique` (`para_usuario`, `clave_dedupe`)'
    );
  }
  if (!nombres.has('notificaciones_usuario_leida_fecha_index')) {
    await knex.raw(
      'ALTER TABLE `notificaciones` ADD INDEX `notificaciones_usuario_leida_fecha_index` (`para_usuario`, `leida`, `fecha`)'
    );
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('configuracion_notificaciones');
  await knex.schema.dropTableIfExists('preferencia_eventos');
  for (const columna of [
    'leida_en',
    'clave_dedupe',
    'url',
    'municipio_id',
    'entidad_id',
    'entidad_tipo',
    'severidad',
    'evento'
  ]) {
    if (await knex.schema.hasColumn('notificaciones', columna)) {
      await knex.schema.alterTable('notificaciones', (t) => t.dropColumn(columna));
    }
  }
}
