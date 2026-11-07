/**
 * Reparaciones de campo y desglose de costos.
 *
 * La incidencia conserva el ciclo completo: asignación a una cuadrilla,
 * inicio/fin del trabajo, notas, documentos oficiales y desglose por concepto.
 * El coordinador valida y después resuelve con el costo final.
 */
async function colacionDeUsuarios(knex) {
  try {
    const filas = await knex.raw(
      "SELECT COLLATION_NAME AS colacion FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'id' LIMIT 1",
      [knex.client.config.connection.database]
    );
    return filas?.[0]?.[0]?.colacion || 'utf8mb4_unicode_ci';
  } catch {
    return 'utf8mb4_unicode_ci';
  }
}

async function tieneIndice(knex, tabla, indice) {
  const filas = await knex.raw(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [knex.client.config.connection.database, tabla, indice]
  );
  return Boolean(filas?.[0]?.length);
}

async function tieneForeignKey(knex, tabla, nombre) {
  const filas = await knex.raw(
    'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = ? LIMIT 1',
    [knex.client.config.connection.database, tabla, nombre, 'FOREIGN KEY']
  );
  return Boolean(filas?.[0]?.length);
}

export async function up(knex) {
  const colacion = await colacionDeUsuarios(knex);
  const columnas = [
    ['asignada_a', `VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ${colacion} NULL`],
    ['asignada_nombre', 'VARCHAR(160) NULL'],
    [
      'reparacion_estado',
      "ENUM('sin_asignar','asignada','en_reparacion','terminada','validada') NOT NULL DEFAULT 'sin_asignar'"
    ],
    ['reparacion_notas', 'TEXT NULL'],
    ['asignada_en', 'DATETIME(3) NULL'],
    ['reparacion_iniciada_en', 'DATETIME(3) NULL'],
    ['reparacion_terminada_en', 'DATETIME(3) NULL'],
    ['desglose_costos', 'TEXT NULL'],
    ['documentos_reparacion', 'TEXT NULL']
  ];

  for (const [columna, tipo] of columnas) {
    if (!(await knex.schema.hasColumn('incidencias', columna))) {
      await knex.raw(`ALTER TABLE incidencias ADD COLUMN ${columna} ${tipo}`);
    }
  }

  if (!(await tieneIndice(knex, 'incidencias', 'incidencias_reparacion_estado_idx'))) {
    await knex.raw(
      'ALTER TABLE incidencias ADD INDEX incidencias_reparacion_estado_idx (municipio_id, reparacion_estado)'
    );
  }
  if (!(await tieneIndice(knex, 'incidencias', 'incidencias_asignada_idx'))) {
    await knex.raw('ALTER TABLE incidencias ADD INDEX incidencias_asignada_idx (asignada_a)');
  }
  if (!(await tieneForeignKey(knex, 'incidencias', 'fk_incidencias_asignada_a'))) {
    await knex.raw(
      'ALTER TABLE incidencias ADD CONSTRAINT fk_incidencias_asignada_a FOREIGN KEY (asignada_a) REFERENCES usuarios(id) ON DELETE SET NULL'
    );
  }
}

export async function down(knex) {
  if (await tieneForeignKey(knex, 'incidencias', 'fk_incidencias_asignada_a')) {
    await knex.raw('ALTER TABLE incidencias DROP FOREIGN KEY fk_incidencias_asignada_a');
  }
  if (await tieneIndice(knex, 'incidencias', 'incidencias_asignada_idx')) {
    await knex.raw('ALTER TABLE incidencias DROP INDEX incidencias_asignada_idx');
  }
  if (await tieneIndice(knex, 'incidencias', 'incidencias_reparacion_estado_idx')) {
    await knex.raw('ALTER TABLE incidencias DROP INDEX incidencias_reparacion_estado_idx');
  }
  for (const [columna] of [
    ['asignada_a'],
    ['asignada_nombre'],
    ['reparacion_estado'],
    ['reparacion_notas'],
    ['asignada_en'],
    ['reparacion_iniciada_en'],
    ['reparacion_terminada_en'],
    ['desglose_costos'],
    ['documentos_reparacion']
  ]) {
    if (await knex.schema.hasColumn('incidencias', columna)) {
      await knex.raw(`ALTER TABLE incidencias DROP COLUMN ${columna}`);
    }
  }
}
