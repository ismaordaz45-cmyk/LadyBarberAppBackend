import service from '../services/pedidosService.js';

export class PedidosController {
  constructor(pedidos = service) { this.service = pedidos; }
  crear = async (req, res, next) => { try { res.status(201).json(await this.service.crear(req.user.id, req.body?.items)); } catch (e) { next(e); } };
  obtener = async (req, res, next) => { try { res.json(await this.service.obtener(req.params.id, req.user.id)); } catch (e) { next(e); } };
  listar = async (req, res, next) => { try { res.json(await this.service.listar(req.user.id, req.query.offset ?? 0)); } catch (e) { next(e); } };
  preferencia = async (req, res, next) => { try { res.json(await this.service.preferencia(req.params.id, req.user.id)); } catch (e) { next(e); } };
  sincronizar = async (req, res, next) => { try { res.json(await this.service.sincronizar(req.params.id, req.user.id)); } catch (e) { next(e); } };
  cancelar = async (req, res, next) => { try { res.json(await this.service.cancelar(req.params.id, req.user.id)); } catch (e) { next(e); } };
  webhook = async (req, res, next) => {
    try {
      const queryId = req.query['data.id'] || req.query.id;
      if (queryId && req.body?.data?.id && String(queryId) !== String(req.body.data.id)) throw Object.assign(new Error('Identificadores de notificación distintos'), { statusCode: 400 });
      await this.service.webhook({ signature: req.get('x-signature'), requestId: req.get('x-request-id'),
        dataId: queryId || req.body?.data?.id, type: req.query.type || req.body?.type || req.query.topic });
      res.sendStatus(200);
    } catch (e) { next(e); }
  };
  retorno = (req, res) => {
    if (!['aprobado','pendiente','fallido'].includes(req.params.estado)) return res.sendStatus(404);
    res.type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LadyBarberApp</title><body><h1>LadyBarberApp</h1><p>Regresa a la app y consulta el estado de tu pedido. La recogida se confirma después de verificar el pago y las existencias.</p></body></html>');
  };
}
export default new PedidosController();
