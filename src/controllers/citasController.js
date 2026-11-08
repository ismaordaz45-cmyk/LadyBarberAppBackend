import citasService from '../services/citasService.js';
import clienteRepository from '../repositories/clienteRepository.js';

class CitasController {
  
  /**
   * Obtiene la ID de cliente real basándose en el usuarioId del token JWT.
   */
  async _getClienteIdPorUsuario(usuarioId) {
    const cliente = await clienteRepository.findByUsuarioId(usuarioId);
    if (!cliente) throw this._createError(404, "Cliente no encontrado para este usuario");
    return cliente.id;
  }

  _createError(status, message) {
    const error = new Error(message);
    error.statusCode = status;
    return error;
  }

  async getMisCitas(req, res, next) {
    try {
      const usuarioId = req.user?.id; // Inyectado por el middleware de auth
      if (!usuarioId) return res.status(401).json({ error: "No autorizado" });

      const clienteId = await this._getClienteIdPorUsuario(usuarioId);
      const citas = await citasService.obtenerCitasCliente(clienteId);
      
      return res.json(citas);
    } catch (error) {
      next(error);
    }
  }

  async getOcupacion(req, res, next) {
    try {
      const { fecha, empleadaId } = req.query;
      const citas = await citasService.getOcupacion(fecha, empleadaId);
      return res.json(citas);
    } catch (error) {
      next(error);
    }
  }

  async cancelarMiCita(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioId = req.user?.id;
      if (!usuarioId) return res.status(401).json({ error: "No autorizado" });

      const clienteId = await this._getClienteIdPorUsuario(usuarioId);
      const result = await citasService.cancelarCitaCliente(id, clienteId);

      return res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async reservarCita(req, res, next) {
    try {
      const usuarioId = req.user?.id;
      if (!usuarioId) return res.status(401).json({ error: "No autorizado" });

      const clienteId = await this._getClienteIdPorUsuario(usuarioId);
      const { empleadaId, fecha, horaInicio, servicios } = req.body;

      const result = await citasService.reservarCita({
        clienteId,
        empleadaId,
        fecha,
        horaInicio,
        serviciosIds: servicios
      });

      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

// Para mantener el _getClienteId bound correctamente al controller
export default new CitasController();
