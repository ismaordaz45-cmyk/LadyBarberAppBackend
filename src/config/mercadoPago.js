const requireValue = (env, name) => {
  const value = String(env[name] || '').trim();
  if (!value) {
    const error = new Error(`Falta configurar ${name}`);
    error.statusCode = 503;
    throw error;
  }
  return value;
};

const parsePublicBackendUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Object.assign(new Error('PUBLIC_BACKEND_URL no es una URL válida'), { statusCode: 503 });
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw Object.assign(
      new Error('PUBLIC_BACKEND_URL debe usar HTTPS y no incluir credenciales, query ni fragmento'),
      { statusCode: 503 }
    );
  }

  return url.toString().replace(/\/$/, '');
};

export const createMercadoPagoConfig = (env = process.env) => ({
  accessToken: requireValue(env, 'MP_ACCESS_TOKEN'),
  webhookSecret: requireValue(env, 'MP_WEBHOOK_SECRET'),
  publicBackendUrl: parsePublicBackendUrl(requireValue(env, 'PUBLIC_BACKEND_URL')),
});
