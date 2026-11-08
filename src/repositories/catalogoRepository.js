import pool from '../config/database.js';

/**
 * Repositorio para catálogos públicos: servicios e insumos/productos.
 */
class CatalogoRepository {
  /**
   * Obtiene todos los servicios activos.
   */
  async getServicios() {
    const query = `
      SELECT 
        id,
        nombre,
        descripcion,
        precio,
        duracionMinutos AS duracion,
        categoria,
        imagenUrl,
        estaActivo
      FROM servicio
      WHERE estaActivo = 1
      ORDER BY id ASC
    `;
    const [rows] = await pool.query(query);
    return rows;
  }

  /**
   * Obtiene todos los insumos/productos activos.
   */
  async getInsumos() {
    const query = `
      SELECT 
        id,
        nombre,
        descripcion,
        unidad,
        stockActual,
        stockMinimo,
        precioUnitario AS precio,
        estaActivo,
        imagen
      FROM insumo
      WHERE estaActivo = 1
      ORDER BY id ASC
    `;
    const [rows] = await pool.query(query);
    return rows;
  }

  async getHorarioNegocio() {
    const query = `
      SELECT id, diaSemana, horaApertura, horaCierre, activo
      FROM horario_negocio
      ORDER BY id ASC
    `;
    const [rows] = await pool.query(query);
    return rows;
  }

  async getEmpleadasPorServicio(servicioId) {
    const query = `
      SELECT DISTINCT
        e.id,
        u.nombre,
        u.apellidoPaterno AS apellidos,
        e.especialidad
      FROM empleada e
      INNER JOIN usuario u ON e.usuarioId = u.id
      INNER JOIN empleada_servicio es ON e.id = es.empleadaId
      WHERE es.servicioId = ? AND u.rol = 'EMPLEADA' AND u.estaActivo = 1
      ORDER BY u.nombre ASC, u.apellidoPaterno ASC
    `;
    const [rows] = await pool.query(query, [servicioId]);
    return rows;
  }
}

export default new CatalogoRepository();
