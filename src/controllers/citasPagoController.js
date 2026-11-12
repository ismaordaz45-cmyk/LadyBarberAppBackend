import clienteRepository from '../repositories/clienteRepository.js';
import citasPagoService from '../services/citasPagoService.js';

const controllerError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export class CitasPagoController {
  constructor(service = citasPagoService, clientes = clienteRepository) {
    this.service = service;
    this.clientes = clientes;
  }

  async getClienteId(req) {
    if (!req.user?.id) throw controllerError(401, 'No autorizado');
    const cliente = await this.clientes.findByUsuarioId(req.user.id);
    if (!cliente) throw controllerError(404, 'Cliente no encontrado para este usuario');
    return cliente.id;
  }

  async crearPreferencia(req, res, next) {
    try {
      const clienteId = await this.getClienteId(req);
      const result = await this.service.createPreference(req.params.id, clienteId);
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async obtenerEstado(req, res, next) {
    try {
      const clienteId = await this.getClienteId(req);
      return res.json(await this.service.getPaymentStatus(req.params.id, clienteId));
    } catch (error) {
      return next(error);
    }
  }

  async webhook(req, res, next) {
    try {
      const dataId = req.query['data.id'] || req.body?.data?.id || req.query.id;
      if (!dataId) throw controllerError(400, 'Notificación sin identificador de pago');
      await this.service.processWebhook({
        signature: req.get('x-signature'),
        requestId: req.get('x-request-id'),
        dataId: String(dataId),
        type: req.query.type || req.body?.type,
      });
      return res.sendStatus(200);
    } catch (error) {
      return next(error);
    }
  }

  retorno(req, res) {
    const messages = {
      aprobado: 'Pago aprobado. Regresa a LadyBarberApp para consultar tu cita.',
      pendiente: 'Pago pendiente. Regresa a LadyBarberApp para consultar el estado.',
      fallido: 'El pago no fue aprobado. Regresa a LadyBarberApp para intentarlo nuevamente.',
    };
    const message = messages[req.params.status];
    if (!message) return res.status(404).send('Retorno no encontrado');
    res.type('html').send(`<!doctype html><html lang="es"><meta charset="utf-8"><title>LadyBarberApp</title><body><h1>LadyBarberApp</h1><p>${message}</p></body></html>`);
  }
}

export default new CitasPagoController();
