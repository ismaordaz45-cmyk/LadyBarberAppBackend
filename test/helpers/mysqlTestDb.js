import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const TEST_DATABASE_NAME = 'lady_barber_test';
const TEST_ENVIRONMENT_CONFIRMATION = 'lady_barber_test_ephemeral_only';
const SAFE_TEST_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const schemaUrl = new URL('../fixtures/auth.mysql.sql', import.meta.url);

export const getSafeTestDatabaseConfig = () => {
  const database = String(process.env.DB_NAME || '').trim();
  const host = String(process.env.DB_HOST || '').trim().toLowerCase();
  const user = String(process.env.DB_USER || '').trim();
  const password = process.env.DB_PASSWORD;
  const port = Number(process.env.DB_PORT || 3306);

  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Integración MySQL bloqueada: NODE_ENV debe ser test');
  }

  if (process.env.INTEGRATION_DB_CONFIRMATION !== TEST_ENVIRONMENT_CONFIRMATION) {
    throw new Error('Integración MySQL bloqueada: falta la confirmación de entorno desechable');
  }

  if (database !== TEST_DATABASE_NAME) {
    throw new Error(
      `Integración MySQL bloqueada: DB_NAME debe ser exactamente ${TEST_DATABASE_NAME}`
    );
  }

  if (!SAFE_TEST_HOSTS.has(host)) {
    throw new Error('Integración MySQL bloqueada: DB_HOST debe ser un host local o aislado');
  }

  if (!user || user.toLowerCase() === 'root' || password === undefined || password === '') {
    throw new Error('Integración MySQL bloqueada: faltan credenciales exclusivas de prueba');
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Integración MySQL bloqueada: DB_PORT no es válido');
  }

  return { host, port, user, password, database };
};

const withTestConnection = async (callback, options = {}) => {
  const connection = await mysql.createConnection({
    ...options,
    ...getSafeTestDatabaseConfig(),
  });

  try {
    const [databaseRows] = await connection.query('SELECT DATABASE() AS databaseName');
    if (databaseRows[0]?.databaseName !== TEST_DATABASE_NAME) {
      throw new Error('Integración MySQL bloqueada: la conexión no seleccionó la base autorizada');
    }

    return await callback(connection);
  } finally {
    await connection.end();
  }
};

export const initializeTestDatabase = async () => {
  const schemaSql = await readFile(fileURLToPath(schemaUrl), 'utf8');

  await withTestConnection(async (connection) => {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      await connection.query('DROP TABLE IF EXISTS cliente');
      await connection.query('DROP TABLE IF EXISTS usuario');
      await connection.query(schemaSql);
    } finally {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  }, { multipleStatements: true });
};

export const cleanupAuthTestData = async () => {
  await withTestConnection(async (connection) => {
    await connection.query('DELETE FROM cliente');
    await connection.query('DELETE FROM usuario');
    await connection.query('ALTER TABLE cliente AUTO_INCREMENT = 1');
    await connection.query('ALTER TABLE usuario AUTO_INCREMENT = 1');
  });
};

export const countAuthTestRows = async () => {
  return withTestConnection(async (connection) => {
    const [rows] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM usuario) AS usuarios,
        (SELECT COUNT(*) FROM cliente) AS clientes
    `);

    return {
      usuarios: Number(rows[0].usuarios),
      clientes: Number(rows[0].clientes),
    };
  });
};
