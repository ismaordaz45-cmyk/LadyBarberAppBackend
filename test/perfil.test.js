import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { ClienteService } from '../src/services/clienteService.js';

const createProfile = (overrides = {}) => ({
  id: 7,
  nombre: 'Cliente',
  apellidoPaterno: 'Prueba',
  apellidoMaterno: null,
  correo: 'cliente.perfil@ladybarber.test',
  telefono: '7710000000',
  rol: 'CLIENTE',
  clienteId: 12,
  ...overrides,
});

const createRepository = (overrides = {}) => ({
  getResumenCliente: async () => createProfile(),
  actualizarPerfilPorUsuarioId: async () => true,
  getEstadisticasCitas: async () => ({ total: 0, pendientes: 0, completadas: 0 }),
  getProximaCita: async () => null,
  ...overrides,
});

describe('Perfil del cliente', () => {
  it('protege la actualización cuando no existe una sesión', async () => {
    const response = await request(app)
      .put('/api/cliente/perfil')
      .send({ nombre: 'Cliente' });

    assert.equal(response.status, 401);
    assert.match(response.body.error, /token/i);
  });

  it('normaliza los campos permitidos y devuelve el resumen actualizado', async () => {
    let received;
    const repository = createRepository({
      getResumenCliente: async () => createProfile({
        nombre: received?.nombre ?? 'Cliente',
        apellidoPaterno: received?.apellidoPaterno ?? 'Prueba',
        apellidoMaterno: received?.apellidoMaterno ?? null,
        telefono: received?.telefono ?? '7710000000',
      }),
      actualizarPerfilPorUsuarioId: async (usuarioId, data) => {
        received = { usuarioId, ...data };
        return true;
      },
    });
    const service = new ClienteService(repository);

    const result = await service.actualizarPerfil(7, {
      nombre: '  María   José  ',
      apellidoPaterno: " D'Ávila ",
      apellidoMaterno: '',
      telefono: '+52 (771) 000-0000',
    });

    assert.deepEqual(received, {
      usuarioId: 7,
      nombre: 'María José',
      apellidoPaterno: "D'Ávila",
      apellidoMaterno: null,
      telefono: '+527710000000',
    });
    assert.equal(result.message, 'Perfil actualizado correctamente');
    assert.equal(result.perfil.user.nombre, 'María José');
    assert.equal(result.perfil.user.correo, 'cliente.perfil@ladybarber.test');
  });

  it('rechaza cuerpos vacíos y propiedades que no pueden editarse', async () => {
    let calls = 0;
    const service = new ClienteService(createRepository({
      actualizarPerfilPorUsuarioId: async () => {
        calls += 1;
        return true;
      },
    }));

    await assert.rejects(
      service.actualizarPerfil(7, {}),
      (error) => error.statusCode === 400 && /obligatorios/.test(error.message)
    );
    await assert.rejects(
      service.actualizarPerfil(7, { nombre: 'Cliente', rol: 'PROPIETARIA' }),
      (error) => error.statusCode === 400 && /rol/.test(error.message)
    );
    await assert.rejects(
      service.actualizarPerfil(7, { nombre: 'Cliente', correo: 'otro@example.test' }),
      (error) => error.statusCode === 400 && /correo/.test(error.message)
    );
    assert.equal(calls, 0);
  });

  it('valida nombres y teléfono antes de consultar el repositorio', async () => {
    let reads = 0;
    const service = new ClienteService(createRepository({
      getResumenCliente: async () => {
        reads += 1;
        return createProfile();
      },
    }));

    await assert.rejects(
      service.actualizarPerfil(7, { nombre: '   ' }),
      (error) => error.statusCode === 400 && /nombre/.test(error.message)
    );
    await assert.rejects(
      service.actualizarPerfil(7, { nombre: 'Cliente123' }),
      (error) => error.statusCode === 400 && /caracteres/.test(error.message)
    );
    await assert.rejects(
      service.actualizarPerfil(7, { nombre: 'Cliente', telefono: '12345' }),
      (error) => error.statusCode === 400 && /10 y 15/.test(error.message)
    );
    await assert.rejects(
      service.actualizarPerfil(7, { nombre: 'a'.repeat(121) }),
      (error) => error.statusCode === 400 && /120/.test(error.message)
    );
    assert.equal(reads, 0);
  });

  it('reporta ausencia de cliente sin intentar actualizar', async () => {
    let updates = 0;
    const service = new ClienteService(createRepository({
      getResumenCliente: async () => null,
      actualizarPerfilPorUsuarioId: async () => {
        updates += 1;
        return true;
      },
    }));

    await assert.rejects(
      service.actualizarPerfil(99, { nombre: 'Cliente' }),
      (error) => error.statusCode === 404
    );
    assert.equal(updates, 0);
  });

  it('rechaza una sesión sin identificador válido', async () => {
    const service = new ClienteService(createRepository());

    await assert.rejects(
      service.actualizarPerfil(undefined, { nombre: 'Cliente' }),
      (error) => error.statusCode === 401
    );
  });

  it('detecta si la cuenta cambia durante la actualización', async () => {
    const service = new ClienteService(createRepository({
      actualizarPerfilPorUsuarioId: async () => false,
    }));

    await assert.rejects(
      service.actualizarPerfil(7, { nombre: 'Cliente' }),
      (error) => error.statusCode === 409
    );
  });

  it('propaga un fallo de persistencia para que el middleware responda 500', async () => {
    const databaseError = new Error('Fallo MySQL simulado');
    const service = new ClienteService(createRepository({
      actualizarPerfilPorUsuarioId: async () => {
        throw databaseError;
      },
    }));

    await assert.rejects(
      service.actualizarPerfil(7, { nombre: 'Cliente' }),
      (error) => error === databaseError
    );
  });
});
