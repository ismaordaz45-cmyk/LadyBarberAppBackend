import catalogoRepository from '../repositories/catalogoRepository.js';

class CatalogoController {
  async getServicios(req, res, next) {
    try {
      const servicios = await catalogoRepository.getServicios();
      return res.status(200).json(servicios);
    } catch (error) {
      next(error);
    }
  }

  async getInsumos(req, res, next) {
    try {
      const insumos = await catalogoRepository.getInsumos();
      return res.status(200).json(insumos);
    } catch (error) {
      next(error);
    }
  }

  async getHorarioNegocio(req, res, next) {
    try {
      const dias = await catalogoRepository.getHorarioNegocio();
      // Emulate web backend response format
      return res.status(200).json({ dias });
    } catch (error) {
      next(error);
    }
  }

  async getEmpleadasPorServicio(req, res, next) {
    try {
      const { id } = req.params;
      const servicioId = Number(id);
      if (isNaN(servicioId)) {
        return res.status(400).json({ error: "servicioId inválido" });
      }
      const empleadas = await catalogoRepository.getEmpleadasPorServicio(servicioId);
      return res.status(200).json(empleadas);
    } catch (error) {
      next(error);
    }
  }
}

export default new CatalogoController();
