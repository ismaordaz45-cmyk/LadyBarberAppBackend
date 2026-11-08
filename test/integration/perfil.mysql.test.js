import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import pool from '../../src/config/database.js';
import {
  dropCuentaTestDatabaseObjects,
  resetCuentaTestDatabase,
} from '../helpers/cuentaTestDb.js';

const correo = 'perfil.cliente@ladybarber.test';
const password = 'Clave-Segura-Perfil-01';
let initialized = false;

before(async () => {
  await resetCuentaTestDatabase();
  initialized = true;
});

after(async () => {
  try {
    if (initialized) await dropCuentaTestDatabaseObjects();
  } finally {
    await pool.end();
  }
});

describe('Integración real del perfil del cliente con MySQL', () => {
  it('actualiza únicamente los datos autorizados del cliente autenticado', async () => {
    const registro = await request(app)
      .post('/api/auth/registro')
      .send({
        nombre: 'Perfil Inicial',
        apellidoPaterno: 'Prueba',
        correo,
        telefono: '7710000000',
        password,
        rol: 'CLIENTE',
      });
    assert.equal(registro.status, 201);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ correo, password });
    assert.equal(login.status, 200);

    const actualizacion = await request(app)
      .put('/api/cliente/perfil')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        nombre: '  María   José  ',
        apellidoPaterno: "D'Ávila",
        apellidoMaterno: 'Prueba',
        telefono: '+52 (771) 000-0000',
      });

    assert.equal(actualizacion.status, 200);
    assert.equal(actualizacion.body.message, 'Perfil actualizado correctamente');
    assert.equal(actualizacion.body.perfil.user.nombre, 'María José');
    assert.equal(actualizacion.body.perfil.user.correo, correo);
    assert.equal(actualizacion.body.perfil.user.telefono, '+527710000000');

    const [rows] = await pool.query(
      `SELECT nombre, apellidoPaterno, apellidoMaterno, correo, telefono, rol
         FROM usuario
        WHERE id = ?`,
      [registro.body.userId]
    );
    assert.deepEqual(rows[0], {
      nombre: 'María José',
      apellidoPaterno: "D'Ávila",
      apellidoMaterno: 'Prueba',
      correo,
      telefono: '+527710000000',
      rol: 'CLIENTE',
    });

    const resumen = await request(app)
      .get('/api/cliente/resumen')
      .set('Authorization', `Bearer ${login.body.token}`);
    assert.equal(resumen.status, 200);
    assert.equal(resumen.body.user.nombre, 'María José');

    const intentoNoAutorizado = await request(app)
      .put('/api/cliente/perfil')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ nombre: 'Cambio bloqueado', rol: 'PROPIETARIA' });
    assert.equal(intentoNoAutorizado.status, 400);

    const [despues] = await pool.query(
      'SELECT nombre, rol FROM usuario WHERE id = ?',
      [registro.body.userId]
    );
    assert.deepEqual(despues[0], { nombre: 'María José', rol: 'CLIENTE' });
  });
});
