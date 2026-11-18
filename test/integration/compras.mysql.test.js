import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import pool from '../../src/config/database.js';
import pedidos from '../../src/repositories/pedidosRepository.js';
import compras from '../../src/repositories/comprasRepository.js';
import { getSafeTestDatabaseConfig } from '../helpers/mysqlTestDb.js';
import { resetCitasTestDatabase, dropCitasTestDatabaseObjects } from '../helpers/citasTestDb.js';
let inicializado = false, siguientePago = 500000;
let token;
const pagos = new Map();
const comprar = async (usuarioId = 21, fecha = new Date().toISOString()) => {
  const pedido = await pedidos.crear(usuarioId, [{ insumoId: 1, cantidad: 1 }, { insumoId: 2, cantidad: 1 }]);
  const pago = { id: ++siguientePago, status: 'approved', external_reference: `pedido-movil:${pedido.id}`, transaction_amount: pedido.total, currency_id: 'MXN', date_approved: fecha };
  pagos.set(String(pago.id), pago); await pedidos.aplicarPago(pedido.id, pago); return pedidos.obtener(pedido.id, usuarioId);
};
const cabecera = req => req.set('Authorization', `Bearer ${token}`);
before(async () => {
  getSafeTestDatabaseConfig(); await resetCitasTestDatabase(); inicializado = true;
  const sql = await readFile(new URL('../fixtures/pedidos.mysql.sql', import.meta.url), 'utf8');
  for (const sentencia of sql.split(';').map(s => s.trim()).filter(Boolean)) await pool.query(sentencia);
  await pool.query(`INSERT INTO usuario (id,nombre,correo,password,rol,estaActivo) VALUES
    (21,'Cliente comprador','compra@ladybarber.test','hash','CLIENTE',1),(22,'Otro comprador','otra.compra@ladybarber.test','hash','CLIENTE',1)`);
  await pool.query('INSERT INTO cliente (id,usuarioId) VALUES (7,21),(8,22)');
  await pool.query("INSERT INTO insumo (id,nombre,stockActual,stockMinimo,precioUnitario,estaActivo,imagen) VALUES (1,'Gel',100,5,25,1,'https://example.test/gel.jpg'),(2,'Cera',100,5,35,1,NULL)");
  await pool.query('CREATE TABLE perfil_empresa (id INT PRIMARY KEY,nombre VARCHAR(120),logo TEXT,direccion VARCHAR(255),ubicacion VARCHAR(255),telefono VARCHAR(30),horarioAtencion VARCHAR(120),activo TINYINT)');
  await pool.query("INSERT INTO perfil_empresa (id,nombre,direccion,telefono,activo) VALUES (1,'Salón de prueba','Dirección de prueba','0000000000',1)");
  token = jwt.sign({ id: 21, rol: 'CLIENTE' }, process.env.JWT_SECRET);
});
after(async () => {
  try { if (inicializado) {
    for (const tabla of ['ventas_online','pedido_items','pedidos','perfil_empresa']) await pool.query(`DROP TABLE IF EXISTS ${tabla}`);
    await dropCitasTestDatabaseObjects();
  } } finally { await pool.end(); }
});
it('lista solo compras propias, tres inicialmente, imágenes y cursor estable, sin pedidos sin pagar', async () => {
  for (let i = 0; i < 5; i++) await comprar();
  await comprar(22); await pedidos.crear(21, [{ insumoId: 1, cantidad: 3 }]);
  const res = await cabecera(request(app).get('/api/compras')); assert.equal(res.status, 200); assert.equal(res.body.compras.length, 3);
  assert.ok(res.body.compras.every(c => c.items.length === 2 && c.total === 60 && c.items[0].imagen.includes('gel.jpg')));
  const pagina = await cabecera(request(app).get(`/api/compras?cursor=${res.body.siguienteCursor}`)); assert.equal(pagina.status, 200); assert.equal(pagina.body.compras.length, 2); assert.equal(pagina.body.siguienteCursor, null);
  assert.ok(pagina.body.compras.every(c => !res.body.compras.some(a => a.id === c.id)));
});
it('el detalle conserva nombre y precio de la venta aunque cambie el catálogo, con plazo desde la aprobación', async () => {
  const pedido = await comprar();
  await pool.query("UPDATE insumo SET nombre='Nombre nuevo',precioUnitario=999 WHERE id=1");
  try {
    const res = await cabecera(request(app).get(`/api/compras/${pedido.id}`)); assert.equal(res.status, 200);
    assert.equal(res.body.items[0].nombre, 'Gel'); assert.equal(res.body.items[0].precioUnitario, 25);
    assert.equal(res.body.comprobanteDisponible, true); assert.equal(res.body.recogida.estado, 'vigente'); assert.equal('codigo' in res.body.recogida, false); assert.equal('entregadoEn' in res.body.recogida, false);
    assert.equal(Date.parse(res.body.recogida.limiteEn) - Date.parse(res.body.recogida.aprobadoEn), 24 * 3600000);
    const ajeno = await request(app).get(`/api/compras/${pedido.id}`).set('Authorization', `Bearer ${jwt.sign({ id: 22, rol: 'CLIENTE' }, process.env.JWT_SECRET)}`); assert.equal(ajeno.status, 404);
  } finally { await pool.query("UPDATE insumo SET nombre='Gel',precioUnitario=25 WHERE id=1"); }
});
it('al vencer 24 horas conserva el pago y comprobante, pero rechaza entrega y no renueva la vigencia', async () => {
  const pedido = await comprar(21, new Date(Date.now() - 25 * 3600000).toISOString());
  const res = await cabecera(request(app).get(`/api/compras/${pedido.id}`)); assert.equal(res.body.recogida.estado, 'vencida'); assert.equal('codigo' in res.body.recogida, false); assert.equal(res.body.comprobanteDisponible, true);
  const otro = await cabecera(request(app).get(`/api/compras/${pedido.id}`)); assert.equal(otro.body.recogida.limiteEn, res.body.recogida.limiteEn);
  assert.equal((await pedidos.obtener(pedido.id, 21)).estado, 'pagado');
  const filtro = await cabecera(request(app).get('/api/compras?filtro=vencidas')); assert.ok(filtro.body.compras.some(c => c.id === pedido.id));
});
it('los registros heredados y evidencia sin correspondencia no habilitan un comprobante sin evidencia', async () => {
  const pedido = await comprar(); const venta = await compras.venta(pedido.id, 21);
  const detalle = venta.items.map(({ recogida, ...i }) => i);
  await pool.query('UPDATE ventas_online SET detalle=? WHERE id=?', [JSON.stringify(detalle), venta.id]);
  const res = await cabecera(request(app).get(`/api/compras/${pedido.id}`)); assert.equal(res.body.recogida.estado, 'sin_registro'); assert.equal(res.body.comprobanteDisponible, false); assert.equal('codigo' in res.body.recogida, false);
  detalle[0].paymentId = '999999'; await pool.query('UPDATE ventas_online SET detalle=? WHERE id=?', [JSON.stringify(detalle), venta.id]);
  const noCoincide = await cabecera(request(app).get(`/api/compras/${pedido.id}`)); assert.equal(noCoincide.body.comprobanteDisponible, false);
});
it('los filtros se calculan en servidor y la API no acepta nombres o cursor arbitrarios', async () => {
  const disponibles = await cabecera(request(app).get('/api/compras?filtro=vigentes')); assert.ok(disponibles.body.compras.every(c => c.estadoRecogida === 'vigente'));
  const filtro = await cabecera(request(app).get('/api/compras?filtro=otro')); assert.equal(filtro.status, 400);
  const cursor = await cabecera(request(app).get('/api/compras?cursor=-1')); assert.equal(cursor.status, 400);
});
it('un reembolso deshabilita el comprobante y esta versi?n no expone acciones de entrega', async () => {
  const pedido = await comprar();
  await pedidos.aplicarPago(pedido.id, { ...pagos.get(pedido.paymentId), status: 'refunded' });
  const res = await cabecera(request(app).get(`/api/compras/${pedido.id}`));
  assert.equal(res.body.comprobanteDisponible, false); assert.equal(res.body.recogida.estado, 'no_disponible');
  for (const ruta of ['/api/entregas-productos/validar','/api/entregas-productos/confirmar']) {
    const fueraDeAlcance = await cabecera(request(app).post(ruta)).send({ pedidoId: pedido.id }); assert.equal(fueraDeAlcance.status, 404);
  }
});
