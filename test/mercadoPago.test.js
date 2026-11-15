import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMercadoPagoConfig } from '../src/config/mercadoPago.js';
import { CitasPagoService } from '../src/services/citasPagoService.js';
import { MercadoPagoGateway } from '../src/services/mercadoPagoGateway.js';
import { verifyMercadoPagoSignature } from '../src/services/mercadoPagoSignature.js';

const citaId = '00000000-0000-4000-8000-000000000010';
const clienteId = 7;
const secret = 'webhook-secret-de-prueba';

const sign = ({ dataId = '987654321', requestId = 'request-ci', ts = '1700000000' } = {}) => {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const digest = createHmac('sha256', secret).update(manifest).digest('hex');
  return { dataId, requestId, signature: `ts=${ts},v1=${digest}` };
};

describe('Configuracion de Mercado Pago', () => {
  it('acepta exclusivamente variables completas y una URL publica HTTPS segura', () => {
    assert.deepEqual(createMercadoPagoConfig({
      MP_ACCESS_TOKEN: 'token-ficticio',
      MP_WEBHOOK_SECRET: secret,
      PUBLIC_BACKEND_URL: 'https://backend.example.test/',
    }), {
      accessToken: 'token-ficticio',
      webhookSecret: secret,
      publicBackendUrl: 'https://backend.example.test',
    });

    assert.throws(() => createMercadoPagoConfig({}), /MP_ACCESS_TOKEN/);
    assert.throws(() => createMercadoPagoConfig({
      MP_ACCESS_TOKEN: 'x', MP_WEBHOOK_SECRET: 'y', PUBLIC_BACKEND_URL: 'http://localhost:3000',
    }), /HTTPS/);
    assert.throws(() => createMercadoPagoConfig({
      MP_ACCESS_TOKEN: 'x', MP_WEBHOOK_SECRET: 'y', PUBLIC_BACKEND_URL: 'https://user:pass@example.test/api',
    }), /credenciales/);
  });
});

describe('Firma de webhooks de Mercado Pago', () => {
  it('acepta una firma HMAC valida y rechaza firmas alteradas', () => {
    const signed = sign();
    assert.equal(verifyMercadoPagoSignature({ ...signed, secret }), true);
    assert.throws(
      () => verifyMercadoPagoSignature({ ...signed, signature: signed.signature.replace(/.$/, '0'), secret }),
      (error) => error.statusCode === 401
    );
  });
});

describe('Pago del anticipo de citas', () => {
  it('calcula el 50 por ciento en el servidor y crea una preferencia para la cita propia', async () => {
    const saved = [];
    const gatewayCalls = [];
    const repository = {
      getAppointmentForPayment: async (id, owner) => ({
        id, clienteId: owner, estado: 'APARTADA', precioFinal: 451,
        creadoEn: new Date(), correo: 'cliente@example.test',
      }),
      savePreference: async (...args) => saved.push(args),
    };
    const gateway = {
      createPreference: async (...args) => {
        gatewayCalls.push(args);
        return { id: 'pref-ci', init_point: 'https://www.mercadopago.com.mx/checkout/test' };
      },
    };
    const service = new CitasPagoService(repository, gateway, () => ({
      publicBackendUrl: 'https://backend.example.test', webhookSecret: secret,
    }));

    const result = await service.createPreference(citaId, clienteId);
    assert.deepEqual(result, {
      preferenceId: 'pref-ci',
      checkoutUrl: 'https://www.mercadopago.com.mx/checkout/test',
      amount: 225.5,
      currency: 'MXN',
    });
    assert.equal(gatewayCalls[0][0].items[0].unit_price, 225.5);
    assert.equal(gatewayCalls[0][0].external_reference, `cita:${citaId}`);
    assert.match(gatewayCalls[0][0].notification_url, /^https:/);
    assert.deepEqual(saved, [[citaId, clienteId, 'pref-ci']]);
  });

  it('rechaza citas ajenas, inexistentes o vencidas sin invocar Mercado Pago', async () => {
    let gatewayCalls = 0;
    const gateway = { createPreference: async () => { gatewayCalls += 1; } };
    const missing = new CitasPagoService(
      { getAppointmentForPayment: async () => null }, gateway,
      () => ({ publicBackendUrl: 'https://backend.example.test' })
    );
    await assert.rejects(() => missing.createPreference(citaId, clienteId), (error) => error.statusCode === 404);

    const expired = new CitasPagoService(
      { getAppointmentForPayment: async () => ({
        estado: 'APARTADA', precioFinal: 200, creadoEn: new Date(Date.now() - 31 * 60 * 1000),
      }) }, gateway, () => ({ publicBackendUrl: 'https://backend.example.test' })
    );
    await assert.rejects(() => expired.createPreference(citaId, clienteId), (error) => error.statusCode === 409);
    assert.equal(gatewayCalls, 0);
  });

  it('valida la firma antes de consultar y persiste solo datos verificados del pago', async () => {
    const applied = [];
    const repository = { applyVerifiedPayment: async (payment) => { applied.push(payment); return { confirmed: true, status: 'approved' }; } };
    const gateway = { getPayment: async () => ({
      id: 987654321,
      status: 'approved',
      status_detail: 'accredited',
      payment_method_id: 'visa',
      payment_type_id: 'credit_card',
      date_approved: '2026-11-11T12:00:00.000Z',
      transaction_amount: 100,
      currency_id: 'MXN',
      external_reference: `cita:${citaId}`,
      preference_id: 'pref-ci',
      payer: { email: 'dato-que-no-debe-persistirse@example.test' },
    }) };
    const service = new CitasPagoService(repository, gateway, () => ({ webhookSecret: secret }));

    const result = await service.processWebhook({ ...sign(), type: 'payment' });
    assert.deepEqual(result, { confirmed: true, status: 'approved' });
    assert.equal(applied[0].citaId, citaId);
    assert.equal(applied[0].amount, 100);
    assert.equal(applied[0].rawData.payer, undefined);
    assert.equal(applied[0].rawData.status, 'approved');
  });

  it('no consulta Mercado Pago cuando la firma es invalida', async () => {
    let gatewayCalls = 0;
    const service = new CitasPagoService(
      { applyVerifiedPayment: async () => undefined },
      { getPayment: async () => { gatewayCalls += 1; } },
      () => ({ webhookSecret: secret })
    );
    await assert.rejects(
      () => service.processWebhook({ dataId: '1', requestId: 'req', signature: 'ts=1,v1=00', type: 'payment' }),
      (error) => error.statusCode === 401
    );
    assert.equal(gatewayCalls, 0);
  });
});

describe('Cliente HTTP de Mercado Pago', () => {
  it('usa autenticacion Bearer e idempotencia sin realizar trafico real', async () => {
    const calls = [];
    const fakeFetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ id: 'pref-ci', init_point: 'https://checkout.example.test' }) };
    };
    const gateway = new MercadoPagoGateway(fakeFetch, () => ({ accessToken: 'token-ficticio' }));
    await gateway.createPreference({ items: [] }, 'idempotency-ci');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer token-ficticio');
    assert.equal(calls[0].options.headers['X-Idempotency-Key'], 'idempotency-ci');
    assert.equal(calls[0].options.method, 'POST');
  });
});
