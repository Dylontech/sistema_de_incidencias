/**
 * Registro de avisos de vencimiento de claves.
 *
 * Cada fila representa un aviso ya entregado a una cuenta para un umbral
 * concreto (30, 20, 10, 5 o 0 días). Así el proceso periódico puede ejecutarse
 * varias veces sin repetir correos ni notificaciones.
 */

export async function up(knex) {
  if (await knex.schema.hasTable('avisos_clave_enviados')) return;
  const colacion = await colacionDeUsuarios(knex);
  await knex.schema.createTable('avisos_clave_enviados', (t) => {
    t.charset('utf8mb4');
    t.collate(colacion);
    t.string('id', 64).primary();
    t.string('clave_id', 64).notNullable();
    t.string('usuario_id', 64).notNullable();
    t.integer('umbral_dias').notNullable();
    t.integer('dias_restantes').notNullable();
    t.datetime('clave_expira_en', { precision: 3 }).nullable();
    t.datetime('enviado_en', { precision: 3 }).notNullable();
    t.foreign('clave_id').references('claves_acceso.id').onDelete('CASCADE');
    t.foreign('usuario_id').references('usuarios.id').onDelete('CASCADE');
    t.unique(['clave_id', 'usuario_id', 'umbral_dias'], 'aviso_clave_unico');
    t.index(['enviado_en'], 'aviso_clave_enviado_idx');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('avisos_clave_enviados');
}

async function colacionDeUsuarios(knex) {
  try {
    const [fila] = await knex('information_schema.COLUMNS')
      .select('COLLATION_NAME')
      .where({
        TABLE_SCHEMA: knex.client.config.connection.database,
        TABLE_NAME: 'usuarios',
        COLUMN_NAME: 'id'
      })
      .limit(1);
    return fila?.COLLATION_NAME || 'utf8mb4_unicode_ci';
  } catch {
    return 'utf8mb4_unicode_ci';
  }
}
