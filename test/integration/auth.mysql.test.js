import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import pool from '../../src/config/database.js';
import {
  cleanupAuthTestData,
  countAuthTestRows,
  initializeTestDatabase,
} from '../helpers/mysqlTestDb.js';

const correoPrueba = 'integracion.mysql@ladybarber.test';
const passwordPrueba = 'Clave-Segura-MVP-01';
let databaseInitialized = false;

before(async () => {
  await initializeTestDatabase();
  databaseInitialized = true;
});

after(async () => {
  try {
    if (databaseInitialized) {
      await cleanupAuthTestData();
      assert.deepEqual(await countAuthTestRows(), { usuarios: 0, clientes: 0 });
    }
  } finally {
    await pool.end();
  }
});

describe('Integración real de autenticación con MySQL', () => {
  it('registra un cliente, persiste el hash y permite iniciar sesión con JWT', async () => {
    try {
      const registro = await request(app)
        .post('/api/auth/registro')
        .send({
          nombre: 'Cliente Integración',
          apellidoPaterno: 'MVP',
          apellidoMaterno: 'CI',
          correo: correoPrueba,
          telefono: '0000000000',
          password: passwordPrueba,
          rol: 'CLIENTE',
          preguntaSecreta: 'Pregunta exclusiva de prueba',
          respuestaSecreta: 'Respuesta exclusiva de prueba',
        });

      assert.equal(registro.status, 201);
      assert.equal(registro.body.ok, true);
      assert.equal(Number.isInteger(registro.body.userId), true);

      const [usuarios] = await pool.query(
        `SELECT id, correo, password, rol, respuestaSecretaHash
         FROM usuario
         WHERE correo = ?`,
        [correoPrueba]
      );

      assert.equal(usuarios.length, 1);
      const usuario = usuarios[0];
      assert.equal(usuario.id, registro.body.userId);
      assert.equal(usuario.correo, correoPrueba);
      assert.equal(usuario.rol, 'CLIENTE');
      assert.notEqual(usuario.password, passwordPrueba);
      assert.match(usuario.password, /^\$2[aby]\$/);
      assert.equal(await bcrypt.compare(passwordPrueba, usuario.password), true);
      assert.notEqual(usuario.respuestaSecretaHash, 'Respuesta exclusiva de prueba');

      const [clientes] = await pool.query(
        'SELECT id, usuarioId FROM cliente WHERE usuarioId = ?',
        [usuario.id]
      );
      assert.equal(clientes.length, 1);
      assert.equal(clientes[0].usuarioId, usuario.id);

      const login = await request(app)
        .post('/api/auth/login')
        .send({ correo: correoPrueba, password: passwordPrueba });

      assert.equal(login.status, 200);
      assert.equal(login.body.message, 'Login correcto');
      assert.equal(typeof login.body.token, 'string');
      assert.equal(login.body.user.id, usuario.id);
      assert.equal(login.body.user.correo, correoPrueba);
      assert.equal(login.body.user.rol, 'CLIENTE');
      assert.equal(Object.hasOwn(login.body.user, 'password'), false);
      assert.equal(Object.hasOwn(login.body.user, 'respuestaSecretaHash'), false);

      const tokenPayload = jwt.verify(login.body.token, process.env.JWT_SECRET);
      assert.equal(tokenPayload.id, usuario.id);
      assert.equal(tokenPayload.correo, correoPrueba);
      assert.equal(tokenPayload.rol, 'CLIENTE');
    } finally {
      await cleanupAuthTestData();
      assert.deepEqual(await countAuthTestRows(), { usuarios: 0, clientes: 0 });
    }
  });
});
