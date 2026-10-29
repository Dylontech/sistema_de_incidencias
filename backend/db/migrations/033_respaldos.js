/**
 * Respaldos manuales y automáticos.
 *
 * El archivo se guarda fuera de los estáticos; la base solo conserva metadatos,
 * hash y auditoría. La restauración siempre crea un respaldo previo.
 */
export async function up(knex) {
  if (!(await knex.schema.hasTable('respaldos'))) {
    await knex.schema.createTable('respaldos', (t) => {
      t.string('id', 64).primary();
      t.string('nombre', 160).notNullable();
      t.enum('tipo', ['manual', 'automatico', 'previo_restauracion'])
        .notNullable()
        .defaultTo('manual');
      t.enum('formato', ['json', 'sql']).notNullable().defaultTo('json');
      t.string('archivo', 255).notNullable();
      t.bigInteger('tamano').notNullable().defaultTo(0);
      t.string('hash', 64).nullable();
      t.enum('estado', ['generando', 'listo', 'error', 'restaurado'])
        .notNullable()
        .defaultTo('generando');
      t.text('error', 'longtext').nullable();
      t.boolean('incluye_simulados').notNullable().defaultTo(false);
      t.string('creado_por', 120).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.datetime('restaurado_en', { precision: 3 }).nullable();
      t.text('notas', 'longtext').nullable();

      t.index(['creado_en'], 'respaldos_fecha_idx');
      t.index(['tipo', 'estado'], 'respaldos_tipo_idx');
    });
  }

  if (!(await knex.schema.hasTable('respaldos_eventos'))) {
    await knex.schema.createTable('respaldos_eventos', (t) => {
      t.string('id', 64).primary();
      t.string('respaldo_id', 64).notNullable();
      t.enum('tipo', ['creado', 'descargado', 'restaurado', 'eliminado', 'error']).notNullable();
      t.string('actor', 120).nullable();
      t.text('detalle', 'longtext').nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();

      t.foreign('respaldo_id', 'respaldo_evento_fk')
        .references('id')
        .inTable('respaldos')
        .onDelete('CASCADE');
      t.index(['respaldo_id', 'creado_en'], 'respaldo_evento_fecha_idx');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('respaldos_eventos');
  await knex.schema.dropTableIfExists('respaldos');
}
