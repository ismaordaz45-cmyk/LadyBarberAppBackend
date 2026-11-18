import repository from '../repositories/comprasRepository.js';
import { presentarPedido } from './pedidosService.js';
import negocio from '../repositories/negocioRepository.js';
import { estadoRecogida } from './recogidaDomain.js';
import { importeEnCentavos } from './productosPagoDomain.js';

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const idValido = id => { if (!/^[1-9]\d*$/.test(String(id)) || Number(id) > 2147483647) throw fail(400, 'Pedido inválido'); return Number(id); };
function ventaCoincidente(pedido, venta) {
  if (!venta || venta.items.length !== pedido.items.length || !pedido.paymentId) return false;
  return pedido.items.every(i => venta.items.some(v => Number(v.id) === i.insumoId && Number(v.cantidad) === i.cantidad
    && String(v.paymentId) === String(pedido.paymentId) && Number(v.pedidoId) === pedido.id
    && importeEnCentavos(v.precioVenta) === importeEnCentavos(i.precioUnitario)));
}
export class ComprasService {
  constructor(repo = repository, negocioRepo = negocio) {
    this.repo = repo; this.negocio = negocioRepo;
  }
  async listar(usuarioId, filtro = 'todas', cursor) {
    if (!['todas','vigentes','vencidas'].includes(filtro)) throw fail(400, 'Filtro de compras inválido');
    const pagina = await this.repo.listar(usuarioId, filtro, cursor ? idValido(cursor) : null);
    const ventas = new Map();
    for (const row of pagina.ventas) {
      try {
        const items = typeof row.detalle === 'string' ? JSON.parse(row.detalle) : row.detalle;
        if (Array.isArray(items) && items[0]) ventas.set(Number(items[0].pedidoId), items);
      } catch { /* Los datos heredados sin evidencia coincidente no habilitan comprobantes. */ }
    }
    return { compras: pagina.rows.map(p => {
      const guardados = ventas.get(p.id);
      return { id: p.id, fecha: p.fecha, aprobadoEn: guardados?.[0]?.recogida?.aprobadoEn || null, total: Number(p.total), moneda: 'MXN', paymentStatus: p.paymentStatus,
        estadoRecogida: estadoRecogida(p, guardados?.[0]?.recogida), totalProductos: Number(p.totalProductos), totalUnidades: Number(p.totalUnidades),
        items: pagina.items.filter(i => i.pedidoId === p.id).map(i => ({ insumoId: i.insumoId, nombre: guardados?.find(v => Number(v.id) === i.insumoId)?.nombre || i.nombre || 'Producto', imagen: i.imagen || null,
          cantidad: i.cantidad, precioUnitario: Number(i.precioUnitario), subtotal: Math.round(Number(i.precioUnitario) * 100) * i.cantidad / 100 })) };
    }), siguienteCursor: pagina.siguienteCursor };
  }
  async detalle(id, usuarioId) {
    id = idValido(id);
    const data = await this.repo.detalle(id, usuarioId);
    if (!data) throw fail(404, 'Compra no encontrada');
    const { pedido, venta } = data;
    const coincidente = ventaCoincidente(pedido, venta);
    const estado = estadoRecogida(pedido, coincidente ? venta.recogida : null);
    const fechasValidas = coincidente && Number.isFinite(Date.parse(venta.recogida?.aprobadoEn))
      && Date.parse(venta.recogida?.limiteEn) - Date.parse(venta.recogida?.aprobadoEn) === 24 * 3600000;
    const comprobanteDisponible = coincidente && pedido.estado === 'pagado' && pedido.paymentStatus === 'approved'
      && venta.recogida?.version === 1 && fechasValidas && ['vigente','vencida'].includes(estado);
    const empresa = await this.negocio.obtenerPerfilPublico();
    return { ...presentarPedido(pedido),
      items: pedido.items.map(i => ({ insumoId: i.insumoId, nombre: coincidente ? venta.items.find(v => Number(v.id) === i.insumoId).nombre : i.nombre || 'Producto', imagen: i.imagen || null,
        cantidad: i.cantidad, precioUnitario: i.precioUnitario, subtotal: Math.round(i.precioUnitario * 100) * i.cantidad / 100 })),
      compradorNombre: coincidente ? venta.compradorNombre : null,
      negocio: { nombre: empresa?.nombre || 'LadyBarberApp', direccion: empresa?.direccion || null, telefono: empresa?.telefono || null },
      comprobanteDisponible, recogida: { estado, aprobadoEn: coincidente ? venta.recogida?.aprobadoEn || null : null,
        limiteEn: coincidente ? venta.recogida?.limiteEn || null : null },
      zonaHoraria: process.env.BUSINESS_TIME_ZONE || 'America/Mexico_City' };
  }
}
export default new ComprasService();
