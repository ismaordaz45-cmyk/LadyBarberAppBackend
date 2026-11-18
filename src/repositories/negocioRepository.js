import pool from '../config/database.js';

export default {
  async obtenerPerfilPublico() {
    const [rows] = await pool.query(`SELECT id, nombre, logo, direccion, ubicacion, telefono, horarioAtencion
      FROM perfil_empresa WHERE activo = 1 ORDER BY id ASC LIMIT 1`);
    return rows[0] ?? null;
  },
};
