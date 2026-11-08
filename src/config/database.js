import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const parsePort = (value, fallback) => {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT debe ser un puerto TCP válido');
  }
  return port;
};

const parseTlsEnabled = (value) => {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('DB_SSL debe ser exactamente true o false');
};

const normalizeCertificate = (certificate) => certificate
  .replace(/\\n/g, '\n')
  .trim();

const readCertificateAuthority = (env) => {
  const rawCertificate = env.DB_SSL_CA?.trim();
  const encodedCertificate = env.DB_SSL_CA_BASE64?.trim();

  if (rawCertificate && encodedCertificate) {
    throw new Error('Configura solo una de DB_SSL_CA o DB_SSL_CA_BASE64');
  }

  // Los proveedores con certificados emitidos por una CA pública pueden
  // verificarse con el almacén de confianza de Node.js.
  if (!rawCertificate && !encodedCertificate) {
    return undefined;
  }

  let certificate = rawCertificate;
  if (encodedCertificate) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedCertificate) || encodedCertificate.length % 4 !== 0) {
      throw new Error('DB_SSL_CA_BASE64 no contiene Base64 válido');
    }
    certificate = Buffer.from(encodedCertificate, 'base64').toString('utf8');
  }

  certificate = normalizeCertificate(certificate);
  if (!certificate.includes('-----BEGIN CERTIFICATE-----') || !certificate.includes('-----END CERTIFICATE-----')) {
    throw new Error('La autoridad certificadora MySQL no tiene formato PEM válido');
  }

  return certificate;
};

/**
 * Construye las opciones del pool sin abrir conexiones. La verificación del
 * certificado no se puede desactivar cuando TLS está habilitado.
 */
export const createDatabaseConfig = (env = process.env) => {
  const tlsEnabled = parseTlsEnabled(env.DB_SSL);

  if (env.NODE_ENV === 'production') {
    const requiredVariables = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    const missingVariables = requiredVariables.filter((name) => !env[name]?.trim());
    if (missingVariables.length > 0) {
      throw new Error(`Faltan variables MySQL de producción: ${missingVariables.join(', ')}`);
    }
    if (!tlsEnabled) {
      throw new Error('DB_SSL=true es obligatorio en producción');
    }
  }

  const config = {
    host: env.DB_HOST || 'localhost',
    port: parsePort(env.DB_PORT, 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'lady_barber_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };

  if (tlsEnabled) {
    config.ssl = {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    };
    const certificateAuthority = readCertificateAuthority(env);
    if (certificateAuthority) {
      config.ssl.ca = certificateAuthority;
    }
  }

  return config;
};

/**
 * Clase Singleton para gestionar la instancia única del Pool de conexiones MySQL.
 */
class Database {
  constructor() {
    if (!Database.instance) {
      this.pool = mysql.createPool(createDatabaseConfig());

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
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
  return true;
};

export const closePool = async () => {
  await pool.end();
};

export default pool;
export { databaseInstance };
