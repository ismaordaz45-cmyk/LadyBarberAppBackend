export const SERVER_HOST = '0.0.0.0';

export const createServerConfig = (env = process.env) => {
  const port = Number(env.PORT || 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un puerto TCP válido');
  }

  if (env.NODE_ENV === 'production' && !env.JWT_SECRET?.trim()) {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }

  return {
    host: SERVER_HOST,
    port,
  };
};
