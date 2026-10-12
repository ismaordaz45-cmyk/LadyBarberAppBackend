import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Clase Singleton para gestionar la instancia única del Pool de conexiones MySQL.
 */
class Database {
  constructor() {
    if (!Database.instance) {
      this.pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'lady_barber_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });

      Database.instance = this;
    }

    return Database.instance;
  }

  /**
   * Retorna la instancia del pool de conexiones.
   */
  getPool() {
    return this.pool;
  }
}

// Creación de la instancia Singleton del Pool
const databaseInstance = new Database();
const pool = databaseInstance.getPool();

/**
 * Función auxiliar para verificar la conexión con MySQL.
 * Obtiene una conexión del pool, envía un ping y la libera de inmediato.
 */
export const testConnection = async () => {
  const connection = await pool.getConnection();
  await connection.ping();
  connection.release();
  return true;
};

export default pool;
export { databaseInstance };
