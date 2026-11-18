import pool from '../config/database.js';
import { calcularPedido, importeEnCentavos, validarPagoProducto } from '../services/productosPagoDomain.js';
import { crearRegistroRecogida } from '../services/recogidaDomain.js';

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const firmaItems = items => JSON.stringify(items.map(i => [Number(i.insumoId), Number(i.cantidad)]).sort((a, b) => a[0] - b[0]));

export class PedidosRepository {
  constructor(database = pool) { this.pool = database; }

  async transaccion(callback) {
    const c = await this.pool.getConnection();
    try { await c.beginTransaction(); const result = await callback(c); await c.commit(); return result; }
    catch (error) { await c.rollback(); throw error; }
    finally { c.release(); }
  }

  async productos(c, ids, bloquear = false) {
    const [rows] = await c.query(`SELECT id,nombre,precioUnitario,stockActual,estaActivo FROM insumo
      WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id ${bloquear ? 'FOR UPDATE' : ''}`, ids);
    return rows;
  }

  async crear(usuarioId, items) {
    return this.transaccion(async c => {
      // Serializa reintentos del mismo comprador sin agregar columnas al esquema.
      const [usuarios] = await c.query("SELECT id FROM usuario WHERE id=? AND rol='CLIENTE' AND estaActivo=1 FOR UPDATE", [usuarioId]);
      if (!usuarios.length) throw fail(401, 'La cuenta ya no está disponible');
      const calculo = calcularPedido(items, await this.productos(c, items.map(i => i.insumoId), true));
      const [pendientes] = await c.query(`SELECT id,total FROM pedidos WHERE cliente_id=? AND estado='pendiente'
        AND mp_status IN ('mobile_created','mobile_checkout') AND created_at > NOW()-INTERVAL 30 MINUTE ORDER BY id DESC LIMIT 40`, [usuarioId]);
      for (const pendiente of pendientes) {
        if (importeEnCentavos(pendiente.total) !== calculo.totalCentavos) continue;
        const [lineas] = await c.query('SELECT insumo_id AS insumoId,cantidad FROM pedido_items WHERE pedido_id=?', [pendiente.id]);
        if (firmaItems(lineas) === firmaItems(items)) return this.obtener(pendiente.id, usuarioId, c);
      }
      const [result] = await c.query("INSERT INTO pedidos (cliente_id,total,estado,mp_status) VALUES (?,?,'pendiente','mobile_created')", [usuarioId, calculo.totalCentavos / 100]);
      for (const linea of calculo.lineas) {
        await c.query('INSERT INTO pedido_items (pedido_id,insumo_id,cantidad,precio_unitario) VALUES (?,?,?,?)', [result.insertId, linea.insumoId, linea.cantidad, linea.precioCentavos / 100]);
      }
      return this.obtener(result.insertId, usuarioId, c);
    });
  }

  async obtener(id, usuarioId, c = this.pool, bloquear = false) {
    const [rows] = await c.query(`SELECT id,cliente_id AS usuarioId,total,estado,mp_preference_id AS preferenceId,
      mp_payment_id AS paymentId,mp_status AS paymentStatus,created_at AS creadoEn,TIMESTAMPDIFF(SECOND,created_at,NOW()) AS edadSegundos,
      DATE_FORMAT(fecha,'%Y-%m-%d %H:%i:%s') AS fecha FROM pedidos WHERE id=? ${usuarioId === null ? '' : 'AND cliente_id=?'} ${bloquear ? 'FOR UPDATE' : ''}`, usuarioId === null ? [id] : [id, usuarioId]);
    const pedido = rows[0];
    if (!pedido) return null;
    const [items] = await c.query(`SELECT pi.insumo_id AS insumoId,pi.cantidad,pi.precio_unitario AS precioUnitario,
      i.nombre,i.imagen,i.unidad FROM pedido_items pi LEFT JOIN insumo i ON i.id=pi.insumo_id WHERE pi.pedido_id=? ORDER BY pi.insumo_id`, [id]);
    const totalCentavos = importeEnCentavos(pedido.total);
    if (!items.length || items.reduce((sum, i) => sum + importeEnCentavos(i.precioUnitario) * i.cantidad, 0) !== totalCentavos) {
      throw fail(409, 'El detalle del pedido no coincide con su total');
    }
    return { ...pedido, total: totalCentavos / 100, totalCentavos, moneda: 'MXN',
      items: items.map(item => ({ ...item, precioUnitario: importeEnCentavos(item.precioUnitario) / 100 })) };
  }

  async listar(usuarioId, offset) {
    const [rows] = await this.pool.query(`SELECT id,total,estado,mp_status AS paymentStatus,
      DATE_FORMAT(fecha,'%Y-%m-%d %H:%i:%s') AS fecha FROM pedidos WHERE cliente_id=? ORDER BY id DESC LIMIT 6 OFFSET ?`, [usuarioId, offset]);
    return rows.map(row => ({ ...row, total: Number(row.total), moneda: 'MXN' }));
  }

