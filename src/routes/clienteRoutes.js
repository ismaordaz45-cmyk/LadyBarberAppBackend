import { Router } from 'express';
import clienteController from '../controllers/clienteController.js';
import { verificarToken, verificarRol } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(verificarToken);
router.use(verificarRol('CLIENTE'));

router.get('/resumen', (req, res, next) => clienteController.getResumen(req, res, next));

export default router;
