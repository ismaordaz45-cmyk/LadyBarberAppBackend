import { createMercadoPagoConfig } from '../config/mercadoPago.js';
import citasPagoRepository from '../repositories/citasPagoRepository.js';
import mercadoPagoGateway from './mercadoPagoGateway.js';
import { verifyMercadoPagoSignature } from './mercadoPagoSignature.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const paymentError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const sanitizePayment = (payment) => ({
  id: String(payment.id),
  status: String(payment.status || 'unknown'),
  status_detail: payment.status_detail || null,
  payment_method_id: payment.payment_method_id || null,
  payment_type_id: payment.payment_type_id || null,
  date_approved: payment.date_approved || null,
  transaction_amount: Number(payment.transaction_amount),
  currency_id: payment.currency_id,
  external_reference: payment.external_reference,
});

export class CitasPagoService {
  constructor(repository = citasPagoRepository, gateway = mercadoPagoGateway, configFactory = createMercadoPagoConfig) {
    this.repository = repository;
    this.gateway = gateway;
    this.configFactory = configFactory;
  }

  validateCitaId(citaId) {
    if (!UUID_PATTERN.test(String(citaId || ''))) throw paymentError(400, 'ID de cita inválido');
    return String(citaId);
  }

  async createPreference(citaId, clienteId) {
    const id = this.validateCitaId(citaId);
    const cita = await this.repository.getAppointmentForPayment(id, clienteId);
    if (!cita) throw paymentError(404, 'Cita no encontrada');
    if (cita.estado !== 'APARTADA') throw paymentError(409, 'La cita no admite un nuevo anticipo');
    if (Date.now() - new Date(cita.creadoEn).getTime() >= 30 * 60 * 1000) {
      throw paymentError(409, 'El plazo para pagar la cita venció');
    }

    const total = Number(cita.precioFinal);
    if (!Number.isFinite(total) || total <= 0) throw paymentError(409, 'La cita no tiene un importe válido');
    const deposit = Math.round(total * 50) / 100;
    const { publicBackendUrl } = this.configFactory();
    const preference = await this.gateway.createPreference({
      items: [{ id, title: 'Anticipo 50% - cita LadyBarber', quantity: 1, currency_id: 'MXN', unit_price: deposit }],
      payer: cita.correo ? { email: cita.correo } : undefined,
      external_reference: `cita:${id}`,
      notification_url: `${publicBackendUrl}/api/pagos/mercadopago/webhook`,
      back_urls: {
        success: `${publicBackendUrl}/api/pagos/mercadopago/retorno/aprobado`,
        pending: `${publicBackendUrl}/api/pagos/mercadopago/retorno/pendiente`,
        failure: `${publicBackendUrl}/api/pagos/mercadopago/retorno/fallido`,
      },
      auto_return: 'approved',
      metadata: { cita_id: id },
    }, `cita-${id}`);

    if (!preference?.id || !preference?.init_point) {
      throw paymentError(502, 'Mercado Pago no devolvió una preferencia válida');
    }
    await this.repository.savePreference(id, clienteId, preference.id);
    return { preferenceId: preference.id, checkoutUrl: preference.init_point, amount: deposit, currency: 'MXN' };
  }

  async getPaymentStatus(citaId, clienteId) {
    const result = await this.repository.getPaymentStatus(this.validateCitaId(citaId), clienteId);
    if (!result) throw paymentError(404, 'Cita no encontrada');
    return result;
  }

  async processWebhook({ signature, requestId, dataId, type }) {
    const config = this.configFactory();
    verifyMercadoPagoSignature({ signature, requestId, dataId, secret: config.webhookSecret });
    if (type && type !== 'payment') return { ignored: true };

    const response = await this.gateway.getPayment(dataId);
    if (String(response.id) !== String(dataId)) throw paymentError(409, 'El pago consultado no coincide');
    const match = /^cita:([0-9a-f-]{36})$/i.exec(String(response.external_reference || ''));
    if (!match || !UUID_PATTERN.test(match[1])) throw paymentError(409, 'Referencia de pago inválida');
    const safe = sanitizePayment(response);
    if (!Number.isFinite(safe.transaction_amount)) throw paymentError(409, 'Importe de pago inválido');

    return this.repository.applyVerifiedPayment({
      citaId: match[1],
      preferenceId: response.preference_id || null,
      id: safe.id,
      amount: safe.transaction_amount,
      currency: safe.currency_id,
      status: safe.status,
      statusDetail: safe.status_detail,
      paymentMethod: safe.payment_method_id,
      paymentType: safe.payment_type_id,
      approvedAt: safe.date_approved ? new Date(safe.date_approved) : null,
      rawData: safe,
    });
  }
}

export default new CitasPagoService();
