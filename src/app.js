import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import errorHandler from './middlewares/errorHandler.js';

const app = express();

// Middlewares globales técnicos
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas base de la API REST
app.use('/api', routes);

// Manejador para rutas no encontradas (404)
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
});

// Middleware global de manejo de errores
app.use(errorHandler);

export default app;
