/**
 * Cuentas de autoservicio, recuperación de contraseña y claves vinculadas.
 *
 * - `usuarios.correo_verificado` separa las cuentas ciudadanas nuevas (deben
 *   confirmar el correo) de las existentes (se consideran verificadas).
 * - `usuarios.suspendido_origen` distingue moderación, congelación del titular
 *   e inactividad.
 * - `usuarios.clave_obligatoria` impide que una cuenta de personal creada sin
 *   clave tenga acceso hasta que la administración le vincule una.
 * - `tokens_cuenta` guarda solo el hash de los enlaces de verificación y de
 *   recuperación.
 * - `clave_acceso_cuentas` pasa a ser la fuente real de vínculos clave↔cuenta;
 *   `solicitudes_renovacion_clave` registra las solicitudes de los funcionarios.
 */

export async function up(knex) {
  const colacion = await colacionDeUsuarios(knex);

  await agregarColumnas(knex, 'usuarios', [
    ['correo_verificado', 'BOOLEAN NOT NULL DEFAULT 1'],
    ['correo_verificado_en', 'DATETIME(3) NULL'],
    ['suspendido_origen', 'VARCHAR(20) NULL'],
    ['clave_obligatoria', 'BOOLEAN NOT NULL DEFAULT 0'],
    ['creado_en', 'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)']
  ]);

  await agregarColumnas(knex, 'solicitudes_acceso', [
    ['clave_id', 'VARCHAR(64) NULL']
  ]);
  await agregarColumnas(knex, 'solicitudes_usuario', [
    ['clave_id', 'VARCHAR(64) NULL']
  ]);

  if (!(await knex.schema.hasTable('tokens_cuenta'))) {
    await knex.schema.createTable('tokens_cuenta', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('usuario_id', 64).notNullable();
      t.string('tipo', 24).notNullable();
      t.string('token_hash', 64).notNullable().unique();
      t.datetime('expira_en', { precision: 3 }).notNullable();
      t.datetime('usado_en', { precision: 3 }).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.string('ip_hash', 64).nullable();
      t.string('user_agent', 200).nullable();
      t.foreign('usuario_id').references('usuarios.id').onDelete('CASCADE');
      t.index(['usuario_id', 'tipo', 'usado_en'], 'token_cuenta_usuario_idx');
      t.index(['expira_en'], 'token_cuenta_expira_idx');
    });
  }

  if (!(await knex.schema.hasTable('solicitudes_renovacion_clave'))) {
    await knex.schema.createTable('solicitudes_renovacion_clave', (t) => {
      t.charset('utf8mb4');
      t.collate(colacion);
      t.string('id', 64).primary();
      t.string('clave_id', 64).notNullable();
      t.string('solicitado_por_usuario_id', 64).notNullable();
      t.string('solicitado_por', 120).nullable();
      t.string('motivo', 600).nullable();
      t.string('estado', 20).notNullable().defaultTo('pendiente');
      t.string('clave_nueva_id', 64).nullable();
      t.string('resuelto_por', 120).nullable();
      t.datetime('resuelto_en', { precision: 3 }).nullable();
      t.string('respuesta', 600).nullable();
      t.datetime('creado_en', { precision: 3 }).notNullable();
      t.foreign('clave_id').references('claves_acceso.id').onDelete('CASCADE');
      t.foreign('solicitado_por_usuario_id').references('usuarios.id').onDelete('CASCADE');
      t.foreign('clave_nueva_id').references('claves_acceso.id').onDelete('SET NULL');
      t.index(['estado', 'creado_en'], 'renovacion_clave_estado_idx');
      t.index(['clave_id', 'estado'], 'renovacion_clave_clave_idx');
      t.index(['solicitado_por_usuario_id', 'estado'], 'renovacion_clave_usuario_idx');
    });
  }

  await crearIndices(knex);

  // Las cuentas que ya existían se consideran verificadas: la verificación
  // obligatoria aplica solo a los registros nuevos.
  await knex('usuarios')
    .whereNull('correo_verificado_en')
    .whereNotNull('correo')
    .update({ correo_verificado_en: knex.fn.now(3) });

  // Vínculos ya declarados en usuarios.clave_id.
  await knex.raw(`
    INSERT IGNORE INTO clave_acceso_cuentas (clave_id, usuario_id, activada_en)
    SELECT u.clave_id, u.id, u.clave_activada_en
    FROM usuarios u
    INNER JOIN claves_acceso c ON c.id = u.clave_id
    WHERE u.clave_id IS NOT NULL
  `);

  // Vínculos históricos: una cuenta que ya usó una clave generada queda
  // vinculada para no volver a pedirla en cada inicio de sesión.
  await knex.raw(`
    INSERT IGNORE INTO clave_acceso_cuentas (clave_id, usuario_id, activada_en)
    SELECT cu.clave_id, cu.usuario_id, MIN(cu.creado_en)
    FROM clave_acceso_usos cu
    INNER JOIN usuarios u ON u.id = cu.usuario_id
    WHERE cu.usuario_id IS NOT NULL
    GROUP BY cu.clave_id, cu.usuario_id
  `);

  // Si la cuenta nunca tuvo clave propia, se adopta la última clave usada.
  await knex.raw(`
    UPDATE usuarios u
    INNER JOIN (
      SELECT cu.usuario_id, cu.clave_id
      FROM clave_acceso_usos cu
      INNER JOIN (
        SELECT usuario_id, MAX(creado_en) AS ultima
        FROM clave_acceso_usos
        WHERE usuario_id IS NOT NULL
        GROUP BY usuario_id
      ) m ON m.usuario_id = cu.usuario_id AND m.ultima = cu.creado_en
    ) x ON x.usuario_id = u.id
    INNER JOIN claves_acceso c ON c.id = x.clave_id
    SET u.clave_id = x.clave_id,
        u.clave_activada_en = COALESCE(
          u.clave_activada_en,
          (SELECT MIN(cu2.creado_en) FROM clave_acceso_usos cu2
            WHERE cu2.usuario_id = u.id AND cu2.clave_id = x.clave_id)
        ),
        u.clave_vigente_hasta = COALESCE(
          u.clave_vigente_hasta,
          c.expira_en,
          DATE_ADD(
            (SELECT MIN(cu2.creado_en) FROM clave_acceso_usos cu2
              WHERE cu2.usuario_id = u.id AND cu2.clave_id = x.clave_id),
            INTERVAL 1 YEAR
          )
        )
    WHERE u.clave_id IS NULL
  `);

  // Las cuentas con clave pasan a exigirla; las legadas sin clave conservan
  // el respaldo geoestadístico.
  await knex.raw(`
    UPDATE usuarios
    SET clave_obligatoria = 1
    WHERE clave_id IS NOT NULL
  `);

  // `usos` deja de significar «logins» y pasa a significar «cuentas activas
  // vinculadas».
  await knex.raw(`
    UPDATE claves_acceso c
    SET usos = (
      SELECT COUNT(*)
      FROM clave_acceso_cuentas cac
      INNER JOIN usuarios u ON u.id = cac.usuario_id
      WHERE cac.clave_id = c.id AND u.activo = 1
    )
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('solicitudes_renovacion_clave');
  await knex.schema.dropTableIfExists('tokens_cuenta');

  for (const [tabla, columna, indice] of [
    ['usuarios', 'creado_en', null],
    ['usuarios', 'clave_obligatoria', null],
    ['usuarios', 'suspendido_origen', null],
    ['usuarios', 'correo_verificado_en', null],
    ['usuarios', 'correo_verificado', null],
    ['solicitudes_acceso', 'clave_id', null],
    ['solicitudes_usuario', 'clave_id', null]
  ]) {
    if (await knex.schema.hasColumn(tabla, columna)) {
      if (indice && (await indiceExiste(knex, tabla, indice))) {
        await knex.raw(`ALTER TABLE ${tabla} DROP INDEX ${indice}`);
      }
      await knex.raw(`ALTER TABLE ${tabla} DROP COLUMN ${columna}`);
    }
  }

  for (const [tabla, indice] of [
    ['usuarios', 'usuarios_clave_obligatoria_idx'],
    ['solicitudes_acceso', 'solicitud_acceso_clave_idx'],
    ['solicitudes_usuario', 'solicitud_usuario_clave_idx']
  ]) {
    if (await indiceExiste(knex, tabla, indice)) {
      await knex.raw(`ALTER TABLE ${tabla} DROP INDEX ${indice}`);
    }
  }
}

async function agregarColumnas(knex, tabla, columnas) {
  for (const [columna, tipo] of columnas) {
    if (!(await knex.schema.hasColumn(tabla, columna))) {
      await knex.raw(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
    }
  }
}

async function crearIndices(knex) {
  for (const [tabla, indice, columnas] of [
    ['usuarios', 'usuarios_clave_obligatoria_idx', 'clave_obligatoria'],
    ['solicitudes_acceso', 'solicitud_acceso_clave_idx', 'clave_id'],
    ['solicitudes_usuario', 'solicitud_usuario_clave_idx', 'clave_id']
  ]) {
    if (!(await indiceExiste(knex, tabla, indice))) {
      await knex.raw(`ALTER TABLE ${tabla} ADD INDEX ${indice} (${columnas})`);
    }
  }
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

async function indiceExiste(knex, tabla, indice) {
  try {
    const filas = await knex('information_schema.STATISTICS')
      .select('INDEX_NAME')
      .where({
        TABLE_SCHEMA: knex.client.config.connection.database,
        TABLE_NAME: tabla,
        INDEX_NAME: indice
      })
      .limit(1);
    return filas.length > 0;
  } catch {
    return false;
  }
}
