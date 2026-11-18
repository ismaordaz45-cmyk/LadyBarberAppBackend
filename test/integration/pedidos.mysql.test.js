import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import app from '../../src/app.js';
import pool from '../../src/config/database.js';
import repository, { PedidosRepository } from '../../src/repositories/pedidosRepository.js';
import service from '../../src/services/pedidosService.js';
import { resetCitasTestDatabase, dropCitasTestDatabaseObjects } from '../helpers/citasTestDb.js';
import { getSafeTestDatabaseConfig } from '../helpers/mysqlTestDb.js';

let inicializado = false;
let token;
const secreto = 'firma-ficticia-productos-locales';
const comprador = 21; // Deliberadamente distinto de cliente.id=7.
const pago = (pedido, id = 123456, extra = {}) => ({ id, external_reference: `pedido-movil:${pedido.id}`, transaction_amount: pedido.total, currency_id: 'MXN', status: 'approved', date_approved: new Date().toISOString(), ...extra });
const pedir = (path, body) => request(app).post(`/api/pedidos${path}`).set('Authorization', `Bearer ${token}`).send(body);
const crear = async (cantidad = 1, usuario = comprador, insumoId = 1) => repository.crear(usuario, [{ insumoId, cantidad }]);
const contarVentas = async () => Number((await pool.query('SELECT COUNT(*) AS total FROM ventas_online'))[0][0].total);

