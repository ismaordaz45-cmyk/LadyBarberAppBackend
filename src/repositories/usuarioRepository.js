import pool from '../config/database.js';

/**
 * Repositorio para la tabla 'usuario'.
 * Encargado exclusivamente de ejecutar consultas SQL hacia MySQL mediante el pool centralizado.
 */
class UsuarioRepository {
  /**
   * Busca un usuario por su correo electrónico.
   * @param {string} correo
   * @returns {Promise<object|null>} Usuario encontrado o null si no existe
   */
  async findByCorreo(correo) {
    const query = `
      SELECT 
        id,
        nombre,
        apellidoPaterno,
        apellidoMaterno,
        correo,
        telefono,
        password,
        rol,
        estaActivo
      FROM usuario
      WHERE correo = ?
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [correo]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Busca un usuario por su ID.
   * @param {number} id
   * @returns {Promise<object|null>} Usuario encontrado o null si no existe
   */
  async findById(id) {
    const query = `
      SELECT 
        id,
        nombre,
        apellidoPaterno,
        apellidoMaterno,
        correo,
        telefono,
        rol,
        estaActivo
      FROM usuario
      WHERE id = ?
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Crea un nuevo usuario en la base de datos.
   * @param {object} usuarioData
   * @returns {Promise<number>} ID del usuario insertado
   */
  async create({
    nombre,
    apellidoPaterno,
    apellidoMaterno,
    correo,
    telefono,
    password,
    rol = 'CLIENTE',
    preguntaSecreta,
    respuestaSecretaHash,
  }) {
    const query = `
      INSERT INTO usuario (
        nombre,
        apellidoPaterno,
        apellidoMaterno,
        correo,
        telefono,
        password,
        rol,
        preguntaSecreta,
        respuestaSecretaHash,
        estaActivo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `;

    const [result] = await pool.query(query, [
      nombre,
      apellidoPaterno || null,
      apellidoMaterno || null,
      correo,
      telefono || null,
      password,
      rol,
      preguntaSecreta || null,
      respuestaSecretaHash || null,
    ]);

    return result.insertId;
  }

  /**
   * Actualiza la contraseña de un usuario por su ID.
   * @param {number} id
   * @param {string} passwordHash
   * @returns {Promise<boolean>}
   */
  async updatePassword(id, passwordHash) {
    const query = `
      UPDATE usuario
      SET password = ?
      WHERE id = ?
        AND estaActivo = 1
    `;

    const [result] = await pool.query(query, [passwordHash, id]);
    return result.affectedRows > 0;
  }
}

export default new UsuarioRepository();

