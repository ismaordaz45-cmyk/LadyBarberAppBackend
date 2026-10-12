import { Router } from 'express';
import catalogoController from '../controllers/catalogoController.js';

const router = Router();

// GET /api/empleadas/por-servicio/:id
router.get('/por-servicio/:id', (req, res, next) => catalogoController.getEmpleadasPorServicio(req, res, next));

export default router;
