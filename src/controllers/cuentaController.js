import cuentaService from '../services/cuentaService.js';

class CuentaController {
  async eliminarCuenta(req, res, next) {
    try {
      const resultado = await cuentaService.eliminarCuenta({
        usuarioId: req.user?.id,
        rol: req.user?.rol,
        password: req.body?.password,
        confirmacion: req.body?.confirmacion,
      });
      return res.status(200).json({ ok: true, message: resultado.message });
    } catch (error) {
      return next(error);
    }
  }
}

export default new CuentaController();
