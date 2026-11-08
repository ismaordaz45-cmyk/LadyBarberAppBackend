import citasRepository from '../repositories/citasRepository.js';
import { createCitasError, normalizeBookingRequest, parseLocalDate } from './citasDomain.js';

export class CitasService {
  constructor(repository = citasRepository, now = () => new Date()) {
    this.repository = repository;
    this.now = now;
  }

  async obtenerCitasCliente(clienteId) {
    const normalizedId = Number(clienteId);
    if (!Number.isInteger(normalizedId) || normalizedId < 1) {
      throw createCitasError(400, 'Falta el ID del cliente');
    }
    return this.repository.getCitasByCliente(normalizedId);
  }

  async getOcupacion(fecha, empleadaId) {
    parseLocalDate(fecha);
    const normalizedEmployeeId = Number(empleadaId);
    if (!Number.isInteger(normalizedEmployeeId) || normalizedEmployeeId < 1) {
      throw createCitasError(400, 'empleadaId inválido');
    }
    return this.repository.getOcupacion(String(fecha).trim(), normalizedEmployeeId);
  }

  async cancelarCitaCliente(citaId, clienteId) {
    const normalizedClientId = Number(clienteId);
    if (!String(citaId ?? '').trim() || !Number.isInteger(normalizedClientId) || normalizedClientId < 1) {
      throw createCitasError(400, 'Faltan parámetros requeridos');
    }

    const affected = await this.repository.cancelarCita(String(citaId).trim(), normalizedClientId);
    if (affected === 0) {
      throw createCitasError(404, 'Cita no encontrada o no se puede cancelar en este estado');
    }
    return { message: 'Cita cancelada correctamente' };
  }

  async reservarCita(request) {
    const normalizedRequest = normalizeBookingRequest(request, this.now());
    return this.repository.reservarCitaAtomica(normalizedRequest);
  }
}

export default new CitasService();
