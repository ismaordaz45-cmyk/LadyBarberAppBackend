import repository from '../repositories/pedidosRepository.js';
import gateway from './productosMercadoPagoGateway.js';
import { createMercadoPagoConfig } from '../config/mercadoPago.js';
import { verifyMercadoPagoSignature } from './mercadoPagoSignature.js';
import { calcularPedido, referenciaPedidoMovil, validarItemsPedido, validarPagoProducto } from './productosPagoDomain.js';

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const edadPedido = pedido => pedido.edadSegundos == null
  ? (Date.now() - new Date(pedido.creadoEn).getTime()) / 1000 : Number(pedido.edadSegundos);
const idValido = id => {
  if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || Number(id) > 2147483647) throw fail(400, 'Identificador de pedido inválido');
  return Number(id);
};
export function presentarPedido(pedido) {
  const pagoAprobado = pedido.paymentStatus === 'approved';
  const edad = edadPedido(pedido);
  const vencido = !Number.isFinite(edad) || edad >= 1800;
  return { id: pedido.id, total: pedido.total, moneda: 'MXN', fecha: pedido.fecha, estado: pedido.estado,
    paymentId: pedido.paymentId || null, paymentStatus: pedido.paymentStatus || null,
    pagoAprobado, compraConfirmada: pedido.estado === 'pagado' && pagoAprobado,
    requiereRevision: pagoAprobado && pedido.estado !== 'pagado', vencido,
    items: pedido.items.map(i => ({ insumoId: i.insumoId, nombre: i.nombre || 'Producto', cantidad: i.cantidad, precioUnitario: i.precioUnitario, subtotal: Math.round(i.precioUnitario * 100) * i.cantidad / 100 })) };
}

