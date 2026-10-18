import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { verificarToken, verificarRol } from '../src/middlewares/authMiddleware.js';
import jwt from 'jsonwebtoken';

describe('Pruebas Unitarias de Autenticación y API (Backend)', () => {
  describe('GET /api/health (Endpoint de estado)', () => {
    it('debe responder 200 con estado ok', async () => {
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.equal(typeof res.body.timestamp, 'string');
    });
  });

  describe('Manejo de rutas no encontradas (404)', () => {
    it('debe responder 404 para una ruta inexistente', async () => {
      const res = await request(app).get('/api/ruta-que-no-existe-xyz');
      assert.equal(res.status, 404);
      assert.equal(res.body.status, 'error');
    });
  });

  describe('POST /api/auth/login - Validaciones de entrada', () => {
    it('debe retornar 400 si no se envían correo ni contraseña', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.message.includes('obligatorios'));
    });

    it('debe retornar 400 si falta la contraseña', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ correo: 'test@ladybarber.com' });
      assert.equal(res.status, 400);
      assert.ok(res.body.message.includes('obligatorios'));
    });

    it('debe retornar 400 si falta el correo', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'secretpassword' });
      assert.equal(res.status, 400);
      assert.ok(res.body.message.includes('obligatorios'));
    });
  });

  describe('POST /api/registro - Validaciones de entrada', () => {
    it('debe retornar 400 si faltan datos requeridos de registro', async () => {
      const res = await request(app)
        .post('/api/registro')
        .send({ nombre: 'Solo Nombre' });
      assert.equal(res.status, 400);
      assert.ok(res.body.message);
    });
  });

  describe('POST /api/login/forgot-password - Validaciones', () => {
    it('debe retornar 400 si no se proporciona el correo', async () => {
      const res = await request(app)
        .post('/api/login/forgot-password')
        .send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.message.includes('correo'));
    });
  });

  describe('POST /api/login/reset-password - Validaciones', () => {
    it('debe retornar 400 si faltan el token o la nueva contraseña', async () => {
      const res = await request(app)
        .post('/api/login/reset-password')
        .send({ token: 'abc' });
      assert.equal(res.status, 400);
      assert.ok(res.body.message.includes('obligatorios'));
    });
  });

  describe('Middleware de Autenticación: verificarToken', () => {
    it('debe rechazar con 401 si no hay header Authorization', () => {
      const req = { headers: {} };
      let statusValue = 0;
      let jsonValue = {};
      const res = {
        status: (s) => {
          statusValue = s;
          return {
            json: (j) => {
              jsonValue = j;
            },
          };
        },
      };
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      verificarToken(req, res, next);
      assert.equal(statusValue, 401);
      assert.equal(nextCalled, false);
      assert.ok(jsonValue.error.includes('No se proporcionó'));
    });

    it('debe rechazar con 401 si el header no empieza con Bearer', () => {
      const req = { headers: { authorization: 'Basic 123456' } };
      let statusValue = 0;
      const res = {
        status: (s) => {
          statusValue = s;
          return { json: () => {} };
        },
      };
      let nextCalled = false;
      verificarToken(req, res, () => { nextCalled = true; });
      assert.equal(statusValue, 401);
      assert.equal(nextCalled, false);
    });

    it('debe rechazar con 401 si el token es inválido o manipulado', () => {
      process.env.JWT_SECRET = 'secreto_de_prueba_ci';
      const req = { headers: { authorization: 'Bearer token_invalido_falso' } };
      let statusValue = 0;
      let jsonValue = {};
      const res = {
        status: (s) => {
          statusValue = s;
          return {
            json: (j) => {
              jsonValue = j;
            },
          };
        },
      };
      let nextCalled = false;
      verificarToken(req, res, () => { nextCalled = true; });
      assert.equal(statusValue, 401);
      assert.equal(nextCalled, false);
      assert.equal(jsonValue.error, 'Token inválido');
    });

    it('debe permitir el paso (next) y decodificar el usuario si el token es válido', () => {
      process.env.JWT_SECRET = 'secreto_de_prueba_ci';
      const payloadEsperado = { id: 42, correo: 'barber@ladybarber.com', rol: 'ADMIN' };
      const token = jwt.sign(payloadEsperado, process.env.JWT_SECRET, { expiresIn: '1h' });

      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = {};
      let nextCalled = false;
      verificarToken(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.user.id, 42);
      assert.equal(req.user.correo, 'barber@ladybarber.com');
      assert.equal(req.user.rol, 'ADMIN');
    });
  });

  describe('Middleware de Roles: verificarRol', () => {
    it('debe rechazar con 403 si el rol del usuario no coincide', () => {
      const req = { user: { id: 1, rol: 'CLIENTE' } };
      let statusValue = 0;
      const res = {
        status: (s) => {
          statusValue = s;
          return { json: () => {} };
        },
      };
      let nextCalled = false;
      const middleware = verificarRol('ADMIN');
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(statusValue, 403);
      assert.equal(nextCalled, false);
    });

    it('debe llamar a next() si el rol coincide', () => {
      const req = { user: { id: 1, rol: 'ADMIN' } };
      const res = {};
      let nextCalled = false;
      const middleware = verificarRol('ADMIN');
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, true);
    });
  });
});
