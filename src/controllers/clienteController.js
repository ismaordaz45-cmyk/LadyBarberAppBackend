import clienteService from '../services/clienteService.js';

class ClienteController {
  async getResumen(req, res, next) {
    try {
      const usuarioId = req.user?.id;
      if (!usuarioId) return res.status(401).json({ error: "No autorizado" });

      const resumen = await clienteService.obtenerResumenPerfil(usuarioId);
      
      return res.json(resumen);
    } catch (error) {
      next(error);
    }
  }
}

export default new ClienteController();
