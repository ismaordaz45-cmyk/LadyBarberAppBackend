import { Router } from 'express';
import controller from '../controllers/comprasController.js';
import { verificarToken, verificarCuentaActiva, verificarRol } from '../middlewares/authMiddleware.js';
const router = Router();
router.use(verificarToken, verificarCuentaActiva, verificarRol('CLIENTE'));
router.get('/', controller.listar);
router.get('/:id', controller.detalle);
export default router;
