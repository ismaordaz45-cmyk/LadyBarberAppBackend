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
