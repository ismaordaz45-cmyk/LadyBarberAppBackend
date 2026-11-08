import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { getSafeTestDatabaseConfig } from './mysqlTestDb.js';
import {
  dropCitasTestDatabaseObjects,
  resetCitasTestDatabase,
} from './citasTestDb.js';

const schemaUrl = new URL('../fixtures/cuenta.mysql.sql', import.meta.url);
const extraTables = ['ventas_online', 'tokens_temporales'];

const withConnection = async (callback, options = {}) => {
  const connection = await mysql.createConnection({
    ...getSafeTestDatabaseConfig(),
    ...options,
  });
  try {
    return await callback(connection);
  } finally {
    await connection.end();
  }
};

const dropExtraTables = async () => {
  await withConnection(async (connection) => {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const table of extraTables) {
        await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
      }
    } finally {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  });
};

export const resetCuentaTestDatabase = async () => {
  await dropExtraTables();
  await resetCitasTestDatabase();
  const schema = await readFile(fileURLToPath(schemaUrl), 'utf8');
  await withConnection(
    (connection) => connection.query(schema),
    { multipleStatements: true }
  );
};

export const dropCuentaTestDatabaseObjects = async () => {
  await dropExtraTables();
  await dropCitasTestDatabaseObjects();
};
