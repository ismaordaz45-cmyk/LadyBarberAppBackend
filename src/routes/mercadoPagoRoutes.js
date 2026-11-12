import { Router } from 'express';
import citasPagoController from '../controllers/citasPagoController.js';

const router = Router();

// Mercado Pago no envía JWT: la autenticidad se comprueba con x-signature.
router.post('/webhook', (req, res, next) => citasPagoController.webhook(req, res, next));
router.get('/retorno/:status', (req, res) => citasPagoController.retorno(req, res));

export default router;
