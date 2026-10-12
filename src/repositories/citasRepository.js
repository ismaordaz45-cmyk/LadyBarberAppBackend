import pool from '../config/database.js';

class CitasRepository {
  async getCitasByCliente(clienteId) {
    const query = `
      SELECT
        c.id,
        DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
        DATE_FORMAT(c.horaInicio, '%Y-%m-%dT%H:%i:%s') AS horaInicio,
        DATE_FORMAT(c.horaFin, '%Y-%m-%dT%H:%i:%s') AS horaFin,
        c.estado,
        c.precioFinal,
        c.creadoEn,
        GROUP_CONCAT(s.nombre ORDER BY cs.id SEPARATOR ", ") AS serviciosLabel,
        GROUP_CONCAT(IFNULL(s.imagenUrl, '') ORDER BY cs.id SEPARATOR ",") AS serviciosImagenes
      FROM cita c
      LEFT JOIN citaservicio cs ON cs.citaId = c.id
      LEFT JOIN servicio s ON s.id = cs.servicioId
      WHERE c.clienteId = ?
      GROUP BY c.id, c.fecha, c.horaInicio, c.horaFin, c.estado, c.precioFinal, c.creadoEn
      ORDER BY c.horaInicio DESC
      LIMIT 40
    `;
    const [rows] = await pool.query(query, [clienteId]);
    return rows;
  }

  async getOcupacion(fecha, empleadaId) {
    const query = `
      SELECT id, 
        DATE_FORMAT(horaInicio, '%Y-%m-%dT%H:%i:%s') AS horaInicio, 
        DATE_FORMAT(horaFin, '%Y-%m-%dT%H:%i:%s') AS horaFin, 
        estado
      FROM cita
      WHERE fecha = ? AND empleadaId = ? AND estado != 'CANCELADA'
    `;
    const [rows] = await pool.query(query, [fecha, empleadaId]);
    return rows;
  }

  async cancelarCita(citaId, clienteId) {
    const query = `
      UPDATE cita
      SET estado = 'CANCELADA', actualizadoEn = NOW()
      WHERE id = ?
        AND clienteId = ?
        AND estado IN ('APARTADA','CONFIRMADA')
    `;
    const [result] = await pool.query(query, [citaId, clienteId]);
    return result.affectedRows;
  }

  async crearCitaConServicios(citaData, serviciosData) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      
      const { id, clienteId, empleadaId, fecha, horaInicio, horaFin, precioTotal } = citaData;
      
      await conn.query(
        `INSERT INTO cita
         (id, clienteId, empleadaId, fecha, horaInicio, horaFin, estado, precioFinal)
         VALUES (?, ?, ?, ?, ?, ?, 'APARTADA', ?)`,
        [id, clienteId, empleadaId, fecha, horaInicio, horaFin, precioTotal]
      );

      for (const s of serviciosData) {
        await conn.query(
          `INSERT INTO citaservicio (citaId, servicioId, precio, duracion)
           VALUES (?, ?, ?, ?)`,
          [id, s.servicioId, s.precio, s.duracion]
        );
      }

      await conn.commit();
      return id;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}

export default new CitasRepository();
