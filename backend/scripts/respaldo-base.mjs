/**
 * Respaldo físico de la base MySQL/MariaDB actual.
 *
 * Crea una base de datos hermana con la fecha/hora en el nombre y copia todas
 * las tablas con CREATE TABLE ... LIKE + INSERT ... SELECT. No requiere
 * mariadb-dump ni mysqldump, que no siempre están instalados en Windows.
 *
 * Uso:
 *   node scripts/respaldo-base.mjs
 *   node scripts/respaldo-base.mjs --nombre=incidencias_antes_firmas
 */
import mysql from 'mysql2/promise';
import { config } from '../src/config/index.js';

function argumento(nombre) {
  const prefijo = `--${nombre}=`;
  const encontrado = process.argv.find((valor) => valor.startsWith(prefijo));
  return encontrado ? encontrado.slice(prefijo.length) : null;
}

function marcaDeTiempo() {
  const ahora = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return [
    ahora.getFullYear(),
    dos(ahora.getMonth() + 1),
    dos(ahora.getDate()),
    '_',
    dos(ahora.getHours()),
    dos(ahora.getMinutes()),
    dos(ahora.getSeconds())
  ].join('');
}

async function main() {
  const conexionBase = config.db.connection;
  const origen = conexionBase.database;
  const destino = argumento('nombre') || `${origen}_backup_${marcaDeTiempo()}`;

  const conexion = await mysql.createConnection({
    host: conexionBase.host,
    port: conexionBase.port,
    user: conexionBase.user,
    password: conexionBase.password,
    multipleStatements: true
  });

  try {
    await conexion.query(
      `CREATE DATABASE IF NOT EXISTS \`${destino}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

    const [tablas] = await conexion.query(
      `SELECT TABLE_NAME AS tabla
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME`,
      [origen]
    );

    await conexion.query('SET FOREIGN_KEY_CHECKS = 0');

    let filasTotales = 0;
    for (const { tabla } of tablas) {
      await conexion.query(`CREATE TABLE IF NOT EXISTS \`${destino}\`.\`${tabla}\` LIKE \`${origen}\`.\`${tabla}\``);
      await conexion.query(`DELETE FROM \`${destino}\`.\`${tabla}\``);
      const [resultado] = await conexion.query(
        `INSERT INTO \`${destino}\`.\`${tabla}\` SELECT * FROM \`${origen}\`.\`${tabla}\``
      );
      filasTotales += resultado.affectedRows || 0;
      console.log(`  · ${tabla}: ${resultado.affectedRows || 0} filas`);
    }

    await conexion.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`\nRespaldo creado: ${destino}`);
    console.log(`Tablas: ${tablas.length} · Filas: ${filasTotales}`);
    console.log('Para restaurar desde este respaldo se puede usar la interfaz de Respaldos o copiar las tablas de vuelta.');
  } finally {
    await conexion.end();
  }
}

main().catch((error) => {
  console.error('[respaldo] error:', error.message);
  process.exitCode = 1;
});
