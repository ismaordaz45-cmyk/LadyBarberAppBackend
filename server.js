import dotenv from 'dotenv';
import app from './src/app.js';
import { closePool, testConnection } from './src/config/database.js';
import { createServerConfig } from './src/config/server.js';

// Cargar variables de entorno desde .env
dotenv.config();

const { host: HOST, port: PORT } = createServerConfig();

// Iniciar servidor HTTP
const server = app.listen(PORT, HOST, async () => {
  console.log(`===============================================`);
  console.log(` Servidor Lady Barber iniciado`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Health Check: http://localhost:${PORT}/api/health`);
  console.log(`===============================================`);

  // Verificación no bloqueante de la conexión con MySQL
  try {
    await testConnection();
    console.log('[MySQL] Conexión con la base de datos establecida correctamente.');
  } catch (error) {
    console.warn('[MySQL] Advertencia: No se pudo conectar a MySQL:', error.message);
    console.warn('[MySQL] Verifica tus credenciales en el archivo .env y que el servicio de MySQL esté iniciado.');
  }
});

// Manejo de señales de cierre seguro
let shuttingDown = false;

const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Señal ${signal} recibida. Cerrando servidor...`);

  server.close(async (serverError) => {
    try {
      await closePool();
      console.log('Pool MySQL cerrado correctamente.');
    } catch (databaseError) {
      console.error('Error al cerrar el pool MySQL:', databaseError.message);
      process.exitCode = 1;
    }

    if (serverError) {
      console.error('Error al cerrar el servidor HTTP:', serverError.message);
      process.exitCode = 1;
    }

    console.log('Servidor finalizado.');
  });
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
