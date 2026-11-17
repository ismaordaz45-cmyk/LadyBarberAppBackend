import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app.js';
import { CitasService } from '../src/services/citasService.js';
import { CitasRepository } from '../src/repositories/citasRepository.js';
import citasRepository from '../src/repositories/citasRepository.js';
import clienteRepository from '../src/repositories/clienteRepository.js';
import usuarioRepository from '../src/repositories/usuarioRepository.js';

const id = '00000000-0000-4000-8000-000000000010';
const evidencia = { id, precioFinal: '120.00', paymentStatus: 'approved', paymentId: 'pago-test',
  estadoPagoVerificado: 'approved', montoPagado: '60.00', moneda: 'MXN', servicios: [] };

describe('Detalle de cita y comprobante', () => {
  it('calcula los importes desde evidencia verificada y no presume que el estado confirmado acredita pago', async () => {
    const service = new CitasService({ getDetalleByCliente: async () => evidencia });
    const result = await service.obtenerDetalleCliente(id, 7);
    assert.equal(result.comprobanteDisponible, true);
    assert.equal(result.anticipoPagado, 60);
    assert.equal(result.saldoPendiente, 60);
    assert.equal('estadoPagoVerificado' in result, false);
    for (const override of [{ paymentStatus: 'pending' }, { estadoPagoVerificado: null }, { montoPagado: null },
      { montoPagado: '999' }, { moneda: 'USD' }, { paymentId: null }]) {
      const pending = new CitasService({ getDetalleByCliente: async () => ({ ...evidencia, ...override, estado: 'CONFIRMADA' }) });
      const detalle = await pending.obtenerDetalleCliente(id, 7);
      assert.equal(detalle.comprobanteDisponible, false);
      assert.equal(detalle.anticipoPagado, null);
      assert.equal(detalle.saldoPendiente, null);
    }
  });

  it('valida IDs, propiedad y paginación antes de consultar', async () => {
    let calls = 0;
    const service = new CitasService({ getDetalleByCliente: async () => { calls++; return null; } });
    await assert.rejects(service.obtenerDetalleCliente('invalido', 7), e => e.statusCode === 400);
    assert.equal(calls, 0);
    await assert.rejects(service.obtenerDetalleCliente(id, 7), e => e.statusCode === 404);
    await assert.rejects(service.obtenerCitasCliente(7, -1), e => e.statusCode === 400);
    await assert.rejects(service.obtenerCitasCliente(7, '1 OR 1=1'), e => e.statusCode === 400);
  });

  it('el repositorio limita la cita por cliente y toma precios y duraciones de la reserva', async () => {
    const calls = [];
    const repository = new CitasRepository({ query: async (sql, args) => {
      calls.push({ sql, args });
      if (calls.length === 1) return [[{ id, precioFinal: '120.00', paymentId: 'pago-test' }]];
      if (calls.length === 2) return [[{ montoPagado: '60.00', moneda: 'MXN', estadoPagoVerificado: 'approved' }]];
      return [[{ id: 1, nombre: 'Corte', precio: 120, duracionMinutos: 30 }]];
    } });
    const detalle = await repository.getDetalleByCliente(id, 7);
    assert.deepEqual(calls[0].args, [id, 7]);
    assert.match(calls[0].sql, /c.id = \? AND c.clienteId = \?/);
    assert.deepEqual(calls[1].args, ['pago-test', id]);
    assert.match(calls[2].sql, /cs.precio, cs.duracion/);
    assert.equal(detalle.servicios[0].precio, 120);
    assert.equal(detalle.montoPagado, '60.00');
  });

  it('conserva el detalle sin acreditar anticipo si falta el ID del pago o su evidencia coincidente', async () => {
    for (const paymentId of [null, 'payment-sin-evidencia']) {
      const repository = new CitasRepository({ query: async (sql) => {
        if (sql.includes('FROM cita c')) return [[{ id, precioFinal: 120, estado: 'CONFIRMADA', paymentId, paymentStatus: 'approved' }]];
        return [[]];
      } });
      const service = new CitasService(repository);
      const result = await service.obtenerDetalleCliente(id, 7);
      assert.equal(result.id, id);
      assert.equal(result.comprobanteDisponible, false);
      assert.equal(result.anticipoPagado, null);
      assert.equal(result.saldoPendiente, null);
    }
  });

  it('no consulta líneas cuando la cita no pertenece al cliente', async () => {
    let calls = 0;
    const repository = new CitasRepository({ query: async () => { calls++; return [[]]; } });
    assert.equal(await repository.getDetalleByCliente(id, 99), null);
    assert.equal(calls, 1);
  });

  it('protege la ruta y deriva el cliente del token, sin aceptar clienteId del query', async t => {
    assert.equal((await request(app).get(`/api/citas/${id}`)).status, 401);
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'detalle-jwt-exclusivo-test';
    t.after(() => { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; });
    t.mock.method(usuarioRepository, 'findById', async () => ({ id: 21, rol: 'CLIENTE', estaActivo: 1 }));
    t.mock.method(clienteRepository, 'findByUsuarioId', async () => ({ id: 7 }));
    let args;
    t.mock.method(citasRepository, 'getDetalleByCliente', async (...values) => { args = values; return evidencia; });
    const token = jwt.sign({ id: 21, rol: 'CLIENTE' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const response = await request(app).get(`/api/citas/${id}?clienteId=99`).set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.deepEqual(args, [id, 7]);
    assert.equal(response.body.comprobanteDisponible, true);
    t.mock.method(citasRepository, 'getDetalleByCliente', async () => null);
    assert.equal((await request(app).get(`/api/citas/${id}`).set('Authorization', `Bearer ${token}`)).status, 404);
  });
});
