import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import pool from '../../src/config/database.js';
import {
  dropCuentaTestDatabaseObjects,
  resetCuentaTestDatabase,
} from '../helpers/cuentaTestDb.js';

const correo = 'eliminar.cuenta@ladybarber.test';
const password = 'Clave-Segura-Eliminacion-01';
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

describe('Integración real de eliminación de cuenta con MySQL', () => {
  it('anonimiza datos personales, cancela citas y revoca el acceso', async () => {
    const registro = await request(app)
      .post('/api/auth/registro')
      .send({
        nombre: 'Cliente Eliminación',
        apellidoPaterno: 'Prueba',
        apellidoMaterno: 'CI',
        correo,
        telefono: '0000000000',
        password,
        rol: 'CLIENTE',
        preguntaSecreta: 'Pregunta ficticia',
        respuestaSecreta: 'Respuesta ficticia',
      });
    assert.equal(registro.status, 201);

    const [clientes] = await pool.query(
      'SELECT id FROM cliente WHERE usuarioId = ?',
      [registro.body.userId]
    );
    const clienteId = clientes[0].id;

    const passwordEmpleada = await bcrypt.hash('empleada-test', 4);
    const [empleadaUsuario] = await pool.query(
      `INSERT INTO usuario
        (nombre, correo, password, rol, estaActivo)
       VALUES ('Empleada', 'empleada.eliminacion@ladybarber.test', ?, 'EMPLEADA', 1)`,
      [passwordEmpleada]
    );
    const [empleada] = await pool.query(
      'INSERT INTO empleada (usuarioId, especialidad) VALUES (?, ?)',
      [empleadaUsuario.insertId, 'Pruebas']
    );

    await pool.query(
      `INSERT INTO cita
        (id, clienteId, empleadaId, fecha, horaInicio, horaFin, estado, notas, precioFinal)
       VALUES ('cuenta-test-cita', ?, ?, '2026-12-10 10:00:00',
               '2026-12-10 10:00:00', '2026-12-10 11:00:00',
               'CONFIRMADA', 'Dato personal que debe borrarse', 300.00)`,
      [clienteId, empleada.insertId]
    );
    await pool.query(
      `INSERT INTO tokens_temporales
        (token, rol, usuario_id, creado_en, expira_en, usado)
       VALUES ('token-eliminacion', 'CLIENTE', ?, 1, 2, 0)`,
      [registro.body.userId]
    );
    await pool.query(
      `INSERT INTO ventas_online
        (cliente_id, comprador_nombre, comprador_email, comprador_telefono, total, detalle)
       VALUES (?, 'Cliente Eliminación', ?, '0000000000', 450.00, JSON_OBJECT('producto', 'ficticio'))`,
      [clienteId, correo]
    );

    const login = await request(app)
      .post('/api/auth/login')
      .send({ correo, password });
    assert.equal(login.status, 200);

    const eliminacion = await request(app)
      .delete('/api/auth/cuenta')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ password, confirmacion: 'ELIMINAR' });
    assert.equal(eliminacion.status, 200);
    assert.equal(eliminacion.body.ok, true);

    const [usuarios] = await pool.query(
      `SELECT nombre, apellidoPaterno, apellidoMaterno, correo, telefono,
              password, preguntaSecreta, respuestaSecretaHash, estaActivo
         FROM usuario
        WHERE id = ?`,
      [registro.body.userId]
    );
    const usuario = usuarios[0];
    assert.equal(usuario.nombre, 'Cuenta');
    assert.equal(usuario.apellidoPaterno, 'eliminada');
    assert.equal(usuario.apellidoMaterno, null);
    assert.match(usuario.correo, /^deleted-[0-9a-f-]+@deleted\.invalid$/);
    assert.equal(usuario.telefono, null);
    assert.equal(usuario.preguntaSecreta, null);
    assert.equal(usuario.respuestaSecretaHash, null);
    assert.equal(usuario.estaActivo, 0);
    assert.equal(await bcrypt.compare(password, usuario.password), false);

    const [citas] = await pool.query(
      'SELECT estado, notas FROM cita WHERE id = ?',
      ['cuenta-test-cita']
    );
    assert.deepEqual(citas[0], { estado: 'CANCELADA', notas: null });

    const [tokens] = await pool.query(
      'SELECT COUNT(*) AS total FROM tokens_temporales WHERE usuario_id = ?',
      [registro.body.userId]
    );
    assert.equal(Number(tokens[0].total), 0);

    const [ventas] = await pool.query(
      `SELECT comprador_nombre, comprador_email, comprador_telefono
         FROM ventas_online
        WHERE cliente_id = ?`,
      [clienteId]
    );
    assert.deepEqual(ventas[0], {
      comprador_nombre: 'Cuenta eliminada',
      comprador_email: null,
      comprador_telefono: null,
    });

    const sesionAnterior = await request(app)
      .get('/api/cliente/resumen')
      .set('Authorization', `Bearer ${login.body.token}`);
    assert.equal(sesionAnterior.status, 401);

    const nuevoLogin = await request(app)
      .post('/api/auth/login')
      .send({ correo, password });
    assert.equal(nuevoLogin.status, 401);

    const tokenRecuperacionAnterior = jwt.sign(
      { id: registro.body.userId, correo },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const restablecimiento = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: tokenRecuperacionAnterior, newPassword: 'Otra-Clave-Que-No-Debe-Guardarse' });
    assert.equal(restablecimiento.status, 400);
  });
});
