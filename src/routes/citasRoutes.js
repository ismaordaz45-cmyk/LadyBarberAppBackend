import { Router } from 'express';
import citasController from '../controllers/citasController.js';
import { verificarToken, verificarRol } from '../middlewares/authMiddleware.js';

const router = Router();

// Todas las rutas de citas requieren autenticación (y rol CLIENTE en este caso)
router.use(verificarToken);
router.use(verificarRol('CLIENTE'));

router.get('/mis-citas', (req, res, next) => citasController.getMisCitas(req, res, next));
router.patch('/:id/cancelar', (req, res, next) => citasController.cancelarMiCita(req, res, next));
router.delete('/:id', (req, res, next) => citasController.cancelarMiCita(req, res, next)); // alias
router.post('/reservar', (req, res, next) => citasController.reservarCita(req, res, next));
router.post('/', (req, res, next) => citasController.reservarCita(req, res, next)); // alias web
router.get('/ocupacion', (req, res, next) => citasController.getOcupacion(req, res, next));

export default router;