  async conBloqueoPago(id, callback) {
    const c = await this.pool.getConnection();
    const nombre = `ladybarber-productos-${id}`;
    let adquirido = false;
    try {
      const [rows] = await c.query('SELECT GET_LOCK(?,5) AS adquirido', [nombre]);
      adquirido = Number(rows[0].adquirido) === 1;
      if (!adquirido) throw fail(409, 'El pedido está procesando otra solicitud. Consulta su estado');
      return await callback(c);
    } finally {
      try { if (adquirido) await c.query('SELECT RELEASE_LOCK(?)', [nombre]); }
      finally { c.release(); }
    }
  }

  async guardarPreferencia(id, usuarioId, preferenceId, c) {
    const [result] = await c.query(`UPDATE pedidos SET mp_preference_id=?,mp_status='mobile_checkout'
      WHERE id=? AND cliente_id=? AND estado='pendiente' AND mp_payment_id IS NULL AND (mp_preference_id IS NULL OR mp_preference_id=?)`, [preferenceId, id, usuarioId, preferenceId]);
    if (result.affectedRows !== 1) throw fail(409, 'El pedido ya no admite un nuevo pago');
  }

  async aplicarPago(id, pago) {
    return this.transaccion(async c => {
      const pedido = await this.obtener(id, null, c, true);
      if (!pedido) throw fail(404, 'Pedido no encontrado');
      const evidencia = validarPagoProducto(pago, pedido, pago.id);
      // Un evento atrasado nunca degrada una compra ya confirmada.
      if (pedido.paymentId && String(pedido.paymentId) !== evidencia.paymentId) {
        if (['approved','refunded','charged_back','partially_refunded'].includes(pedido.paymentStatus)) {
          if (evidencia.aprobado) throw fail(409, 'El pedido ya tiene otro pago aprobado; requiere revisión');
          return pedido;
        }
      }
      const devolucion = Number(pago.transaction_amount_refunded || 0) > 0;
      const estadoPago = devolucion && evidencia.aprobado ? 'partially_refunded' : evidencia.estado;
      if (pedido.estado === 'pagado') {
        if (['refunded','charged_back','partially_refunded'].includes(estadoPago)) {
          await c.query("UPDATE pedidos SET mp_status=?,estado='cancelado' WHERE id=?", [estadoPago, id]);
        }
        return this.obtener(id, null, c);
      }
      if (['refunded','charged_back','partially_refunded'].includes(pedido.paymentStatus)) return pedido;
      const devuelto = ['refunded','charged_back','partially_refunded'].includes(estadoPago);
      if (pedido.paymentStatus === 'approved' && !evidencia.aprobado && !devuelto) return pedido;
      await c.query("UPDATE pedidos SET mp_payment_id=?,mp_status=?,estado=IF(?,'cancelado',estado) WHERE id=?", [evidencia.paymentId, estadoPago, devuelto, id]);
      if (!evidencia.aprobado || devolucion || pedido.estado === 'cancelado') return this.obtener(id, null, c);
      // Mismo orden de bloqueo usuario → insumos que al crear, incluido el FK de ventas_online.
      const [usuarios] = await c.query('SELECT nombre,apellidoPaterno,apellidoMaterno,correo,telefono FROM usuario WHERE id=? FOR UPDATE', [pedido.usuarioId]);
      const comprador = usuarios[0];
      if (!comprador) return this.obtener(id, null, c);
      const productos = await this.productos(c, pedido.items.map(i => i.insumoId), true);
      const disponibles = new Map(productos.map(p => [Number(p.id), p]));
      // Se conserva el pago aprobado para revisión si ya no puede surtirse. No se confirma recogida ni se vuelve a cobrar.
      if (pedido.items.some(i => ![1,true].includes(disponibles.get(i.insumoId)?.estaActivo) || Number(disponibles.get(i.insumoId)?.stockActual) < i.cantidad)) return this.obtener(id, null, c);
      for (const item of pedido.items) {
        const [result] = await c.query('UPDATE insumo SET stockActual=stockActual-? WHERE id=? AND stockActual>=?', [item.cantidad, item.insumoId, item.cantidad]);
        if (result.affectedRows !== 1) throw fail(409, 'Las existencias cambiaron durante la confirmación');
      }
      const detalle = pedido.items.map(i => ({ id: i.insumoId, nombre: i.nombre, cantidad: i.cantidad,
        precioVenta: i.precioUnitario, pedidoId: id, paymentId: evidencia.paymentId, origen: 'app_movil' }));
      detalle[0].recogida = crearRegistroRecogida(pago.date_approved);
      await c.query(`INSERT INTO ventas_online (cliente_id,comprador_nombre,comprador_email,comprador_telefono,total,detalle) VALUES (?,?,?,?,?,?)`,
        [pedido.usuarioId, [comprador.nombre, comprador.apellidoPaterno, comprador.apellidoMaterno].filter(Boolean).join(' '), comprador.correo, comprador.telefono, pedido.total, JSON.stringify(detalle)]);
      await c.query("UPDATE pedidos SET estado='pagado' WHERE id=?", [id]);
      return this.obtener(id, null, c);
    });
  }
}

export default new PedidosRepository();
