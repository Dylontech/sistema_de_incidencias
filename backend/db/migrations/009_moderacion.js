/**
 * Migración 009 — sistema de moderación.
 *
 * Añade tres cosas:
 *  1. El ocultamiento de publicaciones y comentarios (`oculta` / `oculto`), que
 *     es la acción habitual de moderación: no borra nada, solo retira el
 *     contenido de la vista pública.
 *  2. La tabla `denuncias`, el expediente que abre un ciudadano cuando algo le
 *     parece inapropiado. **Sin clave foránea a propósito** (igual que
 *     `notificaciones.incidencia_id`): la denuncia guarda una copia del título y
 *     del autor, así que la auditoría sobrevive a que se borre la publicación.
 *  3. Las advertencias y la suspensión de cuentas en `usuarios`.
 *
 * Es idempotente (comprueba antes de crear columnas/tabla) porque puede correr
 * sobre bases que ya traían parte del esquema de una prueba anterior.
 */
export async function up(knex) {
  /* ------------------------- publicaciones ocultas ------------------------- */
  if (!(await knex.schema.hasColumn('incidencias', 'oculta'))) {
    await knex.schema.alterTable('incidencias', (t) => {
      t.boolean('oculta').notNullable().defaultTo(false);
      t.string('oculta_por', 120).nullable();
      t.datetime('oculta_fecha', { precision: 3 }).nullable();
      t.string('oculta_motivo', 200).nullable();
      t.index(['oculta', 'estado']);
    });
  }

  /* -------------------------- comentarios ocultos -------------------------- */
  if (!(await knex.schema.hasColumn('incidencia_comentarios', 'oculto'))) {
    await knex.schema.alterTable('incidencia_comentarios', (t) => {
      // Identidad interna de quien comenta: sin ella no se le puede avisar si
      // su comentario se modera. Los comentarios anteriores quedan sin atribuir.
      t.string('user_key', 120).nullable();
      t.boolean('oculto').notNullable().defaultTo(false);
      t.string('oculto_por', 120).nullable();
      t.datetime('oculto_fecha', { precision: 3 }).nullable();
      t.string('oculto_motivo', 200).nullable();
    });
  }

  /* ---------------------- advertencias y suspensiones ---------------------- */
  if (!(await knex.schema.hasColumn('usuarios', 'advertencias'))) {
    await knex.schema.alterTable('usuarios', (t) => {
      t.integer('advertencias').unsigned().notNullable().defaultTo(0);
      t.boolean('suspendido').notNullable().defaultTo(false);
      // Fecha de fin opcional: vacía = suspensión indefinida.
      t.datetime('suspendido_hasta', { precision: 3 }).nullable();
      t.string('suspendido_motivo', 200).nullable();
      t.string('suspendido_por', 120).nullable();
      t.index(['suspendido']);
    });
  }

  /* ------------------------------- denuncias ------------------------------- */
  if (!(await knex.schema.hasTable('denuncias'))) {
    await knex.schema.createTable('denuncias', (t) => {
      t.string('id', 64).primary();
      t.datetime('fecha', { precision: 3 }).notNullable();
      t.enum('objetivo', ['incidencia', 'comentario']).notNullable().defaultTo('incidencia');
      // Sin FK: la denuncia es el registro de auditoría y debe sobrevivir al
      // borrado de la publicación.
      t.string('incidencia_id', 64).notNullable();
      t.string('comentario_id', 64).nullable();
      t.string('municipio_id', 64).nullable();
      t.string('objetivo_titulo', 200).notNullable().defaultTo('');
      t.string('objetivo_resumen', 300).notNullable().defaultTo('');
      t.string('objetivo_autor', 120).nullable();
      t.string('objetivo_user_key', 120).nullable();
      t.string('autor_user_key', 120).nullable();
      t.string('autor_nombre', 120).notNullable();
      t.enum('motivo', [
        'spam',
        'contenido_ofensivo',
        'violencia_o_amenazas',
        'datos_personales',
        'informacion_falsa',
        'fuera_de_tema',
        'duplicado',
        'otro'
      ]).notNullable();
      t.string('detalle', 400).notNullable().defaultTo('');
      t.enum('estado', ['pendiente', 'atendida', 'descartada']).notNullable().defaultTo('pendiente');
      t.enum('accion', ['ocultar', 'eliminar', 'advertir', 'suspender', 'descartar']).nullable();
      t.text('resolucion').nullable();
      t.string('moderado_por', 120).nullable();
      t.datetime('moderado_fecha', { precision: 3 }).nullable();

      t.index(['incidencia_id']);
      t.index(['estado']);
      t.index(['fecha']);
      t.index(['municipio_id']);
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('denuncias');

  if (await knex.schema.hasColumn('usuarios', 'advertencias')) {
    await knex.schema.alterTable('usuarios', (t) => {
      t.dropIndex(['suspendido']);
      t.dropColumn('advertencias');
      t.dropColumn('suspendido');
      t.dropColumn('suspendido_hasta');
      t.dropColumn('suspendido_motivo');
      t.dropColumn('suspendido_por');
    });
  }

  if (await knex.schema.hasColumn('incidencia_comentarios', 'oculto')) {
    await knex.schema.alterTable('incidencia_comentarios', (t) => {
      t.dropColumn('user_key');
      t.dropColumn('oculto');
      t.dropColumn('oculto_por');
      t.dropColumn('oculto_fecha');
      t.dropColumn('oculto_motivo');
    });
  }

  if (await knex.schema.hasColumn('incidencias', 'oculta')) {
    await knex.schema.alterTable('incidencias', (t) => {
      t.dropIndex(['oculta', 'estado']);
      t.dropColumn('oculta');
      t.dropColumn('oculta_por');
      t.dropColumn('oculta_fecha');
      t.dropColumn('oculta_motivo');
    });
  }
}
