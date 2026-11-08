import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import {
  buildBookingDateRange,
  createCitasError,
  getBusinessDayName,
  timeToMinutes,
  toMysqlDateTime,
} from '../services/citasDomain.js';

export class CitasRepository {
  constructor(databasePool = pool) {
    this.pool = databasePool;
  }

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
        GROUP_CONCAT(s.nombre ORDER BY cs.id SEPARATOR ', ') AS serviciosLabel,
        GROUP_CONCAT(IFNULL(s.imagenUrl, '') ORDER BY cs.id SEPARATOR ',') AS serviciosImagenes
      FROM cita c
      LEFT JOIN citaservicio cs ON cs.citaId = c.id
      LEFT JOIN servicio s ON s.id = cs.servicioId
      WHERE c.clienteId = ?
      GROUP BY c.id, c.fecha, c.horaInicio, c.horaFin, c.estado, c.precioFinal, c.creadoEn
      ORDER BY c.horaInicio DESC
      LIMIT 40
    `;
    const [rows] = await this.pool.query(query, [clienteId]);
    return rows;
  }

  async getOcupacion(fecha, empleadaId) {
    const query = `
      SELECT
        id,
        DATE_FORMAT(horaInicio, '%Y-%m-%dT%H:%i:%s') AS horaInicio,
        DATE_FORMAT(horaFin, '%Y-%m-%dT%H:%i:%s') AS horaFin,
        estado
      FROM cita
      WHERE DATE(fecha) = ?
        AND empleadaId = ?
        AND (
          estado IN ('CONFIRMADA', 'EN_PROCESO', 'COMPLETADA')
          OR (estado = 'APARTADA' AND creadoEn >= NOW() - INTERVAL 30 MINUTE)
        )
      ORDER BY horaInicio ASC
    `;
    const [rows] = await this.pool.query(query, [fecha, empleadaId]);
    return rows;
  }

  async cancelarCita(citaId, clienteId) {
    const query = `
      UPDATE cita
      SET estado = 'CANCELADA', actualizadoEn = NOW()
      WHERE id = ?
        AND clienteId = ?
        AND estado IN ('APARTADA', 'CONFIRMADA')
    `;
    const [result] = await this.pool.query(query, [citaId, clienteId]);
    return result.affectedRows;
  }

  async reservarCitaAtomica({ clienteId, empleadaId, fecha, horaInicio, serviciosIds }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [clientRows] = await connection.query(
        'SELECT id FROM cliente WHERE id = ? LIMIT 1 FOR UPDATE',
        [clienteId]
      );
      if (clientRows.length === 0) throw createCitasError(404, 'Cliente no encontrado');

      // Bloquear la empleada serializa las reservas móviles concurrentes para la misma agenda.
      const [employeeRows] = await connection.query(
        `SELECT e.id
         FROM empleada e
         INNER JOIN usuario u ON u.id = e.usuarioId
         WHERE e.id = ? AND u.rol = 'EMPLEADA' AND u.estaActivo = 1
         LIMIT 1 FOR UPDATE`,
        [empleadaId]
      );
      if (employeeRows.length === 0) throw createCitasError(400, 'Empleada no encontrada o inactiva');

      const placeholders = serviciosIds.map(() => '?').join(',');
      const [serviceRows] = await connection.query(
        `SELECT s.id, s.precio, s.duracionMinutos
         FROM servicio s
         INNER JOIN empleada_servicio es
           ON es.servicioId = s.id AND es.empleadaId = ?
         WHERE s.id IN (${placeholders}) AND s.estaActivo = 1
         FOR UPDATE`,
        [empleadaId, ...serviciosIds]
      );

      const servicesById = new Map(serviceRows.map((row) => [Number(row.id), row]));
      const missingServices = serviciosIds.filter((id) => !servicesById.has(id));
      if (missingServices.length > 0) {
        throw createCitasError(
          400,
          `La empleada no ofrece servicios activos con ID: ${missingServices.join(', ')}`
        );
      }

      const lineas = serviciosIds.map((id) => {
        const row = servicesById.get(id);
        const precio = Number(row.precio);
        const duracion = Number(row.duracionMinutos);
        if (!Number.isFinite(precio) || precio < 0 || !Number.isInteger(duracion) || duracion <= 0) {
          throw createCitasError(400, `El servicio ${id} tiene precio o duración inválidos`);
        }
        return { servicioId: id, precio, duracion };
      });

      const duracionTotal = lineas.reduce((total, line) => total + line.duracion, 0);
      const precioTotal = lineas.reduce((total, line) => total + line.precio, 0);
      const { start, end } = buildBookingDateRange(fecha, horaInicio, duracionTotal);
      const horaInicioMysql = toMysqlDateTime(start);
      const horaFinMysql = toMysqlDateTime(end);

      const [scheduleRows] = await connection.query(
        `SELECT horaApertura, horaCierre, activo
         FROM horario_negocio
         WHERE diaSemana = ?
         ORDER BY id ASC
         LIMIT 1`,
        [getBusinessDayName(fecha)]
      );
      const schedule = scheduleRows[0];
      const openingMinutes = timeToMinutes(schedule?.horaApertura);
      const closingMinutes = timeToMinutes(schedule?.horaCierre);
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = end.getHours() * 60 + end.getMinutes();
      if (
        !schedule
        || Number(schedule.activo) !== 1
        || !Number.isFinite(openingMinutes)
        || !Number.isFinite(closingMinutes)
        || startMinutes < openingMinutes
        || endMinutes > closingMinutes
        || end.toDateString() !== start.toDateString()
      ) {
        throw createCitasError(400, 'El horario solicitado está fuera del horario del negocio');
      }

      const [conflicts] = await connection.query(
        `SELECT id
         FROM cita
         WHERE empleadaId = ?
           AND (
             estado IN ('CONFIRMADA', 'EN_PROCESO', 'COMPLETADA')
             OR (estado = 'APARTADA' AND creadoEn >= NOW() - INTERVAL 30 MINUTE)
           )
           AND horaInicio < ?
           AND horaFin > ?
         LIMIT 1 FOR UPDATE`,
        [empleadaId, horaFinMysql, horaInicioMysql]
      );
      if (conflicts.length > 0) throw createCitasError(409, 'El horario seleccionado ya no está disponible');

      const citaId = randomUUID();
      await connection.query(
        `INSERT INTO cita
         (id, clienteId, empleadaId, fecha, horaInicio, horaFin, estado, notas, precioFinal)
         VALUES (?, ?, ?, ?, ?, ?, 'APARTADA', NULL, ?)`,
        [citaId, clienteId, empleadaId, `${fecha} 00:00:00`, horaInicioMysql, horaFinMysql, precioTotal]
      );

      for (const line of lineas) {
        await connection.query(
          `INSERT INTO citaservicio (citaId, servicioId, precio, duracion)
           VALUES (?, ?, ?, ?)`,
          [citaId, line.servicioId, line.precio, line.duracion]
        );
      }

      await connection.commit();
      return {
        message: 'Cita creada correctamente',
        citaId,
        duracionTotal,
        precioTotal,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default new CitasRepository();
