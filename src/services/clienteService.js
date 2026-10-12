import clienteRepository from '../repositories/clienteRepository.js';

class ClienteService {
  async obtenerResumenPerfil(usuarioId) {
    if (!usuarioId) throw this.createError(400, "ID de usuario requerido");
    
    const perfil = await clienteRepository.getResumenCliente(usuarioId);
    if (!perfil) {
      throw this.createError(404, "Usuario/Cliente no encontrado");
    }
    
    if (!perfil.clienteId) {
      throw this.createError(404, "Este usuario no está registrado como cliente");
    }

    const stats = await clienteRepository.getEstadisticasCitas(perfil.clienteId);
    const proximaCita = await clienteRepository.getProximaCita(perfil.clienteId);

    return {
      user: {
        id: perfil.id,
        nombre: perfil.nombre,
        apellidoPaterno: perfil.apellidoPaterno,
        apellidoMaterno: perfil.apellidoMaterno,
        correo: perfil.correo,
        telefono: perfil.telefono,
        rol: perfil.rol
      },
      clienteId: perfil.clienteId,
      stats: {
        total: Number(stats.total) || 0,
        pendientes: Number(stats.pendientes) || 0,
        completadas: Number(stats.completadas) || 0
      },
      nextCita: proximaCita,
      actualizadoEn: new Date().toISOString()
    };
  }

  createError(status, message) {
    const error = new Error(message);
    error.statusCode = status;
    return error;
  }
}

export default new ClienteService();
