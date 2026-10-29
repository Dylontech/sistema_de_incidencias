/**
 * Firmas de incidencias y recolecciones municipales.
 *
 * Una recolección puede estar ligada a una incidencia o a un municipio (para
 * pedir que el municipio se sume al sistema cuando aún no tiene funcionarios).
 * Las firmas se guardan aparte para no depender del reemplazo completo de hijos
 * que hace el driver MySQL al actualizar una incidencia.
 */
async function colacionDeUsuarios(knex) {
  const resultado = await knex.raw(
    `SELECT COLLATION_NAME AS col FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'id'`
  );
  const filas = Array.isArray(resultado) ? resultado[0] : null;
  return filas?.[0]?.col || 'utf8mb4_unicode_ci';
}

export async function up(knex) {
  const colacion = await colacionDeUsuarios(knex);

  if (!(await knex.schema.hasTable('recolecciones_firmas'))) {
    await knex.schema.createTable('recolecciones_firmas', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.enum('tipo', ['incidencia', 'municipio']).notNullable();
      t.string('incidencia_id', 64).nullable();
      t.string('municipio_id', 64).nullable();
      t.string('titulo', 160).notNullable();
      t.text('descripcion').nullable();
      t.integer('meta').notNullable().defaultTo(0);
      t.enum('estado', ['abierta', 'meta_alcanzada', 'enviada', 'cerrada'])
        .notNullable()
        .defaultTo('abierta');
      t.string('creado_por_usuario_id', 64).nullable();
      t.string('creado_por_user_key', 120).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.datetime('meta_alcanzada_en', { precision: 3 }).nullable();
      t.datetime('enviada_en', { precision: 3 }).nullable();
      t.string('enviada_a', 160).nullable();
      t.boolean('simulado').notNullable().defaultTo(false);
      t.string('simulacion_id', 64).nullable();

      t.index(['tipo', 'incidencia_id'], 'recol_tipo_inc_idx');
      t.index(['municipio_id', 'estado'], 'recol_muni_estado_idx');
      t.index(['creado_por_usuario_id'], 'recol_creador_idx');
      t.index(['simulado'], 'recol_simulado_idx');
    });
  }

  if (!(await knex.schema.hasTable('recoleccion_firmas'))) {
    await knex.schema.createTable('recoleccion_firmas', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('recoleccion_id', 64).notNullable();
      t.string('usuario_id', 64).nullable();
      t.string('user_key', 120).notNullable();
      t.string('nombre_publico', 120).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.string('ip_hash', 64).nullable();
      t.boolean('simulado').notNullable().defaultTo(false);
      t.string('simulacion_id', 64).nullable();

      t.foreign('recoleccion_id', 'firma_recoleccion_fk')
        .references('id')
        .inTable('recolecciones_firmas')
        .onDelete('CASCADE');
      t.foreign('usuario_id', 'firma_usuario_fk')
        .references('id')
        .inTable('usuarios')
        .onDelete('SET NULL');
      t.unique(['recoleccion_id', 'user_key'], 'firma_recol_user_uq');
      t.index(['usuario_id'], 'firma_usuario_idx');
      t.index(['simulado'], 'firma_simulado_idx');
    });
  }

  if (!(await knex.schema.hasTable('recoleccion_firmas_envios'))) {
    await knex.schema.createTable('recoleccion_firmas_envios', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('recoleccion_id', 64).notNullable();
      t.enum('tipo', ['solicitud_admin', 'envio_funcionario', 'descarga']).notNullable();
      t.string('destino', 160).nullable();
      t.enum('estado', ['pendiente', 'enviado', 'error']).notNullable().defaultTo('pendiente');
      t.text('nota').nullable();
      t.string('creado_por', 120).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();

      t.foreign('recoleccion_id', 'envio_recoleccion_fk')
        .references('id')
        .inTable('recolecciones_firmas')
        .onDelete('CASCADE');
      t.index(['recoleccion_id', 'creado_en'], 'envio_recol_fecha_idx');
    });
  }

  if (!(await knex.schema.hasColumn('incidencias', 'folio'))) {
    await knex.schema.alterTable('incidencias', (t) => {
      t.string('folio', 32).nullable();
      t.integer('meta_firmas').nullable();
    });
    // Folio legible y estable para las incidencias existentes.
    await knex.raw(
      `UPDATE incidencias
          SET folio = CONCAT('INC-', DATE_FORMAT(fecha, '%Y%m%d'), '-',
                             UPPER(SUBSTRING(REPLACE(id, '-', ''), 1, 6)))
        WHERE folio IS NULL`
    );
    await knex.raw('ALTER TABLE incidencias ADD UNIQUE INDEX incidencias_folio_uq (folio)');
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('incidencias', 'folio')) {
    await knex.raw('ALTER TABLE incidencias DROP INDEX incidencias_folio_uq');
    await knex.schema.alterTable('incidencias', (t) => {
      t.dropColumn('folio');
      t.dropColumn('meta_firmas');
    });
  }
  await knex.schema.dropTableIfExists('recoleccion_firmas_envios');
  await knex.schema.dropTableIfExists('recoleccion_firmas');
  await knex.schema.dropTableIfExists('recolecciones_firmas');
}
