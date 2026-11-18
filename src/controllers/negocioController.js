import negocioService from '../services/negocioService.js';

export default {
  async obtenerPerfilPublico(req, res, next) {
    try { res.json(await negocioService.obtenerPerfilPublico()); }
    catch (error) { next(error); }
  },
};
