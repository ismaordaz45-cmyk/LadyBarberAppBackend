import citasRepository from '../repositories/citasRepository.js';
import { createCitasError, normalizeBookingRequest, parseLocalDate } from './citasDomain.js';

export class CitasService {
  constructor(repository = citasRepository, now = () => new Date()) {
    this.repository = repository;
    this.now = now;
  }

  async obtenerCitasCliente(clienteId, offset = 0) {
    const normalizedId = Number(clienteId);
    if (!Number.isInteger(normalizedId) || normalizedId < 1) {
      throw createCitasError(400, 'Falta el ID del cliente');
    }
    const pageOffset = Number(offset);
    if (!Number.isSafeInteger(pageOffset) || pageOffset < 0) throw createCitasError(400, 'Paginación inválida');
    return this.repository.getCitasByCliente(normalizedId, pageOffset);
  }

  async getOcupacion(fecha, empleadaId) {
    parseLocalDate(fecha);
    const normalizedEmployeeId = Number(empleadaId);
    if (!Number.isInteger(normalizedEmployeeId) || normalizedEmployeeId < 1) {
      throw createCitasError(400, 'empleadaId inválido');
    }
    return this.repository.getOcupacion(String(fecha).trim(), normalizedEmployeeId);
  }

  async obtenerDetalleCliente(citaId, clienteId) {
    const id = String(citaId ?? '').trim();
    const clientId = Number(clienteId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      || !Number.isInteger(clientId) || clientId < 1) {
      throw createCitasError(400, 'Identificador de cita o cliente inválido');
    }
    const cita = await this.repository.getDetalleByCliente(id, clientId);
    if (!cita) throw createCitasError(404, 'Cita no encontrada');
    const total = Number(cita.precioFinal);
    const monto = Number(cita.montoPagado);
    const comprobanteDisponible = cita.paymentStatus === 'approved'
      && cita.estadoPagoVerificado === 'approved' && cita.moneda === 'MXN'
      && Boolean(cita.paymentId) && Number.isFinite(total) && total > 0
      && Number.isFinite(monto) && monto > 0 && monto <= total;
    const { estadoPagoVerificado, montoPagado, ...detalle } = cita;
    return {
      ...detalle, comprobanteDisponible,
      anticipoPagado: comprobanteDisponible ? monto : null,
      saldoPendiente: comprobanteDisponible ? Math.round((total - monto) * 100) / 100 : null,
    };
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
