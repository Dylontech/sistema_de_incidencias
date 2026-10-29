/**
 * Publicidad avanzada: diseño persistente, imagen, QR configurable y códigos
 * de escaneo.
 *
 * La tabla de publicaciones ya existía; esta migración solo añade columnas
 * compatibles con JSON y MySQL. No se guardan coordenadas ni datos personales
 * de los escaneos.
 */
export async function up(knex) {
  if (!(await knex.schema.hasTable('publicaciones_redes'))) return;

  const columnas = [
    ['formato', (t) => t.string('formato', 40).nullable()],
    ['ancho', (t) => t.integer('ancho').unsigned().nullable()],
    ['alto', (t) => t.integer('alto').unsigned().nullable()],
    ['diseno', (t) => t.string('diseno', 40).nullable()],
    ['fuente', (t) => t.string('fuente', 40).nullable()],
    ['kicker', (t) => t.string('kicker', 160).nullable()],
    ['pie', (t) => t.string('pie', 200).nullable()],
    ['mostrar_qr', (t) => t.boolean('mostrar_qr').notNullable().defaultTo(true)],
    ['qr_config', (t) => t.text('qr_config', 'longtext').nullable()],
    ['qr_codigo', (t) => t.string('qr_codigo', 64).nullable()],
    ['layout', (t) => t.text('layout', 'longtext').nullable()],
    ['miniatura_url', (t) => t.string('miniatura_url', 500).nullable()],
    ['publicado_en', (t) => t.datetime('publicado_en', { precision: 3 }).nullable()]
  ];

  for (const [nombre, crear] of columnas) {
    if (!(await knex.schema.hasColumn('publicaciones_redes', nombre))) {
      await knex.schema.alterTable('publicaciones_redes', crear);
    }
  }

  // Código estable para las publicaciones anteriores. El identificador ya es
  // único y cabe en la columna; las nuevas piezas reciben uno corto.
  await knex('publicaciones_redes')
    .whereNull('qr_codigo')
    .update({ qr_codigo: knex.raw('id') });

  if (!(await knex.schema.hasTable('codigos_qr'))) {
    await knex.schema.createTable('codigos_qr', (t) => {
      t.string('id', 64).primary();
      t.string('codigo', 64).notNullable().unique();
      t.string('tipo', 24).notNullable().defaultTo('sistema');
      t.text('contenido', 'longtext').nullable();
      t.string('destino', 1000).nullable();
      t.string('publicacion_id', 64).nullable();
      t.boolean('activo').notNullable().defaultTo(true);
      t.string('creado_por', 120).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.datetime('actualizado_en', { precision: 3 }).nullable();
      t.boolean('simulado').notNullable().defaultTo(false);
      t.string('simulacion_id', 64).nullable();
      t.index(['publicacion_id'], 'qr_publicacion_idx');
      t.index(['activo', 'creado_en'], 'qr_activo_fecha_idx');
    });
  }

  if (!(await knex.schema.hasTable('qr_escaneos'))) {
    await knex.schema.createTable('qr_escaneos', (t) => {
      t.string('id', 64).primary();
      t.string('codigo_id', 64).nullable();
      t.string('codigo', 64).notNullable();
      t.string('publicacion_id', 64).nullable();
      t.datetime('escaneado_en', { precision: 3 }).notNullable();
      t.string('municipio_id', 64).nullable();
      t.integer('precision_m').unsigned().nullable();
      t.string('user_key', 120).nullable();
      t.string('ip_hash', 64).nullable();
      t.string('user_agent', 240).nullable();
      t.string('origen', 24).notNullable().defaultTo('qr');
      t.boolean('ubicacion_resuelta').notNullable().defaultTo(false);
      t.boolean('simulado').notNullable().defaultTo(false);
      t.string('simulacion_id', 64).nullable();
      t.index(['codigo', 'escaneado_en'], 'qr_escaneo_codigo_idx');
      t.index(['publicacion_id', 'escaneado_en'], 'qr_escaneo_pub_idx');
      t.index(['municipio_id', 'escaneado_en'], 'qr_escaneo_muni_idx');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('qr_escaneos');
  await knex.schema.dropTableIfExists('codigos_qr');
  if (await knex.schema.hasTable('publicaciones_redes')) {
    for (const nombre of [
      'formato',
      'ancho',
      'alto',
      'diseno',
      'fuente',
      'kicker',
      'pie',
      'mostrar_qr',
      'qr_config',
      'qr_codigo',
      'layout',
      'miniatura_url',
      'publicado_en'
    ]) {
      if (await knex.schema.hasColumn('publicaciones_redes', nombre)) {
        await knex.schema.alterTable('publicaciones_redes', (t) => t.dropColumn(nombre));
      }
    }
  }
}
