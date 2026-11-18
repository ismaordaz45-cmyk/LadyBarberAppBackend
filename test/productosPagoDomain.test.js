import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPedido, importeEnCentavos, referenciaPedidoMovil, validarItemsPedido, validarPagoProducto } from '../src/services/productosPagoDomain.js';

const items = [{ insumoId: 7, cantidad: 2 }, { insumoId: '8', cantidad: 1 }];
const productos = [
  { id: 7, nombre: 'Gel', stockActual: 3, precioUnitario: '25.10', estaActivo: 1 },
  { id: 8, nombre: 'Cera', stockActual: 5, precioUnitario: '35.20', estaActivo: 1 },
];
const pedido = { id: 42, totalCentavos: 8540 };
const pago = { id: 123, external_reference: 'pedido-movil:42', transaction_amount: 85.40, currency_id: 'MXN', status: 'approved' };
const error400 = error => error.statusCode === 400;
const error409 = error => error.statusCode === 409;

describe('Reglas para pagos de productos', () => {
  it('acepta únicamente identificadores y cantidades, ignorando importes o comprador del dispositivo', () => {
    assert.deepEqual(validarItemsPedido([{ ...items[0], precio: 0.01, clienteId: 999, nombre: 'Alterado' }]), [items[0]]);
  });
  it('rechaza carritos vacíos, malformados y repetidos', () => {
    for (const value of [null, {}, [], [null], [[]], [items[0], items[0]]]) assert.throws(() => validarItemsPedido(value), error400);
    assert.throws(() => validarItemsPedido(Array.from({ length: 201 }, (_, id) => ({ insumoId: id + 1, cantidad: 1 }))), error400);
  });
  it('rechaza identificadores y cantidades manipulados', () => {
    for (const id of [0, -1, 1.5, '7 OR 1=1', '007', {}, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => validarItemsPedido([{ insumoId: id, cantidad: 1 }]), error400);
    }
    for (const cantidad of [0, -1, 1.5, '2', 10000, Number.NaN, Infinity]) {
      assert.throws(() => validarItemsPedido([{ insumoId: 7, cantidad }]), error400);
    }
  });
  it('calcula el total completo desde precios del servidor en centavos', () => {
    const result = calcularPedido(items, productos);
    assert.equal(result.totalCentavos, 8540);
    assert.equal(result.moneda, 'MXN');
    assert.deepEqual(result.lineas[0], { insumoId: 7, cantidad: 2, nombre: 'Gel', precioCentavos: 2510, subtotalCentavos: 5020 });
  });
  it('no redondea silenciosamente precios inválidos y evita errores de coma flotante', () => {
    assert.equal(importeEnCentavos('0.10') * 3, 30);
    for (const precio of [null, 0, -1, 'gratis', '', '1.005', Number.NaN, Infinity, '1e3', '9007199254740991']) {
      assert.throws(() => importeEnCentavos(precio), error409);
    }
  });
  it('rechaza productos inactivos, retirados o con existencias insuficientes', () => {
    assert.throws(() => calcularPedido(items, []), error409);
    assert.throws(() => calcularPedido(items, [{ ...productos[0], estaActivo: 0 }, productos[1]]), error409);
    assert.throws(() => calcularPedido(items, [{ ...productos[0], stockActual: 1 }, productos[1]]), error409);
  });
  it('distingue los pedidos móviles de las referencias de citas y de la web', () => {
    assert.equal(referenciaPedidoMovil(42), 'pedido-movil:42');
    for (const external_reference of ['42', 'cita:42', 'pedido-movil:43', 'pedido-movil:42 ']) {
      assert.throws(() => validarPagoProducto({ ...pago, external_reference }, pedido, 123), error409);
    }
  });
  it('solo acepta evidencia coincidente por identificador, importe completo y moneda', () => {
    assert.equal(validarPagoProducto(pago, pedido, 123).aprobado, true);
    assert.throws(() => validarPagoProducto(pago, pedido, 999), error409);
    assert.throws(() => validarPagoProducto({ ...pago, transaction_amount: 42.7 }, pedido, 123), error409);
    assert.throws(() => validarPagoProducto({ ...pago, currency_id: 'USD' }, pedido, 123), error409);
  });
  it('un retorno o pago pendiente, rechazado o reembolsado no confirma la compra', () => {
    for (const status of ['pending', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back']) {
      assert.equal(validarPagoProducto({ ...pago, status }, pedido, 123).aprobado, false);
    }
    assert.throws(() => validarPagoProducto(null, pedido, 123), error409);
  });
});