export class PedidosService {
  constructor(repo = repository, mp = gateway, config = createMercadoPagoConfig) { this.repo = repo; this.mp = mp; this.config = config; }
  async crear(usuarioId, items) { return presentarPedido(await this.repo.crear(usuarioId, validarItemsPedido(items))); }
  async obtener(id, usuarioId) {
    const pedido = await this.repo.obtener(idValido(id), usuarioId);
    if (!pedido) throw fail(404, 'Pedido no encontrado');
    return presentarPedido(pedido);
  }
  async listar(usuarioId, offset) {
    if (!/^\d+$/.test(String(offset)) || Number(offset) > 1000000) throw fail(400, 'Paginación inválida');
    return this.repo.listar(usuarioId, Number(offset));
  }
  async revisarAntesDeCancelar(pedido) {
    if (!pedido.preferenceId && pedido.paymentStatus === 'mobile_created' && !pedido.paymentId) return;
    const busqueda = await this.mp.buscarPagos(referenciaPedidoMovil(pedido.id));
    if (!Array.isArray(busqueda?.results) || busqueda.results.length >= 30) throw fail(409, 'No se pudo verificar todos los pagos del pedido. Consulta su estado antes de cancelar');
    const ids = new Set([pedido.paymentId, ...busqueda.results.filter(p => p.external_reference === referenciaPedidoMovil(pedido.id)).map(p => p.id)].filter(Boolean).map(String));
    for (const paymentId of ids) {
      const pago = await this.mp.obtenerPago(paymentId);
      validarPagoProducto(pago, pedido, paymentId);
      if (!['rejected','cancelled'].includes(pago.status) || Number(pago.transaction_amount_refunded || 0) > 0) {
        await this.repo.aplicarPago(pedido.id, pago);
        throw fail(409, 'El pedido tiene un pago aprobado, pendiente o en revisión. Consulta su estado; no se canceló ni se solicitó un reembolso');
      }
    }
  }
  async cancelar(id, usuarioId) {
    id = idValido(id);
    return this.repo.conBloqueoPago(id, async c => {
      const pedido = await this.repo.obtener(id, usuarioId, c);
      if (!pedido) throw fail(404, 'Pedido no encontrado');
      if (pedido.estado === 'cancelado' && pedido.paymentStatus === 'mobile_cancelled') return presentarPedido(pedido);
      if (pedido.estado !== 'pendiente' || !['mobile_created','mobile_checkout','rejected','cancelled'].includes(pedido.paymentStatus)) throw fail(409, 'Este pedido no se puede cancelar. Consulta el estado de su pago');
      if (!pedido.preferenceId && (pedido.paymentStatus !== 'mobile_created' || pedido.paymentId)) throw fail(409, 'El pedido no admite cancelación desde la app');
      if (pedido.preferenceId) {
        const preferencia = await this.mp.obtenerPreferencia(pedido.preferenceId);
        if (preferencia.external_reference !== referenciaPedidoMovil(id)) throw fail(409, 'Este pedido se inició fuera de la app. Consulta al salón');
        await this.revisarAntesDeCancelar(pedido);
        const expirada = await this.mp.expirarPreferencia(pedido.preferenceId);
        if (String(expirada?.id) !== String(pedido.preferenceId) || expirada?.external_reference !== referenciaPedidoMovil(id)
          || expirada.expires !== true || !Number.isFinite(Date.parse(expirada.expiration_date_to)) || Date.parse(expirada.expiration_date_to) > Date.now()) throw fail(502, 'No se pudo cerrar el enlace de Mercado Pago. El pedido se conserva para consultar su estado');
        await this.revisarAntesDeCancelar(pedido);
      }
      return presentarPedido(await this.repo.cancelarSinPago(id, usuarioId));
    });
  }
  async preferencia(id, usuarioId) {
    id = idValido(id);
    const { publicBackendUrl } = this.config();
    return this.repo.conBloqueoPago(id, async c => {
      const pedido = await this.repo.obtener(id, usuarioId, c);
      if (!pedido) throw fail(404, 'Pedido no encontrado');
      if (pedido.estado !== 'pendiente' || ['approved','pending','in_process','authorized','refunded','charged_back','partially_refunded'].includes(pedido.paymentStatus)) throw fail(409, 'Consulta el estado del pedido antes de intentar otro pago');
      const edad = edadPedido(pedido);
      if (!Number.isFinite(edad) || edad >= 1800) throw fail(409, 'El plazo de este pedido venció. Crea un pedido nuevo desde tu carrito');
      calcularPedido(pedido.items, await this.repo.productos(c, pedido.items.map(i => i.insumoId)));
      const referencia = referenciaPedidoMovil(id);
      let preferencia;
      if (pedido.preferenceId) {
        preferencia = await this.mp.obtenerPreferencia(pedido.preferenceId);
        if (preferencia.external_reference !== referencia) throw fail(409, 'Este pedido se inició en la web. Continúa el pago desde la web');
      } else {
        if (pedido.paymentStatus !== 'mobile_created') throw fail(409, 'El pedido no admite un checkout móvil');
        preferencia = await this.mp.crearPreferencia({
          items: pedido.items.map(i => ({ id: String(i.insumoId), title: i.nombre || 'Producto', quantity: i.cantidad, unit_price: i.precioUnitario, currency_id: 'MXN' })),
          external_reference: referencia, metadata: { pedido_movil_id: id },
          notification_url: `${publicBackendUrl}/api/pagos/productos/mercadopago/webhook`,
          back_urls: Object.fromEntries(['success','pending','failure'].map((estado, i) => [estado, `${publicBackendUrl}/api/pagos/productos/mercadopago/retorno/${['aprobado','pendiente','fallido'][i]}`])),
          auto_return: 'approved', expires: true,
          expiration_date_to: new Date(Date.now() + (1800 - Math.max(0, edad)) * 1000).toISOString(),
        }, `pedido-movil-${id}`);
        if (!preferencia?.id || !preferencia.init_point) throw fail(502, 'Mercado Pago no devolvió un enlace válido');
        await this.repo.guardarPreferencia(id, usuarioId, preferencia.id, c);
      }
      const url = new URL(preferencia.init_point);
      if (url.protocol !== 'https:' || url.username || url.password || !['www.mercadopago.com.mx','mercadopago.com.mx'].includes(url.hostname)) throw fail(502, 'El enlace de Mercado Pago no es válido');
      return { pedidoId: id, checkoutUrl: url.toString(), preferenceId: preferencia.id, total: pedido.total, moneda: 'MXN' };
    });
  }
  async sincronizar(id, usuarioId) {
    id = idValido(id);
    const pedido = await this.repo.obtener(id, usuarioId);
    if (!pedido) throw fail(404, 'Pedido no encontrado');
    if (pedido.paymentId) {
      const registrado = await this.mp.obtenerPago(pedido.paymentId);
      validarPagoProducto(registrado, pedido, pedido.paymentId);
      await this.repo.aplicarPago(id, registrado);
      if (['approved','refunded','charged_back'].includes(registrado.status)) return this.obtener(id, usuarioId);
    }
    // Buscar por referencia propia permite recuperar un webhook perdido sin confiar en el retorno del navegador.
    const respuesta = await this.mp.buscarPagos(referenciaPedidoMovil(id));
    if (!Array.isArray(respuesta?.results)) throw fail(502, 'No se pudo consultar el estado de Mercado Pago');
    const candidatos = respuesta.results.filter(p => p.external_reference === referenciaPedidoMovil(id));
    const candidato = candidatos.find(p => p.status === 'approved') || candidatos[0];
    if (candidato) {
      const pago = await this.mp.obtenerPago(candidato.id);
      validarPagoProducto(pago, pedido, candidato.id);
      await this.repo.aplicarPago(id, pago);
    }
    return this.obtener(id, usuarioId);
  }
  async webhook({ signature, requestId, dataId, type }) {
    if (type && type !== 'payment') return { ignored: true };
    if (!/^\d+$/.test(String(dataId || ''))) throw fail(400, 'Notificación sin identificador de pago válido');
    verifyMercadoPagoSignature({ signature, requestId, dataId, secret: this.config().webhookSecret });
    const pago = await this.mp.obtenerPago(dataId);
    const match = /^pedido-movil:([1-9]\d*)$/.exec(String(pago.external_reference || ''));
    if (!match) return { ignored: true };
    const id = idValido(match[1]);
    const pedido = await this.repo.obtener(id, null);
    if (!pedido) throw fail(404, 'Pedido no encontrado');
    validarPagoProducto(pago, pedido, dataId);
    return this.repo.aplicarPago(id, pago);
  }
}
export default new PedidosService();
