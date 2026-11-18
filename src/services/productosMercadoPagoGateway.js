import gateway from './mercadoPagoGateway.js';

/** Reutiliza autenticación y manejo de errores sin cambiar las llamadas de citas. */
export class ProductosMercadoPagoGateway {
  constructor(base = gateway) { this.base = base; }
  crearPreferencia(body, key) {
    return this.base.request('/checkout/preferences', { method: 'POST', body: JSON.stringify(body),
      headers: { 'X-Idempotency-Key': key }, signal: AbortSignal.timeout(15000) });
  }
  obtenerPreferencia(id) { return this.base.request(`/checkout/preferences/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15000) }); }
  obtenerPago(id) { return this.base.request(`/v1/payments/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15000) }); }
  buscarPagos(referencia) {
    return this.base.request(`/v1/payments/search?${new URLSearchParams({ external_reference: referencia, sort: 'date_created', criteria: 'desc', limit: '30' })}`, { signal: AbortSignal.timeout(15000) });
  }
}
export default new ProductosMercadoPagoGateway();
