import { Router } from 'express';
import authController from '../controllers/authController.js';

const router = Router();

/**
 * Endpoint para inicio de sesión de usuarios.
 * POST /api/auth/login
 */
router.post('/login', (req, res, next) => authController.login(req, res, next));

/**
 * Endpoint para registro de nuevos usuarios.
 * POST /api/auth/registro
 */
router.post('/registro', (req, res, next) => authController.registro(req, res, next));

/**
 * Endpoint para solicitud de recuperación de contraseña.
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', (req, res, next) => authController.forgotPassword(req, res, next));

/**
 * Endpoint para restablecimiento de contraseña mediante token.
 * POST /api/auth/reset-password
 */
router.post('/reset-password', (req, res, next) => authController.resetPassword(req, res, next));

export default router;

