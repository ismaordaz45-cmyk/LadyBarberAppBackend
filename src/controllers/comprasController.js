import service from '../services/comprasService.js';
export class ComprasController {
  constructor(compras = service) { this.service = compras; }
  listar = async (req, res, next) => { try { res.set('Cache-Control','no-store').json(await this.service.listar(req.user.id, req.query.filtro || 'todas', req.query.cursor)); } catch (e) { next(e); } };
  detalle = async (req, res, next) => { try { res.set('Cache-Control','no-store').json(await this.service.detalle(req.params.id, req.user.id)); } catch (e) { next(e); } };
}
export default new ComprasController();
