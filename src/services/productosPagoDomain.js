/** Reglas de productos independientes del esquema de persistencia y de Express. */
const errorPedido = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const MAX_LINEAS = 200;
const MAX_CANTIDAD = 9999;

export function validarItemsPedido(items) {
  if (!Array.isArray(items) || !items.length || items.length > MAX_LINEAS) {
    throw errorPedido(400, 'El carrito debe incluir entre 1 y 200 productos distintos');
  }
  const vistos = new Set();
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw errorPedido(400, 'Producto inválido');
    const id = typeof item.insumoId === 'number' ? String(item.insumoId) : item.insumoId;
    if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw errorPedido(400, 'Identificador de producto inválido');
    }
    if (!Number.isInteger(item.cantidad) || item.cantidad < 1 || item.cantidad > MAX_CANTIDAD) {
      throw errorPedido(400, 'La cantidad de productos debe ser entera y estar entre 1 y 9999');
    }
    if (vistos.has(id)) throw errorPedido(400, 'El carrito incluye productos repetidos');
    vistos.add(id);
    // Los precios, nombres y datos de comprador enviados por el dispositivo no son autoridad.
    return { insumoId: Number(id), cantidad: item.cantidad };
  });
}

export function importeEnCentavos(valor) {
  const texto = typeof valor === 'number' && Number.isFinite(valor) ? String(valor) : valor;
  if (typeof texto !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(texto)) {
    throw errorPedido(409, 'El producto o pedido no tiene un importe válido');
  }
  const [entero, decimal = ''] = texto.split('.');
  const centavos = Number(entero) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos) || centavos <= 0) throw errorPedido(409, 'El producto o pedido no tiene un importe válido');
  return centavos;
}

/** Debe recibir productos consultados por el repositorio, nunca filas del cliente HTTP. */
export function calcularPedido(items, productosServidor) {
  const solicitados = validarItemsPedido(items);
  const productos = new Map(productosServidor.map(producto => [String(producto.id), producto]));
  let totalCentavos = 0;
  const lineas = solicitados.map(item => {
    const producto = productos.get(String(item.insumoId));
    if (!producto || ![1, true].includes(producto.estaActivo)) throw errorPedido(409, 'Uno de los productos ya no está disponible');
    const stock = Number(producto.stockActual);
    if (!Number.isFinite(stock) || stock < item.cantidad) throw errorPedido(409, 'No hay existencias suficientes para completar el pedido');
    if (typeof producto.nombre !== 'string' || !producto.nombre.trim()) throw errorPedido(409, 'El producto no tiene información válida');
    const precioCentavos = importeEnCentavos(producto.precioUnitario);
    const subtotalCentavos = precioCentavos * item.cantidad;
    totalCentavos += subtotalCentavos;
    if (!Number.isSafeInteger(totalCentavos) || totalCentavos > 9999999999) throw errorPedido(409, 'El importe del pedido supera el límite permitido');
    return { insumoId: item.insumoId, cantidad: item.cantidad, nombre: producto.nombre.trim(),
      precioCentavos, subtotalCentavos };
  });
  return { lineas, totalCentavos, moneda: 'MXN' };
}

export function referenciaPedidoMovil(pedidoId) {
  const id = String(pedidoId ?? '');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw errorPedido(409, 'Identificador de pedido inválido');
  return `pedido-movil:${id}`;
}

/** El llamador consulta este recurso a Mercado Pago; no recibe un pago del frontend. */
export function validarPagoProducto(pago, pedido, paymentId) {
  if (!pago || !/^\d+$/.test(String(paymentId)) || String(pago.id) !== String(paymentId)) {
    throw errorPedido(409, 'El pago consultado no coincide');
  }
  if (pago.external_reference !== referenciaPedidoMovil(pedido.id)) throw errorPedido(409, 'El pago no corresponde al pedido');
  if (pago.currency_id !== 'MXN' || importeEnCentavos(pago.transaction_amount) !== pedido.totalCentavos) {
    throw errorPedido(409, 'El pago no coincide con el total del pedido en MXN');
  }
  if (typeof pago.status !== 'string' || !pago.status.trim()) throw errorPedido(409, 'El pago no tiene un estado válido');
  return { paymentId: String(pago.id), estado: pago.status, aprobado: pago.status === 'approved',
    totalCentavos: pedido.totalCentavos, moneda: 'MXN', referencia: pago.external_reference };
}
