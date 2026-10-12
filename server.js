import dotenv from 'dotenv';
import app from './src/app.js';
import { testConnection } from './src/config/database.js';

// Cargar variables de entorno desde .env
dotenv.config();

const PORT = process.env.PORT || 3000;

// Iniciar servidor HTTP
const server = app.listen(PORT, async () => {
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
process.on('SIGTERM', () => {
  console.log('Señal SIGTERM recibida. Cerrando servidor...');
  server.close(() => {
    console.log('Servidor finalizado.');
    process.exit(0);
  });
});
