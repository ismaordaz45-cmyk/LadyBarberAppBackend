import negocioRepository from '../repositories/negocioRepository.js';

export class NegocioService {
  constructor(repository = negocioRepository) { this.repository = repository; }
  async obtenerPerfilPublico() {
    const perfil = await this.repository.obtenerPerfilPublico();
    if (!perfil) { const error = new Error('No existe un perfil de negocio activo'); error.statusCode = 404; throw error; }
    return perfil;
  }
}
export default new NegocioService();
