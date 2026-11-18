import pool from '../config/database.js';
import pedidos from './pedidosRepository.js';

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const json = (alias, path) => `JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(${alias}.detalle),${alias}.detalle,'[]'),'$[0].${path}'))`;
const vinculo = `v.cliente_id=p.cliente_id AND CAST(${json('v','pedidoId')} AS UNSIGNED)=p.id AND ${json('v','origen')}='app_movil'`;

export class ComprasRepository {
  constructor(database = pool, pedidosRepo = pedidos) { this.pool = database; this.pedidos = pedidosRepo; }
  async venta(id, usuarioId, c = this.pool) {
    const [rows] = await c.query(`SELECT id,detalle,comprador_nombre AS compradorNombre,comprador_email AS compradorCorreo FROM ventas_online v
      WHERE v.cliente_id=? AND CAST(${json('v','pedidoId')} AS UNSIGNED)=? AND ${json('v','origen')}='app_movil'
      ORDER BY id LIMIT 2`, [usuarioId, id]);
    if (rows.length !== 1) return null;
    let items;
    try { items = typeof rows[0].detalle === 'string' ? JSON.parse(rows[0].detalle) : rows[0].detalle; } catch { return null; }
    return Array.isArray(items) && items.length ? { ...rows[0], items, recogida: items[0].recogida || null } : null;
  }
  async detalle(id, usuarioId) {
    const pedido = await this.pedidos.obtener(id, usuarioId);
    if (!pedido) return null;
    return { pedido, venta: await this.venta(id, usuarioId) };
  }
  async listar(usuarioId, filtro, cursor) {
    const limite = `STR_TO_DATE(${json('v','recogida.limiteEn')},'%Y-%m-%dT%H:%i:%s.%fZ')`;
    const condiciones = {
      todas: '1=1',
      vigentes: `p.estado='pagado' AND p.mp_status='approved' AND EXISTS(SELECT 1 FROM ventas_online v WHERE ${vinculo} AND ${limite}>UTC_TIMESTAMP(3))`,
      vencidas: `p.estado='pagado' AND p.mp_status='approved' AND EXISTS(SELECT 1 FROM ventas_online v WHERE ${vinculo} AND ${limite}<=UTC_TIMESTAMP(3))`,
    };
    if (!condiciones[filtro]) throw fail(400, 'Filtro de compras inválido');
    const [rows] = await this.pool.query(`SELECT p.id,p.total,p.estado,p.mp_status AS paymentStatus,p.mp_payment_id AS paymentId,
      DATE_FORMAT(p.fecha,'%Y-%m-%d %H:%i:%s') AS fecha,
      (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id=p.id) AS totalProductos,
      (SELECT SUM(cantidad) FROM pedido_items pi WHERE pi.pedido_id=p.id) AS totalUnidades
      FROM pedidos p WHERE p.cliente_id=? AND (p.estado='pagado' OR (p.mp_payment_id IS NOT NULL AND p.mp_status IN ('approved','refunded','charged_back','partially_refunded')))
      ${cursor ? 'AND p.id<?' : ''} AND (${condiciones[filtro]}) ORDER BY p.id DESC LIMIT 4`, cursor ? [usuarioId, cursor] : [usuarioId]);
    const pagina = rows.slice(0, 3);
    if (!pagina.length) return { rows: [], items: [], ventas: [], siguienteCursor: null };
    const ids = pagina.map(p => p.id), placeholders = ids.map(() => '?').join(',');
    const [items] = await this.pool.query(`SELECT pi.pedido_id AS pedidoId,pi.insumo_id AS insumoId,pi.cantidad,pi.precio_unitario AS precioUnitario,i.nombre,i.imagen
      FROM pedido_items pi LEFT JOIN insumo i ON i.id=pi.insumo_id WHERE pi.pedido_id IN (${placeholders})
      AND (SELECT COUNT(*) FROM pedido_items anterior WHERE anterior.pedido_id=pi.pedido_id AND anterior.id<pi.id)<2 ORDER BY pi.pedido_id,pi.id`, ids);
    const [ventas] = await this.pool.query(`SELECT detalle FROM ventas_online v WHERE v.cliente_id=? AND CAST(${json('v','pedidoId')} AS UNSIGNED) IN (${placeholders}) AND ${json('v','origen')}='app_movil'`, [usuarioId, ...ids]);
    return { rows: pagina, items, ventas, siguienteCursor: rows.length > 3 ? pagina.at(-1).id : null };
  }
}
export default new ComprasRepository();
