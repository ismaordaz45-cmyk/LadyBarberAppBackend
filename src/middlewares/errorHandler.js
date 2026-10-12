/**
 * Middleware global para captura y manejo centralizado de errores en Express.
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;

  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message || err);

  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Error interno del servidor',
  });
};

export default errorHandler;
