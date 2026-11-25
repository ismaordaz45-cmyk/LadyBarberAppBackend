import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app.js';
import usuarios from '../src/repositories/usuarioRepository.js';
import service, { PedidosService } from '../src/services/pedidosService.js';
import { ProductosMercadoPagoGateway } from '../src/services/productosMercadoPagoGateway.js';

const pedido = () => ({ id: 9, usuarioId: 21, total: 60, totalCentavos: 6000, estado: 'pendiente', paymentStatus: 'mobile_created', preferenceId: null, paymentId: null, creadoEn: new Date(), items: [{ insumoId: 1, nombre: 'Producto', cantidad: 2, precioUnitario: 30 }] });
const config = () => ({ publicBackendUrl: 'https://backend.example.test', webhookSecret: 'secreto-ficticio' });
const repo = (overrides = {}) => ({ obtener: async () => pedido(), conBloqueoPago: async (_id, cb) => cb({}), productos: async () => [{ id: 1, nombre: 'Producto', precioUnitario: 30, stockActual: 5, estaActivo: 1 }], guardarPreferencia: async () => {}, ...overrides });

describe('Pedidos y checkout de productos', () => {
  it('cancela un pedido propio sin checkout y conserva sus artículos sin invocar Mercado Pago', async () => {
    let cancelaciones = 0;
    const s = new PedidosService(repo({ cancelarSinPago: async (id, user) => { assert.equal(id, 9); assert.equal(user, 21); cancelaciones++; return { ...pedido(), estado: 'cancelado', paymentStatus: 'mobile_cancelled' }; } }), {}, config);
    const result = await s.cancelar(9, 21);
    assert.equal(result.estado, 'cancelado'); assert.equal(result.items.length, 1); assert.equal(cancelaciones, 1);
    const ajeno = new PedidosService(repo({ obtener: async () => null }), {}, config);
    await assert.rejects(() => ajeno.cancelar(9, 22), e => e.statusCode === 404);
  });
  it('vence y verifica la preferencia antes de cancelar; rechaza respuestas no confirmadas', async () => {
    const orden = [];
    const checkout = { ...pedido(), preferenceId: 'pref-9', paymentStatus: 'mobile_checkout' };
    const mp = { obtenerPreferencia: async () => ({ external_reference: 'pedido-movil:9' }), buscarPagos: async () => { orden.push('buscar'); return { results: [] }; },
      expirarPreferencia: async () => { orden.push('expirar'); return { id: 'pref-9', external_reference: 'pedido-movil:9', expires: true, expiration_date_to: new Date(Date.now()-5000).toISOString() }; } };
    const db = repo({ obtener: async () => checkout, cancelarSinPago: async () => { orden.push('cancelar'); return { ...checkout, estado: 'cancelado', paymentStatus: 'mobile_cancelled' }; } });
    await new PedidosService(db, mp, config).cancelar(9, 21);
    assert.deepEqual(orden, ['buscar','expirar','buscar','cancelar']);
    orden.length = 0;
    await assert.rejects(() => new PedidosService(db, { ...mp, expirarPreferencia: async () => ({ expires: false }) }, config).cancelar(9,21), e => e.statusCode === 502);
    assert.ok(!orden.includes('cancelar'));
    await assert.rejects(() => new PedidosService(db, { ...mp, expirarPreferencia: async () => { throw new Error('Sin conexión'); } }, config).cancelar(9,21), /Sin conexión/);
    assert.ok(!orden.includes('cancelar'));
  });
  it('no cancela si detecta un pago aprobado o pendiente, ni si el checkout pertenece a la web', async () => {
    const checkout = { ...pedido(), preferenceId: 'pref-9', paymentStatus: 'mobile_checkout' };
    for (const status of ['approved','pending','in_process','authorized']) {
      let aplicada = false;
      const s = new PedidosService(repo({ obtener: async () => checkout, aplicarPago: async () => { aplicada = true; }, cancelarSinPago: async () => assert.fail('No cancelar') }), {
        obtenerPreferencia: async () => ({ external_reference: 'pedido-movil:9' }), buscarPagos: async () => ({ results: [{ id: 123, external_reference: 'pedido-movil:9' }] }),
        obtenerPago: async () => ({ id: 123, external_reference: 'pedido-movil:9', currency_id: 'MXN', transaction_amount: 60, status }), expirarPreferencia: async () => assert.fail('No expirar'),
      }, config);
      await assert.rejects(() => s.cancelar(9,21), e => e.statusCode === 409); assert.equal(aplicada, true);
    }
    await assert.rejects(() => new PedidosService(repo({ obtener: async () => checkout }), { obtenerPreferencia: async () => ({ external_reference: '9' }) }, config).cancelar(9,21), /fuera de la app/);
  });
  it('la cancelación exige autenticación', async () => {
    assert.equal((await request(app).post('/api/pedidos/9/cancelar')).status, 401);
  });
  it('rechaza un pedido ajeno antes de invocar Mercado Pago', async () => {
    let llamadas = 0;
    const s = new PedidosService(repo({ obtener: async () => null }), { crearPreferencia: async () => { llamadas++; } }, config);
    await assert.rejects(() => s.preferencia(9, 22), e => e.statusCode === 404); assert.equal(llamadas, 0);
  });
  it('no crea checkout para un pago en proceso, aprobado o un pedido vencido', async () => {
    for (const paymentStatus of ['pending','in_process','approved','refunded']) {
      const s = new PedidosService(repo({ obtener: async () => ({ ...pedido(), paymentStatus }) }), {}, config);
      await assert.rejects(() => s.preferencia(9, 21), e => e.statusCode === 409);
    }
    const vencido = new PedidosService(repo({ obtener: async () => ({ ...pedido(), creadoEn: new Date(Date.now() - 31 * 60000) }) }), {}, config);
    await assert.rejects(() => vencido.preferencia(9, 21), /venció/);
  });
  it('no reutiliza una preferencia de la web ni envía un enlace extraño al dispositivo', async () => {
    const s = new PedidosService(repo({ obtener: async () => ({ ...pedido(), preferenceId: 'pref-web' }) }), { obtenerPreferencia: async () => ({ external_reference: '9' }) }, config);
    await assert.rejects(() => s.preferencia(9, 21), /web/);
    const malicioso = new PedidosService(repo(), { crearPreferencia: async () => ({ id: 'pref', init_point: 'https://ejemplo.test/pagar' }) }, config);
    await assert.rejects(() => malicioso.preferencia(9, 21), e => e.statusCode === 502);
  });
  it('una búsqueda sin resultados conserva el pedido pendiente y nunca confía en un retorno aprobado', async () => {
    const s = new PedidosService(repo(), { buscarPagos: async () => ({ results: [] }) }, config);
    const estado = await s.sincronizar(9, 21); assert.equal(estado.compraConfirmada, false);
  });
  it('consulta primero la evidencia registrada para detectar reembolsos sin depender del índice de búsqueda', async () => {
    let aplicado;
    const s = new PedidosService(repo({ obtener: async () => ({ ...pedido(), paymentId: '44' }), aplicarPago: async (_id, p) => { aplicado = p; } }),
      { obtenerPago: async () => ({ id: 44, status: 'refunded', external_reference: 'pedido-movil:9', currency_id: 'MXN', transaction_amount: 60 }) }, config);
    await s.sincronizar(9, 21); assert.equal(aplicado.status, 'refunded');
  });
  it('usa el gateway existente con rutas específicas, token fuera del cuerpo y tiempo límite', async () => {
    const llamadas = [];
    const g = new ProductosMercadoPagoGateway({ request: async (...args) => { llamadas.push(args); return {}; } });
    await g.buscarPagos('pedido-movil:9'); await g.obtenerPago('44'); await g.crearPreferencia({ items: [] }, 'pedido-movil-9');
    assert.match(llamadas[0][0], /external_reference=pedido-movil%3A9/);
    assert.equal(llamadas[1][0], '/v1/payments/44'); assert.equal(llamadas[2][1].method, 'POST');
    assert.ok(llamadas.every(([, options]) => options.signal));
  });
  it('rutas protegidas usan usuario.id del JWT y no el comprador enviado en el body', async t => {
    const original = process.env.JWT_SECRET; process.env.JWT_SECRET = 'jwt-pedidos-test';
    t.after(() => { if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });
    t.mock.method(usuarios, 'findById', async () => ({ id: 21, estaActivo: 1, rol: 'CLIENTE' }));
    let propietario;
    t.mock.method(service, 'crear', async (id) => { propietario = id; return { id: 9 }; });
    const token = jwt.sign({ id: 21, rol: 'CLIENTE' }, process.env.JWT_SECRET);
    const res = await request(app).post('/api/pedidos').set('Authorization', `Bearer ${token}`).send({ clienteId: 22, items: [] });
    assert.equal(res.status, 201); assert.equal(propietario, 21);
    t.mock.method(usuarios, 'findById', async () => ({ id: 21, estaActivo: 1, rol: 'EMPLEADA' }));
    const rol = await request(app).post('/api/pedidos').set('Authorization', `Bearer ${token}`).send({ items: [] }); assert.equal(rol.status, 403);
  });
  it('rechaza notificaciones con identificadores contradictorios y no confirma desde la página de retorno', async () => {
    const res = await request(app).post('/api/pagos/productos/mercadopago/webhook?data.id=1&type=payment').send({ data: { id: 2 } }); assert.equal(res.status, 400);
    const regreso = await request(app).get('/api/pagos/productos/mercadopago/retorno/aprobado?status=approved');
    assert.equal(regreso.status, 200); assert.match(regreso.text, /consulta el estado/); assert.doesNotMatch(regreso.text, /Compra confirmada/);
  });
});
