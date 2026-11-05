import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { getSafeTestDatabaseConfig } from './mysqlTestDb.js';

const schemaUrl = new URL('../fixtures/citas.mysql.sql', import.meta.url);
const dropOrder = [
  'citaservicio', 'cita', 'empleada_servicio', 'horario_negocio',
  'insumo', 'servicio', 'empleada', 'cliente', 'usuario',
];

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

export const resetCitasTestDatabase = async () => {
  const schema = await readFile(fileURLToPath(schemaUrl), 'utf8');
  await withConnection(async (connection) => {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const table of dropOrder) {
        await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
      }
      await connection.query(schema);
    } finally {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  }, { multipleStatements: true });
};

export const dropCitasTestDatabaseObjects = async () => {
  await withConnection(async (connection) => {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const table of dropOrder) {
        await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
      }
    } finally {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  });
};
