import clienteRepository from '../repositories/clienteRepository.js';

const allowedProfileFields = new Set([
  'nombre',
  'apellidoPaterno',
  'apellidoMaterno',
  'telefono',
]);

const createClienteError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeName = (value, field, { required = false } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw createClienteError(400, `${field} es obligatorio`);
    return null;
  }
  if (typeof value !== 'string') {
    throw createClienteError(400, `${field} debe ser texto`);
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    if (required) throw createClienteError(400, `${field} es obligatorio`);
    return null;
  }
  if (normalized.length > 120) {
    throw createClienteError(400, `${field} no puede superar 120 caracteres`);
  }
  if (!/^[\p{L}\p{M} .'’-]+$/u.test(normalized)) {
    throw createClienteError(400, `${field} contiene caracteres no permitidos`);
  }
  return normalized;
};

const normalizePhone = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw createClienteError(400, 'telefono debe ser texto');
  }

  const compact = value.trim().replace(/[\s().-]/g, '');
  if (!compact) return null;
  if (!/^\+?[0-9]{10,15}$/.test(compact)) {
    throw createClienteError(
      400,
      'telefono debe contener entre 10 y 15 dígitos y puede iniciar con +'
    );
  }
  return compact;
};

export class ClienteService {
  constructor(repository = clienteRepository) {
    this.repository = repository;
  }

  async obtenerResumenPerfil(usuarioId) {
    const id = Number(usuarioId);
    if (!Number.isInteger(id) || id < 1) {
      throw createClienteError(400, 'ID de usuario requerido');
    }

    const perfil = await this.repository.getResumenCliente(id);
    if (!perfil) {
      throw createClienteError(404, 'Usuario/Cliente no encontrado');
    }
    if (!perfil.clienteId) {
      throw createClienteError(404, 'Este usuario no está registrado como cliente');
    }

    const stats = await this.repository.getEstadisticasCitas(perfil.clienteId);
    const proximaCita = await this.repository.getProximaCita(perfil.clienteId);

    return {
      user: {
        id: perfil.id,
        nombre: perfil.nombre,
        apellidoPaterno: perfil.apellidoPaterno,
        apellidoMaterno: perfil.apellidoMaterno,
        correo: perfil.correo,
        telefono: perfil.telefono,
        rol: perfil.rol,
      },
      clienteId: perfil.clienteId,
      stats: {
        total: Number(stats.total) || 0,
        pendientes: Number(stats.pendientes) || 0,
        completadas: Number(stats.completadas) || 0,
      },
      nextCita: proximaCita,
      actualizadoEn: new Date().toISOString(),
    };
  }

  async actualizarPerfil(usuarioId, datos) {
    const id = Number(usuarioId);
    if (!Number.isInteger(id) || id < 1) {
      throw createClienteError(401, 'La sesión no contiene un usuario válido');
    }
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
      throw createClienteError(400, 'Los datos del perfil son obligatorios');
    }

    const fields = Object.keys(datos);
    if (fields.length === 0) {
      throw createClienteError(400, 'Los datos del perfil son obligatorios');
    }
    const unexpectedFields = fields.filter((field) => !allowedProfileFields.has(field));
    if (unexpectedFields.length > 0) {
      throw createClienteError(
        400,
        `No se permite modificar: ${unexpectedFields.join(', ')}`
      );
    }

    const normalized = {
      nombre: normalizeName(datos.nombre, 'nombre', { required: true }),
      apellidoPaterno: normalizeName(datos.apellidoPaterno, 'apellidoPaterno'),
      apellidoMaterno: normalizeName(datos.apellidoMaterno, 'apellidoMaterno'),
      telefono: normalizePhone(datos.telefono),
    };

    const currentProfile = await this.repository.getResumenCliente(id);
    if (!currentProfile || !currentProfile.clienteId) {
      throw createClienteError(404, 'Usuario/Cliente no encontrado');
    }

    const updated = await this.repository.actualizarPerfilPorUsuarioId(id, normalized);
    if (!updated) {
      throw createClienteError(409, 'El perfil cambió mientras se procesaba la actualización');
    }

    return {
      message: 'Perfil actualizado correctamente',
      perfil: await this.obtenerResumenPerfil(id),
    };
  }
}

export default new ClienteService();
