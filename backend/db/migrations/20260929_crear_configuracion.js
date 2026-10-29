/**
 * Tabla de configuración clave-valor (términos, avisos, parámetros editables).
 *
 * El proyecto es ESM (`"type": "module"`), así que la migración usa
 * `export` igual que el resto. Con `exports.up` Knex la cargaba con `import()`
 * y fallaba con «exports is not defined».
 */
export async function up(knex) {
  const existe = await knex.schema.hasTable('configuracion');
  if (existe) return;
  await knex.schema.createTable('configuracion', (t) => {
    t.increments('id').primary();
    t.string('clave', 100).notNullable().unique();
    t.text('valor', 'longtext');
    t.timestamp('creado_en').defaultTo(knex.fn.now());
    t.timestamp('actualizado_en').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('configuracion');
}