before(async () => {
  getSafeTestDatabaseConfig();
  await resetCitasTestDatabase(); inicializado = true;
  const sql = await readFile(new URL('../fixtures/pedidos.mysql.sql', import.meta.url), 'utf8');
  const c = await pool.getConnection();
  try { for (const sentencia of sql.split(';').map(s => s.trim()).filter(Boolean)) await c.query(sentencia); }
  finally { c.release(); }
  await pool.query(`INSERT INTO usuario (id,nombre,correo,password,rol,estaActivo) VALUES
    (21,'Comprador','comprador.productos@ladybarber.test','hash','CLIENTE',1),
    (22,'Otra cuenta','otra.productos@ladybarber.test','hash','CLIENTE',1)`);
  await pool.query('INSERT INTO cliente (id,usuarioId) VALUES (7,21),(8,22)');
  await pool.query("INSERT INTO insumo (id,nombre,stockActual,stockMinimo,precioUnitario,estaActivo) VALUES (1,'Gel',100,5,25.10,1),(2,'Cera',100,5,35.20,1)");
  token = jwt.sign({ id: comprador, rol: 'CLIENTE' }, process.env.JWT_SECRET, { expiresIn: '1h' });
});
after(async () => {
  try {
    if (inicializado) {
      for (const tabla of ['ventas_online','pedido_items','pedidos']) await pool.query(`DROP TABLE IF EXISTS ${tabla}`);
      await dropCitasTestDatabaseObjects();
    }
  } finally { await pool.end(); }
});
it('JWT y propiedad utilizan usuario.id; recalcula precios y conserva el esquema sin migraciones', async () => {
  const noAuth = await request(app).post('/api/pedidos').send({ items: [] }); assert.equal(noAuth.status, 401);
  const res = await pedir('', { clienteId: 22, total: 0.01, items: [{ insumoId: 1, cantidad: 2, precio: 0.01 }] });
  assert.equal(res.status, 201); assert.equal(res.body.total, 50.2);
  const [rows] = await pool.query('SELECT cliente_id FROM pedidos WHERE id=?', [res.body.id]); assert.equal(rows[0].cliente_id, 21);
  const ajeno = await request(app).get(`/api/pedidos/${res.body.id}`).set('Authorization', `Bearer ${jwt.sign({ id: 22, rol: 'CLIENTE' }, process.env.JWT_SECRET)}`);
  assert.equal(ajeno.status, 404);
});
it('reintentos concurrentes del mismo carrito reutilizan un pedido pendiente sin duplicar sus líneas', async () => {
  const pedidos = await Promise.all([crear(3), crear(3), crear(3)]);
  assert.equal(new Set(pedidos.map(p => p.id)).size, 1);
  assert.equal((await pool.query('SELECT COUNT(*) AS n FROM pedido_items WHERE pedido_id=?', [pedidos[0].id]))[0][0].n, 1);
});
it('prefiere importes persistidos y reutiliza la preferencia serializando peticiones simultáneas', async t => {
  const pedido = await crear(4); let llamadas = 0;
  t.mock.method(service, 'config', () => ({ publicBackendUrl: 'https://backend.example.test', webhookSecret: secreto }));
  t.mock.method(service.mp, 'crearPreferencia', async body => {
    llamadas++; assert.equal(body.items[0].unit_price, 25.1); assert.equal(body.external_reference, `pedido-movil:${pedido.id}`);
    assert.match(body.notification_url, /productos\/mercadopago\/webhook$/);
    return { id: 'pref-local', init_point: 'https://www.mercadopago.com.mx/checkout/test' };
  });
  t.mock.method(service.mp, 'obtenerPreferencia', async () => ({ id: 'pref-local', external_reference: `pedido-movil:${pedido.id}`, init_point: 'https://www.mercadopago.com.mx/checkout/test' }));
  await Promise.all([service.preferencia(pedido.id, comprador), service.preferencia(pedido.id, comprador)]);
  assert.equal(llamadas, 1);
});
it('webhook aprobado repetido descuenta stock y registra una sola venta para el usuario correcto', async t => {
  const pedido = await crear(5); const ventasAntes = await contarVentas();
  const stockAntes = (await pool.query('SELECT stockActual FROM insumo WHERE id=1'))[0][0].stockActual;
  t.mock.method(service, 'config', () => ({ webhookSecret: secreto }));
  t.mock.method(service.mp, 'obtenerPago', async () => pago(pedido, 200001));
  const ts = '1800000000', requestId = 'request-local';
  const signature = `ts=${ts},v1=${createHmac('sha256', secreto).update(`id:200001;request-id:${requestId};ts:${ts};`).digest('hex')}`;
  const enviar = () => request(app).post('/api/pagos/productos/mercadopago/webhook?data.id=200001&type=payment').set('x-signature', signature).set('x-request-id', requestId).send({ data: { id: '200001' }, type: 'payment' });
  const resultados = await Promise.all([enviar(), enviar(), enviar()]); resultados.forEach(r => assert.equal(r.status, 200));
  assert.equal(await contarVentas(), ventasAntes + 1);
  assert.equal((await pool.query('SELECT stockActual FROM insumo WHERE id=1'))[0][0].stockActual, stockAntes - 5);
  const [ventas] = await pool.query('SELECT cliente_id,detalle FROM ventas_online ORDER BY id DESC LIMIT 1'); assert.equal(ventas[0].cliente_id, 21);
  assert.equal(JSON.parse(ventas[0].detalle)[0].paymentId, '200001');
});
it('no modifica stock ni venta con firma inválida, importe parcial o moneda distinta', async t => {
  t.mock.method(service, 'config', () => ({ webhookSecret: secreto }));
  const pedido = await crear(6); const ventasAntes = await contarVentas();
  const res = await request(app).post('/api/pagos/productos/mercadopago/webhook?data.id=20&type=payment').send({}); assert.equal(res.status, 401);
  for (const extra of [{ transaction_amount: pedido.total / 2 }, { currency_id: 'USD' }, { external_reference: 'cita:otra' }]) {
    await assert.rejects(() => repository.aplicarPago(pedido.id, pago(pedido, 200002, extra)), e => e.statusCode === 409);
  }
  assert.equal(await contarVentas(), ventasAntes); assert.equal((await repository.obtener(pedido.id, comprador)).paymentId, null);
});
it('si dos compradores pagan la última unidad, solo uno se confirma y el otro queda con pago recibido para revisión', async () => {
  await pool.query('UPDATE insumo SET stockActual=1 WHERE id=2');
  const [uno, dos] = await Promise.all([crear(1, 21, 2), crear(1, 22, 2)]);
  const ventasAntes = await contarVentas();
  const resultados = await Promise.all([repository.aplicarPago(uno.id, pago(uno, 200010)), repository.aplicarPago(dos.id, pago(dos, 200011))]);
  assert.equal(resultados.filter(p => p.estado === 'pagado').length, 1);
  assert.equal(resultados.filter(p => p.estado === 'pendiente' && p.paymentStatus === 'approved').length, 1);
  assert.equal(await contarVentas(), ventasAntes + 1); assert.equal((await pool.query('SELECT stockActual FROM insumo WHERE id=2'))[0][0].stockActual, 0);
  const revisar = resultados.find(p => p.estado === 'pendiente'); const estado = await service.obtener(revisar.id, revisar.usuarioId);
  assert.equal(estado.requiereRevision, true); assert.equal(estado.compraConfirmada, false);
  await assert.rejects(() => service.preferencia(revisar.id, revisar.usuarioId), e => e.statusCode === 409 || e.statusCode === 503);
  await repository.aplicarPago(revisar.id, pago(revisar, revisar.paymentId, { status: 'refunded' }));
  const devuelto = await service.obtener(revisar.id, revisar.usuarioId);
  assert.equal(devuelto.paymentStatus, 'refunded'); assert.equal(devuelto.requiereRevision, false);
  assert.equal(devuelto.estado, 'cancelado'); assert.equal(await contarVentas(), ventasAntes + 1);
});
it('revierte toda la transacción si falla el registro de venta', async () => {
  const pedido = await crear(7); const stockAntes = (await pool.query('SELECT stockActual FROM insumo WHERE id=1'))[0][0].stockActual;
  const conFallo = new PedidosRepository({ getConnection: async () => {
    const c = await pool.getConnection();
    return { beginTransaction: () => c.beginTransaction(), commit: () => c.commit(), rollback: () => c.rollback(), release: () => c.release(),
      query: (sql, args) => { if (sql.includes('INSERT INTO ventas_online')) throw new Error('Fallo local simulado'); return c.query(sql, args); } };
  } });
  await assert.rejects(() => conFallo.aplicarPago(pedido.id, pago(pedido, 200020)), /Fallo local simulado/);
  assert.equal((await repository.obtener(pedido.id, comprador)).paymentId, null);
  assert.equal((await pool.query('SELECT stockActual FROM insumo WHERE id=1'))[0][0].stockActual, stockAntes);
});
it('consulta recupera un webhook perdido usando referencia propia sin confiar en parámetros del cliente', async t => {
  const pedido = await crear(8);
  t.mock.method(service.mp, 'buscarPagos', async ref => { assert.equal(ref, `pedido-movil:${pedido.id}`); return { results: [pago(pedido, 200030)] }; });
  t.mock.method(service.mp, 'obtenerPago', async () => pago(pedido, 200030));
  const res = await pedir(`/${pedido.id}/sincronizar`, { status: 'approved', paymentId: 999 });
  assert.equal(res.status, 200); assert.equal(res.body.compraConfirmada, true); assert.equal(res.body.paymentId, '200030');
});
it('un evento pendiente atrasado y un reembolso no vuelven a descontar existencias', async () => {
  const pedido = await crear(9); const aprobado = pago(pedido, 200040);
  await repository.aplicarPago(pedido.id, aprobado); const ventas = await contarVentas();
  await repository.aplicarPago(pedido.id, { ...aprobado, status: 'pending' });
  assert.equal((await repository.obtener(pedido.id, comprador)).paymentStatus, 'approved');
  await repository.aplicarPago(pedido.id, { ...aprobado, status: 'refunded' });
  assert.equal((await repository.obtener(pedido.id, comprador)).estado, 'cancelado');
  await repository.aplicarPago(pedido.id, aprobado); assert.equal(await contarVentas(), ventas);
});
it('rechaza pago con falta de stock antes de checkout y controla paginación y pedidos inexistentes', async () => {
  const invalidos = await pedir('', { items: [{ insumoId: 2, cantidad: 100 }] }); assert.equal(invalidos.status, 409);
  const lista = await request(app).get('/api/pedidos?offset=0').set('Authorization', `Bearer ${token}`); assert.equal(lista.status, 200); assert.ok(lista.body.length <= 6);
  const paginacion = await request(app).get('/api/pedidos?offset=-1').set('Authorization', `Bearer ${token}`); assert.equal(paginacion.status, 400);
  const ajeno = await pedir('/999999/sincronizar'); assert.equal(ajeno.status, 404);
});
