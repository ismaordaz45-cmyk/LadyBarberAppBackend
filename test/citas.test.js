import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CitasService } from '../src/services/citasService.js';
import { getMinimumBookingDate } from '../src/services/citasDomain.js';

const fixedNow = new Date('2026-11-02T15:00:00.000Z');

const createRepository = (overrides = {}) => ({
  reservarCitaAtomica: async (request) => ({ citaId: 'cita-test', request }),
  getOcupacion: async () => [],
  getCitasByCliente: async () => [],
  cancelarCita: async () => 1,
  ...overrides,
});

describe('Reglas de negocio de citas', () => {
  it('calcula dos días hábiles de anticipación', () => {
    assert.equal(
      getMinimumBookingDate(new Date('2026-11-02T15:00:00.000Z'), 'America/Mexico_City'),
      '2026-11-04'
    );
    assert.equal(
      getMinimumBookingDate(new Date('2026-11-06T15:00:00.000Z'), 'America/Mexico_City'),
      '2026-11-10'
    );
    assert.equal(
      getMinimumBookingDate(new Date('2026-11-03T03:00:00Z'), 'America/Mexico_City'),
      '2026-11-04'
    );
  });

  it('normaliza una solicitud válida antes de delegarla al repositorio', async () => {
    let received;
    const repository = createRepository({
      reservarCitaAtomica: async (request) => {
        received = request;
        return { citaId: 'cita-test' };
      },
    });
    const service = new CitasService(repository, () => fixedNow);

    const result = await service.reservarCita({
      clienteId: '4',
      empleadaId: '7',
      fecha: '2026-11-04',
      horaInicio: '09:30',
      serviciosIds: ['2', 5],
    });

    assert.equal(result.citaId, 'cita-test');
    assert.deepEqual(received, {
      clienteId: 4,
      empleadaId: 7,
      fecha: '2026-11-04',
      horaInicio: '09:30:00',
      serviciosIds: [2, 5],
    });
  });

  it('rechaza fechas inválidas o con anticipación insuficiente', async () => {
    const service = new CitasService(createRepository(), () => fixedNow);
    await assert.rejects(
      service.reservarCita({ clienteId: 1, empleadaId: 1, fecha: '2026-11-03', horaInicio: '10:00', serviciosIds: [1] }),
      (error) => error.statusCode === 400 && /anticipación/.test(error.message)
    );
    await assert.rejects(
      service.reservarCita({ clienteId: 1, empleadaId: 1, fecha: '2026-02-30', horaInicio: '10:00', serviciosIds: [1] }),
      (error) => error.statusCode === 400 && /calendario/.test(error.message)
    );
  });

  it('rechaza IDs inválidos, listas vacías y servicios duplicados', async () => {
    const service = new CitasService(createRepository(), () => fixedNow);
    await assert.rejects(
      service.reservarCita({ clienteId: 1, empleadaId: 0, fecha: '2026-11-04', horaInicio: '10:00', serviciosIds: [1] }),
      /empleadaId/
    );
    await assert.rejects(
      service.reservarCita({ clienteId: 1, empleadaId: 1, fecha: '2026-11-04', horaInicio: '10:00', serviciosIds: [] }),
      /al menos un servicio/
    );
    await assert.rejects(
      service.reservarCita({ clienteId: 1, empleadaId: 1, fecha: '2026-11-04', horaInicio: '10:00', serviciosIds: [1, 1] }),
      /duplicados/
    );
  });

  it('valida los parámetros de ocupación sin consultar el repositorio en errores', async () => {
    let calls = 0;
    const service = new CitasService(createRepository({
      getOcupacion: async () => {
        calls += 1;
        return [];
      },
    }));

    await assert.rejects(service.getOcupacion('fecha-invalida', 1), /YYYY-MM-DD/);
    await assert.rejects(service.getOcupacion('2026-11-10', 0), /empleadaId/);
    assert.equal(calls, 0);
    await service.getOcupacion('2026-11-10', 2);
    assert.equal(calls, 1);
  });

  it('solo reporta cancelación cuando el repositorio modificó una cita propia', async () => {
    const successService = new CitasService(createRepository({ cancelarCita: async () => 1 }));
    assert.deepEqual(await successService.cancelarCitaCliente('abc', 1), {
      message: 'Cita cancelada correctamente',
    });

    const missingService = new CitasService(createRepository({ cancelarCita: async () => 0 }));
    await assert.rejects(
      missingService.cancelarCitaCliente('abc', 1),
      (error) => error.statusCode === 404
    );
  });
});
