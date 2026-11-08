import authService from '../services/authService.js';

/**
 * Controlador para las peticiones HTTP de autenticación.
 */
class AuthController {
  /**
   * Maneja el inicio de sesión.
   * POST /api/auth/login
   */
  async login(req, res, next) {
    try {
      const { correo, password } = req.body || {};

      const resultado = await authService.login({ correo, password });

      return res.status(200).json({
        message: 'Login correcto',
        token: resultado.token,
        user: resultado.user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Maneja el registro de nuevos usuarios.
   * POST /api/auth/registro
   */
  async registro(req, res, next) {
    try {
      const resultado = await authService.registro(req.body || {});

      return res.status(201).json({
        ok: true,
        message: resultado.message,
        userId: resultado.userId,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Maneja la solicitud de recuperación de contraseña.

   * POST /api/auth/forgot-password
   */
  async forgotPassword(req, res, next) {
    try {
      const { correo } = req.body || {};
      const resultado = await authService.solicitarRecuperacionPassword(correo);

      return res.status(200).json({
        ok: true,
        message: resultado.message,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Maneja el restablecimiento de contraseña mediante token.
   * POST /api/auth/reset-password
   */
  async resetPassword(req, res, next) {
    try {
      const { token, newPassword } = req.body || {};
      const resultado = await authService.restablecerPassword({ token, newPassword });

      return res.status(200).json({
        ok: true,
        message: resultado.message,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();

