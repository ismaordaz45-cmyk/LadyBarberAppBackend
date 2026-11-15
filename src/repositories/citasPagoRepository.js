import pool from '../config/database.js';

const paymentError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export class CitasPagoRepository {
  constructor(databasePool = pool) {
    this.pool = databasePool;
  }

  async getAppointmentForPayment(citaId, clienteId) {
    const [rows] = await this.pool.query(
      `SELECT c.id, c.clienteId, c.estado, c.precioFinal, c.creadoEn,
              c.mp_preference_id AS preferenceId, c.mp_payment_id AS paymentId,
              c.mp_status AS paymentStatus, u.correo
         FROM cita c
         INNER JOIN cliente cl ON cl.id = c.clienteId
         INNER JOIN usuario u ON u.id = cl.usuarioId
        WHERE c.id = ? AND c.clienteId = ?
        LIMIT 1`,
      [citaId, clienteId]
    );
    return rows[0] || null;
  }

  async savePreference(citaId, clienteId, preferenceId) {
    const [result] = await this.pool.query(
      `UPDATE cita
          SET mp_preference_id = ?, mp_status = 'pending', actualizadoEn = NOW()
        WHERE id = ? AND clienteId = ? AND estado = 'APARTADA'`,
      [preferenceId, citaId, clienteId]
    );
    if (result.affectedRows !== 1) throw paymentError(409, 'La cita ya no admite pagos');
  }

  async getPaymentStatus(citaId, clienteId) {
    const [rows] = await this.pool.query(
      `SELECT id AS citaId, estado, precioFinal,
              mp_preference_id AS preferenceId,
              mp_payment_id AS paymentId,
              mp_status AS paymentStatus
         FROM cita
        WHERE id = ? AND clienteId = ?
        LIMIT 1`,
      [citaId, clienteId]
    );
    return rows[0] || null;
  }

  async applyVerifiedPayment(payment) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        `SELECT id, estado, precioFinal, mp_payment_id AS paymentId
           FROM cita WHERE id = ? LIMIT 1 FOR UPDATE`,
        [payment.citaId]
      );
      const cita = rows[0];
      if (!cita) throw paymentError(404, 'Cita no encontrada');

      const expectedDeposit = Math.round(Number(cita.precioFinal) * 50) / 100;
      if (payment.currency !== 'MXN' || Math.abs(Number(payment.amount) - expectedDeposit) > 0.001) {
        throw paymentError(409, 'El pago no coincide con el anticipo esperado');
      }
      if (cita.paymentId && String(cita.paymentId) !== String(payment.id)) {
        throw paymentError(409, 'La cita ya está asociada a otro pago');
      }

      const [existing] = await connection.query(
        'SELECT citaId FROM pago_mercado_pago WHERE paymentId = ? LIMIT 1 FOR UPDATE',
        [String(payment.id)]
      );
      if (existing[0] && String(existing[0].citaId) !== payment.citaId) {
        throw paymentError(409, 'El pago ya está asociado a otra cita');
      }

      await connection.query(
        `INSERT INTO pago_mercado_pago
           (citaId, preferenciaId, paymentId, monto, moneda, estado, estadoDetalle,
            metodoPago, tipoPago, fechaAprobacion, rawData)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           estadoDetalle = IF(estado = 'approved', estadoDetalle, VALUES(estadoDetalle)),
           metodoPago = IF(estado = 'approved', metodoPago, VALUES(metodoPago)),
           tipoPago = IF(estado = 'approved', tipoPago, VALUES(tipoPago)),
           fechaAprobacion = IF(estado = 'approved', fechaAprobacion, VALUES(fechaAprobacion)),
           rawData = IF(estado = 'approved', rawData, VALUES(rawData)),
           estado = IF(estado = 'approved', estado, VALUES(estado)),
           actualizadoEn = NOW()`,
        [
          payment.citaId,
          payment.preferenceId,
          String(payment.id),
          payment.amount,
          payment.currency,
          payment.status,
          payment.statusDetail,
          payment.paymentMethod,
          payment.paymentType,
          payment.approvedAt,
          JSON.stringify(payment.rawData),
        ]
      );

      const confirmed = payment.status === 'approved';
      await connection.query(
        `UPDATE cita
            SET estado = IF(?, 'CONFIRMADA', estado),
                mp_payment_id = ?,
                mp_status = IF(mp_status = 'approved', mp_status, ?),
                actualizadoEn = NOW()
          WHERE id = ?`,
        [confirmed, String(payment.id), payment.status, payment.citaId]
      );
      await connection.commit();
      return { confirmed, status: payment.status };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default new CitasPagoRepository();
