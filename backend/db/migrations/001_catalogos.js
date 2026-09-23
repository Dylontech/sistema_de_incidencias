/**
 * Migración 001 — catálogos: municipios, zonas, tipos y usuarios.
 * Equivale a los datos que el monolito guardaba en localStorage.
 */

export async function up(knex) {
  await knex.schema.createTable('municipios', (t) => {
    t.string('id', 64).primary();
    t.string('nombre', 120).notNullable();
    t.string('estado', 120).notNullable();
    t.string('clave', 64).notNullable().unique();
    t.decimal('center_lat', 10, 7).notNullable();
    t.decimal('center_lng', 10, 7).notNullable();
    t.integer('zoom').notNullable().defaultTo(14);
    t.json('bbox').notNullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('zonas', (t) => {
    t.string('id', 64).primary();
    t.string('municipio_id', 64).notNullable().references('id').inTable('municipios').onDelete('CASCADE');
    t.string('nombre', 160).notNullable();
    t.enum('tipo', ['colonia', 'tenencia', 'zona']).notNullable().defaultTo('zona');
    t.string('color', 16).notNullable().defaultTo('#2563eb');
    t.json('poligono').notNullable();
    t.index(['municipio_id']);
  });

  await knex.schema.createTable('tipos', (t) => {
    t.string('id', 120).primary();
    t.string('nombre', 120).notNullable();
    t.string('icono', 32).notNullable();
    t.boolean('custom').notNullable().defaultTo(false);
  });

  await knex.schema.createTable('usuarios', (t) => {
    t.string('id', 64).primary();
    t.string('username', 60).notNullable().unique();
    t.string('nombre', 120).notNullable();
    t.enum('rol', ['funcionario', 'admin']).notNullable();
    t.string('municipio_id', 64).nullable().references('id').inTable('municipios').onDelete('SET NULL');
    t.boolean('activo').notNullable().defaultTo(true);
    // Solo el hash bcrypt; nunca la contraseña en claro (defecto del monolito).
    t.string('password_hash', 255).notNullable();
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('usuarios');
  await knex.schema.dropTableIfExists('tipos');
  await knex.schema.dropTableIfExists('zonas');
  await knex.schema.dropTableIfExists('municipios');
}
