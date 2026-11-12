import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app.js';
import clienteRepository from '../src/repositories/clienteRepository.js';
import usuarioRepository from '../src/repositories/usuarioRepository.js';
import citasPagoService from '../src/services/citasPagoService.js';

const citaId = '00000000-0000-4000-8000-000000000010';
const jwtSecret = 'jwt-secret-ficticio-para-pruebas-http';

const createToken = () => jwt.sign(
  { id: 21, correo: 'cliente.http@ladybarber.test', rol: 'CLIENTE' },
  jwtSecret,
  { expiresIn: '5m' }
);

const mockAuthenticatedClient = (testContext) => {
  testContext.mock.method(usuarioRepository, 'findById', async () => ({
    id: 21,
    rol: 'CLIENTE',
    estaActivo: 1,
  }));
  testContext.mock.method(clienteRepository, 'findByUsuarioId', async () => ({ id: 7 }));
};

describe('Rutas HTTP de pagos de citas', () => {
  it('protege la creacion de preferencias cuando no existe una sesion', async () => {
    const response = await request(app)
      .post(`/api/citas/${citaId}/pago/preferencia`)
      .send();

    assert.equal(response.status, 401);
    assert.match(response.body.error, /token/i);
  });

  it('crea una preferencia para el cliente autenticado y conserva el contrato HTTP', async (t) => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = jwtSecret;
    t.after(() => {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    });
    mockAuthenticatedClient(t);

    const calls = [];
    t.mock.method(citasPagoService, 'createPreference', async (...args) => {
      calls.push(args);
      return {
        preferenceId: 'pref-http-ci',
        checkoutUrl: 'https://www.mercadopago.com.mx/checkout/test',
        amount: 225.5,
        currency: 'MXN',
      };
    });

    const response = await request(app)
      .post(`/api/citas/${citaId}/pago/preferencia`)
      .set('Authorization', `Bearer ${createToken()}`)
      .send();

    assert.equal(response.status, 201);
    assert.deepEqual(response.body, {
      preferenceId: 'pref-http-ci',
      checkoutUrl: 'https://www.mercadopago.com.mx/checkout/test',
      amount: 225.5,
      currency: 'MXN',
    });
    assert.deepEqual(calls, [[citaId, 7]]);
  });

  it('consulta el estado de pago exclusivamente para el cliente autenticado', async (t) => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = jwtSecret;
    t.after(() => {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    });
    mockAuthenticatedClient(t);

    const calls = [];
    t.mock.method(citasPagoService, 'getPaymentStatus', async (...args) => {
      calls.push(args);
      return { status: 'approved', confirmed: true };
    });

    const response = await request(app)
      .get(`/api/citas/${citaId}/pago/estado`)
      .set('Authorization', `Bearer ${createToken()}`);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'approved', confirmed: true });
    assert.deepEqual(calls, [[citaId, 7]]);
  });

  it('rechaza notificaciones sin identificador antes de procesar el webhook', async (t) => {
    let calls = 0;
    t.mock.method(citasPagoService, 'processWebhook', async () => {
      calls += 1;
    });

    const response = await request(app)
      .post('/api/pagos/mercadopago/webhook')
      .send({ type: 'payment' });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /identificador/i);
    assert.equal(calls, 0);
  });

  it('entrega al servicio los encabezados de autenticidad y responde 200', async (t) => {
    const received = [];
    t.mock.method(citasPagoService, 'processWebhook', async (payload) => {
      received.push(payload);
      return { confirmed: true };
    });

    const response = await request(app)
      .post('/api/pagos/mercadopago/webhook')
      .query({ type: 'payment', 'data.id': '987654321' })
      .set('x-signature', 'ts=1700000000,v1=firma-ficticia')
      .set('x-request-id', 'request-http-ci')
      .send({ action: 'payment.updated' });

    assert.equal(response.status, 200);
    assert.deepEqual(received, [{
      signature: 'ts=1700000000,v1=firma-ficticia',
      requestId: 'request-http-ci',
      dataId: '987654321',
      type: 'payment',
    }]);
  });

  it('propaga el rechazo de una firma invalida sin ocultar el estado HTTP', async (t) => {
    t.mock.method(citasPagoService, 'processWebhook', async () => {
      throw Object.assign(new Error('Firma de webhook invalida'), { statusCode: 401 });
    });

    const response = await request(app)
      .post('/api/pagos/mercadopago/webhook')
      .query({ type: 'payment', 'data.id': '987654321' })
      .set('x-signature', 'ts=1,v1=00')
      .set('x-request-id', 'request-http-ci')
      .send();

    assert.equal(response.status, 401);
    assert.equal(response.body.status, 'error');
    assert.match(response.body.message, /firma/i);
  });

  it('publica retornos informativos y rechaza estados desconocidos', async () => {
    const approved = await request(app).get('/api/pagos/mercadopago/retorno/aprobado');
    const unknown = await request(app).get('/api/pagos/mercadopago/retorno/desconocido');

    assert.equal(approved.status, 200);
    assert.match(approved.headers['content-type'], /text\/html/);
    assert.match(approved.text, /Pago aprobado/);
    assert.equal(unknown.status, 404);
  });
});
