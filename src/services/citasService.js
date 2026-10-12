import citasRepository from '../repositories/citasRepository.js';
import catalogoRepository from '../repositories/catalogoRepository.js';
import crypto from 'crypto';

class CitasService {
  async obtenerCitasCliente(clienteId) {
    if (!clienteId) throw this.createError(400, "Falta el ID del cliente");
    return await citasRepository.getCitasByCliente(clienteId);
  }

  async getOcupacion(fecha, empleadaId) {
    if (!fecha || !empleadaId) throw this.createError(400, "Faltan parámetros");
    return await citasRepository.getOcupacion(fecha, empleadaId);
  }

  async cancelarCitaCliente(citaId, clienteId) {
    if (!citaId || !clienteId) throw this.createError(400, "Faltan parámetros requeridos");
    
    const affected = await citasRepository.cancelarCita(citaId, clienteId);
    if (affected === 0) {
      throw this.createError(404, "Cita no encontrada o no se puede cancelar en este estado");
    }
    return { message: "Cita cancelada correctamente" };
  }

  async reservarCita({ clienteId, empleadaId, fecha, horaInicio, serviciosIds }) {
    if (!clienteId || !empleadaId || !fecha || !horaInicio || !serviciosIds || serviciosIds.length === 0) {
      throw this.createError(400, "Todos los parámetros son obligatorios y debe seleccionar al menos un servicio");
    }

    // Calcular precio y duración (equivalente a citasReservaHelpers)
    const todosServicios = await catalogoRepository.getServicios();
    let duracionTotal = 0;
    let precioTotal = 0;
    const lineas = [];

    for (const sId of serviciosIds) {
      const servicio = todosServicios.find(s => s.id === sId);
      if (!servicio) {
        throw this.createError(400, `El servicio con ID ${sId} no existe o está inactivo`);
      }
      duracionTotal += servicio.duracion;
      precioTotal += Number(servicio.precio);
      lineas.push({ servicioId: sId, precio: servicio.precio, duracion: servicio.duracion });
    }

    // Formatear fechas para MySQL
    const h = String(horaInicio).trim();
    const timePart = h.length === 5 ? `${h}:00` : h;
    const startDate = new Date(`${fecha}T${timePart}`);
    if (isNaN(startDate.getTime())) {
      throw this.createError(400, "Fecha u horaInicio inválida");
    }

    const endDate = new Date(startDate.getTime() + duracionTotal * 60 * 1000);
    
    const pad = (n) => String(n).padStart(2, "0");
    const toMysqlDateTime = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    
    const horaInicioMysql = toMysqlDateTime(startDate);
    const horaFinMysql = toMysqlDateTime(endDate);
    const fechaMysql = `${fecha} 00:00:00`;

    // En una app completa aquí se verifica la disponibilidad del barbero/empleado. 
    // Para respetar la extracción, lo dejamos listo para insertar:
    const id = crypto.randomUUID();
    
    const citaData = {
      id,
      clienteId,
      empleadaId,
      fecha: fechaMysql,
      horaInicio: horaInicioMysql,
      horaFin: horaFinMysql,
      precioTotal
    };

    await citasRepository.crearCitaConServicios(citaData, lineas);

    return {
      message: "Cita creada correctamente",
      citaId: id,
      duracionTotal,
      precioTotal
    };
  }

  createError(status, message) {
    const error = new Error(message);
    error.statusCode = status;
    return error;
  }
}

export default new CitasService();
