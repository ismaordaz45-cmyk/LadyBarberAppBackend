import { createMercadoPagoConfig } from '../config/mercadoPago.js';

const API_URL = 'https://api.mercadopago.com';

export class MercadoPagoGateway {
  constructor(fetchImpl = globalThis.fetch, configFactory = createMercadoPagoConfig) {
    this.fetch = fetchImpl;
    this.configFactory = configFactory;
  }

  async request(path, options = {}) {
    const { accessToken } = this.configFactory();
    let response;
    try {
      response = await this.fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
    } catch {
      throw Object.assign(new Error('No fue posible conectar con Mercado Pago'), { statusCode: 502 });
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw Object.assign(new Error('Mercado Pago devolvió una respuesta inválida'), { statusCode: 502 });
    }
    if (!response.ok) {
      throw Object.assign(new Error('Mercado Pago rechazó la operación'), { statusCode: 502 });
    }
    return data;
  }

  createPreference(body, idempotencyKey) {
    return this.request('/checkout/preferences', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    });
  }

  getPayment(paymentId) {
    return this.request(`/v1/payments/${encodeURIComponent(paymentId)}`);
  }
}

export default new MercadoPagoGateway();
