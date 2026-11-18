import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { crearRegistroRecogida, estadoRecogida } from '../src/services/recogidaDomain.js';
import { ComprasService } from '../src/services/comprasService.js';

describe('Comprobantes y plazo de recogida', () => {
  it('las 24 horas nacen de la aprobación y el límite no se renueva al consultar o descargar', () => {
    const registro = crearRegistroRecogida('2026-11-18T10:00:00.000Z');
    assert.deepEqual(registro, { version: 1, aprobadoEn: '2026-11-18T10:00:00.000Z', limiteEn: '2026-11-19T10:00:00.000Z' });
    const pedido = { paymentStatus: 'approved', estado: 'pagado' };
    assert.equal(estadoRecogida(pedido, registro, Date.parse(registro.limiteEn) - 1), 'vigente');
    assert.equal(estadoRecogida(pedido, registro, Date.parse(registro.limiteEn)), 'vencida');
    assert.throws(() => crearRegistroRecogida(null), e => e.statusCode === 409);
    assert.equal(estadoRecogida(pedido, null), 'sin_registro');
    assert.equal(estadoRecogida({ ...pedido, paymentStatus: 'refunded' }, registro), 'no_disponible');
  });
  it('rechaza filtros de entrega pospuestos y cursores inválidos', async () => {
    const servicio = new ComprasService({}, {});
    await assert.rejects(() => servicio.listar(21, 'recogidas'), e => e.statusCode === 400);
    await assert.rejects(() => servicio.listar(21, 'todas', '1 OR 1=1'), e => e.statusCode === 400);
  });
  it('no expone panel, validación ni confirmación de entregas', async () => {
    for (const accion of ['', '/acceso', '/validar', '/confirmar']) {
      const res = accion ? await request(app).post(`/api/entregas-productos${accion}`).send({}) : await request(app).get('/api/entregas-productos');
      assert.equal(res.status, 404);
    }
  });
  it('conserva la protección independiente del registro público contra autoasignar roles', async () => {
    for (const path of ['/api/registro','/api/auth/registro']) {
      const res = await request(app).post(path).send({ nombre: 'Usuario', correo: 'no-se-crea@ladybarber.test', password: 'NoSeUsa1!', rol: 'PROPIETARIA' });
      assert.equal(res.status, 403);
    }
  });
});
