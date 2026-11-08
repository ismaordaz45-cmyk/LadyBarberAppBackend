import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import cuentaRepository from '../repositories/cuentaRepository.js';

const createCuentaError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export class CuentaService {
  constructor(repository = cuentaRepository) {
    this.repository = repository;
  }

  async eliminarCuenta({ usuarioId, rol, password, confirmacion }) {
    const id = Number(usuarioId);
    if (!Number.isInteger(id) || id < 1) {
      throw createCuentaError(401, 'La sesión no contiene un usuario válido');
    }
    if (rol !== 'CLIENTE') {
      throw createCuentaError(403, 'Solo las cuentas de cliente pueden eliminarse desde la aplicación');
    }
    if (confirmacion !== 'ELIMINAR') {
      throw createCuentaError(400, 'Escribe ELIMINAR para confirmar la eliminación de la cuenta');
    }
    if (!password) {
      throw createCuentaError(400, 'La contraseña actual es obligatoria');
    }

    const usuario = await this.repository.findDeletionCredentials(id);
    if (!usuario || usuario.estaActivo !== 1) {
      throw createCuentaError(404, 'La cuenta no existe o ya fue eliminada');
    }
    if (usuario.rol !== 'CLIENTE') {
      throw createCuentaError(403, 'Solo las cuentas de cliente pueden eliminarse desde la aplicación');
    }
    if (!await bcrypt.compare(String(password), usuario.password)) {
      throw createCuentaError(401, 'La contraseña actual es incorrecta');
    }

    const correoAnonimo = `deleted-${randomUUID()}@deleted.invalid`;
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    const result = await this.repository.anonymizeOwnAccount({
      usuarioId: id,
      correoOriginal: usuario.correo,
      correoAnonimo,
      passwordHash,
    });
    if (!result) {
      throw createCuentaError(409, 'La cuenta cambió mientras se procesaba la eliminación');
    }

    return {
      message: 'La cuenta y sus datos personales fueron eliminados correctamente',
    };
  }
}

export default new CuentaService();
