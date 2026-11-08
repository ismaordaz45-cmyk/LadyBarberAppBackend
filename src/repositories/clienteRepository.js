import pool from '../config/database.js';

/**
 * Repositorio para la tabla 'cliente'.
 * Encargado exclusivamente de ejecutar consultas SQL hacia MySQL mediante el pool centralizado.
 */
class ClienteRepository {
  /**
   * Garantiza que exista un registro de cliente asociado al usuario.
   * Si no existe, lo crea automáticamente.
   * @param {number} usuarioId
   * @returns {Promise<number>} ID del cliente en la tabla 'cliente'
   */
  async asegurarCliente(usuarioId) {
    const uid = Number(usuarioId);
    if (!Number.isInteger(uid) || uid < 1) {
      throw new Error('ID de usuario inválido para asegurarCliente');
    }

    const [existentes] = await pool.query(
      'SELECT id FROM cliente WHERE usuarioId = ? LIMIT 1',
      [uid]
    );

    if (existentes.length > 0) {
      return existentes[0].id;
    }

    const [resultado] = await pool.query(
      'INSERT INTO cliente (usuarioId) VALUES (?)',
      [uid]
    );

    return resultado.insertId;
  }

  async findByUsuarioId(usuarioId) {
    const [rows] = await pool.query(
      'SELECT id FROM cliente WHERE usuarioId = ? LIMIT 1',
      [usuarioId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async getResumenCliente(usuarioId) {
    const query = `
      SELECT
        u.id,
        u.nombre,
        u.apellidoPaterno,
        u.apellidoMaterno,
        u.correo,
        u.telefono,
        u.rol,
        c.id AS clienteId
      FROM usuario u
      LEFT JOIN cliente c ON c.usuarioId = u.id
      WHERE u.id = ?
      LIMIT 1
    `;
    const [rows] = await pool.query(query, [usuarioId]);
    return rows.length > 0 ? rows[0] : null;
  }

  async actualizarPerfilPorUsuarioId(usuarioId, {
    nombre,
    apellidoPaterno,
    apellidoMaterno,
    telefono,
  }) {
    const [result] = await pool.query(
      `UPDATE usuario u
       INNER JOIN cliente c ON c.usuarioId = u.id
          SET u.nombre = ?,
              u.apellidoPaterno = ?,
              u.apellidoMaterno = ?,
              u.telefono = ?
        WHERE u.id = ?
          AND u.rol = 'CLIENTE'
          AND u.estaActivo = 1`,
      [nombre, apellidoPaterno, apellidoMaterno, telefono, usuarioId]
    );

    if (result.affectedRows > 0) return true;

    // MySQL puede reportar cero filas afectadas cuando los valores no cambian.
    const [rows] = await pool.query(
      `SELECT u.id
         FROM usuario u
         INNER JOIN cliente c ON c.usuarioId = u.id
        WHERE u.id = ?
          AND u.rol = 'CLIENTE'
          AND u.estaActivo = 1
        LIMIT 1`,
      [usuarioId]
    );
    return rows.length > 0;
  }

  async getEstadisticasCitas(clienteId) {
    const query = `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN estado IN ('APARTADA','CONFIRMADA','EN_PROCESO') THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN estado = 'COMPLETADA' THEN 1 ELSE 0 END) AS completadas
      FROM cita
      WHERE clienteId = ?
    `;
    const [rows] = await pool.query(query, [clienteId]);
    return rows[0] || { total: 0, pendientes: 0, completadas: 0 };
  }

  async getProximaCita(clienteId) {
    const query = `
      SELECT
        id,
        fecha,
        horaInicio,
        horaFin,
        estado,
        precioFinal
      FROM cita
      WHERE clienteId = ?
        AND estado IN ('APARTADA','CONFIRMADA')
        AND DATE(fecha) >= CURDATE()
      ORDER BY fecha ASC, horaInicio ASC
      LIMIT 1
    `;
    const [rows] = await pool.query(query, [clienteId]);
    return rows.length > 0 ? rows[0] : null;
  }
}

export default new ClienteRepository();
