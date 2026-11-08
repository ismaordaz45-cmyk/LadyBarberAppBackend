import pool from '../config/database.js';

const tableExists = async (connection, tableName) => {
  const [rows] = await connection.query(
    `SELECT 1
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
};

const getVentasOnlineReference = async (connection) => {
  const [rows] = await connection.query(
    `SELECT REFERENCED_TABLE_NAME AS referencedTable
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ventas_online'
        AND COLUMN_NAME = 'cliente_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
      LIMIT 1`
  );
  return rows[0]?.referencedTable || null;
};

export class CuentaRepository {
  async findDeletionCredentials(usuarioId) {
    const [rows] = await pool.query(
      `SELECT id, correo, password, rol, estaActivo
         FROM usuario
        WHERE id = ?
        LIMIT 1`,
      [usuarioId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async anonymizeOwnAccount({
    usuarioId,
    correoOriginal,
    correoAnonimo,
    passwordHash,
  }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [usuarios] = await connection.query(
        `SELECT id, rol, estaActivo
           FROM usuario
          WHERE id = ?
          FOR UPDATE`,
        [usuarioId]
      );
      const usuario = usuarios[0];
      if (!usuario || usuario.estaActivo !== 1 || usuario.rol !== 'CLIENTE') {
        await connection.rollback();
        return null;
      }

      const [clientes] = await connection.query(
        'SELECT id FROM cliente WHERE usuarioId = ? LIMIT 1',
        [usuarioId]
      );
      const clienteId = clientes[0]?.id || null;

      let citasCanceladas = 0;
      if (clienteId && await tableExists(connection, 'cita')) {
        const [result] = await connection.query(
          `UPDATE cita
              SET estado = CASE
                    WHEN estado IN ('APARTADA', 'CONFIRMADA', 'EN_PROCESO') THEN 'CANCELADA'
                    ELSE estado
                  END,
                  notas = NULL
            WHERE clienteId = ?`,
          [clienteId]
        );
        citasCanceladas = result.affectedRows;
      }

      if (await tableExists(connection, 'tokens_temporales')) {
        await connection.query('DELETE FROM tokens_temporales WHERE usuario_id = ?', [usuarioId]);
      }

      let ventasAnonimizadas = 0;
      if (await tableExists(connection, 'ventas_online')) {
        const reference = await getVentasOnlineReference(connection);
        const conditions = ['LOWER(comprador_email) = ?'];
        const params = [correoOriginal.toLowerCase()];
        if (reference === 'usuario') {
          conditions.push('cliente_id = ?');
          params.push(usuarioId);
        } else if (reference === 'cliente' && clienteId) {
          conditions.push('cliente_id = ?');
          params.push(clienteId);
        } else {
          throw new Error(
            'No se puede eliminar la cuenta: ventas_online no tiene una relación verificable con usuario o cliente'
          );
        }

        const [result] = await connection.query(
          `UPDATE ventas_online
              SET comprador_nombre = 'Cuenta eliminada',
                  comprador_email = NULL,
                  comprador_telefono = NULL
            WHERE ${conditions.join(' OR ')}`,
          params
        );
        ventasAnonimizadas = result.affectedRows;
      }

      const [result] = await connection.query(
        `UPDATE usuario
            SET nombre = 'Cuenta',
                apellidoPaterno = 'eliminada',
                apellidoMaterno = NULL,
                correo = ?,
                telefono = NULL,
                password = ?,
                preguntaSecreta = NULL,
                respuestaSecretaHash = NULL,
                estaActivo = 0
          WHERE id = ?
            AND estaActivo = 1`,
        [correoAnonimo, passwordHash, usuarioId]
      );

      if (result.affectedRows !== 1) {
        await connection.rollback();
        return null;
      }

      await connection.commit();
      return { citasCanceladas, ventasAnonimizadas };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default new CuentaRepository();
