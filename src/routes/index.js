import { Router } from 'express';
import authRoutes from './authRoutes.js';
import authController from '../controllers/authController.js';
import catalogoController from '../controllers/catalogoController.js';

const router = Router();

/**
 * Endpoint de comprobación de estado de la API (Health check)
 * GET /api/health
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'API de Lady Barber funcionando correctamente',
    timestamp: new Date().toISOString(),
  });
});

// Módulo de Autenticación
// POST /api/auth/login
router.use('/auth', authRoutes);

// Alias para compatibilidad con el backend web original
// POST /api/login, /api/registro, /api/login/forgot-password, /api/login/reset-password
router.post('/login', (req, res, next) => authController.login(req, res, next));
router.post('/registro', (req, res, next) => authController.registro(req, res, next));
router.post('/login/forgot-password', (req, res, next) => authController.forgotPassword(req, res, next));
router.post('/login/reset-password', (req, res, next) => authController.resetPassword(req, res, next));


// Catálogos públicos (Servicios e Insumos)
router.get('/servicios', (req, res, next) => catalogoController.getServicios(req, res, next));
router.get('/insumos', (req, res, next) => catalogoController.getInsumos(req, res, next));

import horarioNegocioRoutes from './horarioNegocioRoutes.js';
router.use('/horario-negocio', horarioNegocioRoutes);

import empleadasRoutes from './empleadasRoutes.js';
router.use('/empleadas', empleadasRoutes);

// Módulo de Citas (Protegido por token en la definición de su ruta)
import citasRoutes from './citasRoutes.js';
router.use('/citas', citasRoutes);


// Módulo de Perfil de Cliente (Protegido por token)
import clienteRoutes from './clienteRoutes.js';
router.use('/cliente', clienteRoutes);

export default router;
