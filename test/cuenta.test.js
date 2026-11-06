import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import app from '../src/app.js';
import { CuentaService } from '../src/services/cuentaService.js';
import { crearVerificadorCuentaActiva } from '../src/middlewares/authMiddleware.js';

const createResponse = () => {
  const response = { statusCode: 200, body: null };
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (body) => {
    response.body = body;
    return response;
  };
  return response;
};

describe('Eliminación segura de cuenta', () => {
  it('protege el endpoint cuando no existe una sesión', async () => {
    const response = await request(app)
      .delete('/api/auth/cuenta')
      .send({ password: 'no-se-usa', confirmacion: 'ELIMINAR' });

    assert.equal(response.status, 401);
    assert.match(response.body.error, /token/i);
  });

  it('exige confirmación explícita y contraseña actual', async () => {
    const service = new CuentaService({});

    await assert.rejects(
      service.eliminarCuenta({ usuarioId: 1, rol: 'CLIENTE', password: 'Clave', confirmacion: 'eliminar' }),
      (error) => error.statusCode === 400 && /ELIMINAR/.test(error.message)
    );
    await assert.rejects(
      service.eliminarCuenta({ usuarioId: 1, rol: 'CLIENTE', confirmacion: 'ELIMINAR' }),
      (error) => error.statusCode === 400 && /contraseña/.test(error.message)
    );
  });

  it('impide eliminar cuentas administrativas o de empleadas', async () => {
    const service = new CuentaService({});

    await assert.rejects(
      service.eliminarCuenta({ usuarioId: 1, rol: 'PROPIETARIA', password: 'Clave', confirmacion: 'ELIMINAR' }),
      (error) => error.statusCode === 403
    );
  });

  it('rechaza una contraseña incorrecta sin modificar la cuenta', async () => {
    const passwordHash = await bcrypt.hash('Clave-correcta', 4);
    let anonymizeCalls = 0;
    const service = new CuentaService({
      findDeletionCredentials: async () => ({
        id: 7,
        correo: 'cliente@example.test',
        password: passwordHash,
        rol: 'CLIENTE',
        estaActivo: 1,
      }),
      anonymizeOwnAccount: async () => {
        anonymizeCalls += 1;
      },
    });

    await assert.rejects(
      service.eliminarCuenta({
        usuarioId: 7,
        rol: 'CLIENTE',
        password: 'Clave-incorrecta',
        confirmacion: 'ELIMINAR',
      }),
      (error) => error.statusCode === 401
    );
    assert.equal(anonymizeCalls, 0);
  });

  it('delega una anonimización irreversible sin reutilizar datos personales', async () => {
    const passwordHash = await bcrypt.hash('Clave-correcta', 4);
    let received;
    const service = new CuentaService({
      findDeletionCredentials: async () => ({
        id: 7,
        correo: 'cliente@example.test',
        password: passwordHash,
        rol: 'CLIENTE',
        estaActivo: 1,
      }),
      anonymizeOwnAccount: async (data) => {
        received = data;
        return { citasCanceladas: 1, ventasAnonimizadas: 1 };
      },
    });

    const result = await service.eliminarCuenta({
      usuarioId: 7,
      rol: 'CLIENTE',
      password: 'Clave-correcta',
      confirmacion: 'ELIMINAR',
    });

    assert.match(result.message, /eliminados correctamente/);
    assert.equal(received.usuarioId, 7);
    assert.equal(received.correoOriginal, 'cliente@example.test');
    assert.match(received.correoAnonimo, /^deleted-[0-9a-f-]+@deleted\.invalid$/);
    assert.notEqual(received.passwordHash, passwordHash);
    assert.equal(await bcrypt.compare('Clave-correcta', received.passwordHash), false);
  });

  it('rechaza tokens pertenecientes a cuentas inactivas', async () => {
    const middleware = crearVerificadorCuentaActiva({
      findById: async () => ({ id: 5, rol: 'CLIENTE', estaActivo: 0 }),
    });
    const req = { user: { id: 5, rol: 'CLIENTE' } };
    const res = createResponse();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
    assert.match(res.body.error, /no está disponible/);
  });

  it('continúa únicamente cuando la cuenta permanece activa', async () => {
    const middleware = crearVerificadorCuentaActiva({
      findById: async () => ({ id: 5, rol: 'CLIENTE', estaActivo: 1 }),
    });
    const req = { user: { id: 5, rol: 'CLIENTE' } };
    const res = createResponse();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(req.user.rol, 'CLIENTE');
  });
});
