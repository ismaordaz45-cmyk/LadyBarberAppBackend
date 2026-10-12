import { Router } from 'express';
import catalogoController from '../controllers/catalogoController.js';

const router = Router();

// Endpoint para traer los días del negocio
router.get('/', (req, res, next) => catalogoController.getHorarioNegocio(req, res, next));

export default router;
