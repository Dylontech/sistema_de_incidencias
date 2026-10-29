/**
 * Solicitudes de informe con múltiples estados, municipios y tipos.
 *
 * Se conservan `municipio_id` y `estado_entidad` por compatibilidad, pero los
 * nuevos arrays son la fuente principal. También se guarda el archivo generado
 * para que el admin pueda previsualizarlo antes de enviarlo.
 */
export async function up(knex) {
  const columnas = [
    ['municipios', 'LONGTEXT NULL'],
    ['estados', 'LONGTEXT NULL'],
    ['ambitos', 'LONGTEXT NULL'],
    ['tipos_todos', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['archivo', 'VARCHAR(255) NULL'],
    ['generado_en', 'DATETIME(3) NULL'],
    ['enviado_en', 'DATETIME(3) NULL']
  ];

  for (const [columna, definicion] of columnas) {
    if (!(await knex.schema.hasColumn('solicitudes_informe', columna))) {
      await knex.raw(`ALTER TABLE solicitudes_informe ADD COLUMN ${columna} ${definicion}`);
    }
  }

  // Las solicitudes antiguas pasan a los arrays nuevos.
  await knex.raw(
    `UPDATE solicitudes_informe
        SET municipios = JSON_ARRAY(municipio_id)
      WHERE municipios IS NULL AND municipio_id IS NOT NULL AND municipio_id <> ''`
  );
  await knex.raw(
    `UPDATE solicitudes_informe
        SET estados = JSON_ARRAY(estado_entidad)
      WHERE estados IS NULL AND estado_entidad IS NOT NULL AND estado_entidad <> ''`
  );
}

export async function down(knex) {
  for (const columna of [
    'municipios',
    'estados',
    'ambitos',
    'tipos_todos',
    'archivo',
    'generado_en',
    'enviado_en'
  ]) {
    if (await knex.schema.hasColumn('solicitudes_informe', columna)) {
      await knex.schema.alterTable('solicitudes_informe', (t) => t.dropColumn(columna));
    }
  }
}
