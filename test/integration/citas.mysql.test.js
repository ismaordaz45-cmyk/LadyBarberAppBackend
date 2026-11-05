import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import pool from '../../src/config/database.js';
import { getMinimumBookingDate } from '../../src/services/citasDomain.js';
import { dropCitasTestDatabaseObjects, resetCitasTestDatabase } from '../helpers/citasTestDb.js';

const targetDate = getMinimumBookingDate();
let tokenCliente;

before(async () => {
  await resetCitasTestDatabase();

  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, password, rol, estaActivo)
     VALUES
       (1, 'Cliente CI', 'cliente.citas@ladybarber.test', 'hash-no-usado', 'CLIENTE', 1),
       (2, 'Especialista CI', 'empleada.citas@ladybarber.test', 'hash-no-usado', 'EMPLEADA', 1),
       (3, 'Otro Cliente', 'otro.cliente@ladybarber.test', 'hash-no-usado', 'CLIENTE', 1)`
  );
  await pool.query('INSERT INTO cliente (id, usuarioId) VALUES (1, 1), (2, 3)');
  await pool.query("INSERT INTO empleada (id, usuarioId, especialidad) VALUES (1, 2, 'Cabello')");
  await pool.query(
    `INSERT INTO servicio (id, nombre, descripcion, precio, duracionMinutos, categoria, estaActivo)
     VALUES
       (1, 'Corte', 'Corte de prueba', 200, 60, 'Cabello', 1),
       (2, 'Peinado', 'Peinado de prueba', 250, 30, 'Cabello', 1),
       (3, 'Servicio no asignado', 'No disponible con esta empleada', 100, 30, 'Otro', 1)`
  );
  await pool.query('INSERT INTO empleada_servicio (empleadaId, servicioId) VALUES (1, 1), (1, 2)');
  await pool.query(
    `INSERT INTO insumo
       (id, nombre, descripcion, unidad, stockActual, stockMinimo, precioUnitario, estaActivo, imagen)
     VALUES (1, 'Producto CI', 'Producto de integración', 'pieza', 5, 1, 150, 1, NULL)`
  );
  await pool.query(
    `INSERT INTO horario_negocio (diaSemana, horaApertura, horaCierre, activo)
     VALUES
       ('LUNES','09:00:00','18:00:00',1), ('MARTES','09:00:00','18:00:00',1),
       ('MIERCOLES','09:00:00','18:00:00',1), ('JUEVES','09:00:00','18:00:00',1),
       ('VIERNES','09:00:00','18:00:00',1), ('SABADO','09:00:00','18:00:00',1),
       ('DOMINGO',NULL,NULL,0)`
  );

  tokenCliente = jwt.sign(
    { id: 1, correo: 'cliente.citas@ladybarber.test', rol: 'CLIENTE' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
});

after(async () => {
  try {
    await dropCitasTestDatabaseObjects();
  } finally {
    await pool.end();
  }
});

describe('Integración real de catálogos y citas con MySQL', () => {
  it('expone catálogos activos con los contratos esperados', async () => {
    const servicios = await request(app).get('/api/servicios');
    assert.equal(servicios.status, 200);
    assert.equal(servicios.body.length, 3);
    assert.equal(servicios.body[0].nombre, 'Corte');
    assert.equal(Number(servicios.body[0].precio), 200);
    assert.equal(servicios.body[0].duracion, 60);

    const productos = await request(app).get('/api/insumos');
    assert.equal(productos.status, 200);
    assert.equal(productos.body.length, 1);
    assert.equal(productos.body[0].nombre, 'Producto CI');
    assert.equal(Number(productos.body[0].precio), 150);
    assert.equal(productos.body[0].stockActual, 5);
  });

  it('reserva atómicamente, persiste líneas y rechaza un traslape', async () => {
    const payload = {
      empleadaId: 1,
      fecha: targetDate,
      horaInicio: '10:00',
      servicios: [1, 2],
    };
    const first = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenCliente}`)
      .send(payload);

    assert.equal(first.status, 200);
    assert.match(first.body.citaId, /^[0-9a-f-]{36}$/i);
    assert.equal(first.body.duracionTotal, 90);
    assert.equal(first.body.precioTotal, 450);

    const [appointments] = await pool.query(
      'SELECT clienteId, empleadaId, estado, precioFinal, horaInicio, horaFin FROM cita WHERE id = ?',
      [first.body.citaId]
    );
    assert.equal(appointments.length, 1);
    assert.equal(appointments[0].clienteId, 1);
    assert.equal(appointments[0].empleadaId, 1);
    assert.equal(appointments[0].estado, 'APARTADA');
    assert.equal(Number(appointments[0].precioFinal), 450);

    const [lines] = await pool.query(
      'SELECT servicioId, precio, duracion FROM citaservicio WHERE citaId = ? ORDER BY servicioId',
      [first.body.citaId]
    );
    assert.deepEqual(lines.map((line) => [line.servicioId, Number(line.precio), line.duracion]), [
      [1, 200, 60],
      [2, 250, 30],
    ]);

    const overlapping = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenCliente}`)
      .send({ ...payload, horaInicio: '10:30' });
    assert.equal(overlapping.status, 409);
    assert.match(overlapping.body.message, /disponible/);
  });

  it('rechaza servicios que la empleada no ofrece y horarios fuera de operación', async () => {
    const unassigned = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenCliente}`)
      .send({ empleadaId: 1, fecha: targetDate, horaInicio: '14:00', servicios: [3] });
    assert.equal(unassigned.status, 400);
    assert.match(unassigned.body.message, /no ofrece/);

    const outsideSchedule = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenCliente}`)
      .send({ empleadaId: 1, fecha: targetDate, horaInicio: '18:00', servicios: [1] });
    assert.equal(outsideSchedule.status, 400);
    assert.match(outsideSchedule.body.message, /horario del negocio/);
  });

  it('excluye apartados vencidos de ocupación y protege la cancelación por propietario', async () => {
    const expiredId = '00000000-0000-4000-8000-000000000001';
    const otherClientId = '00000000-0000-4000-8000-000000000002';
    await pool.query(
      `INSERT INTO cita
       (id, clienteId, empleadaId, fecha, horaInicio, horaFin, estado, precioFinal, creadoEn)
       VALUES
         (?, 1, 1, ?, ?, ?, 'APARTADA', 100, NOW() - INTERVAL 31 MINUTE),
         (?, 2, 1, ?, ?, ?, 'CONFIRMADA', 100, NOW())`,
      [
        expiredId, `${targetDate} 00:00:00`, `${targetDate} 14:00:00`, `${targetDate} 14:30:00`,
        otherClientId, `${targetDate} 00:00:00`, `${targetDate} 16:00:00`, `${targetDate} 16:30:00`,
      ]
    );

    const occupation = await request(app)
      .get(`/api/citas/ocupacion?fecha=${targetDate}&empleadaId=1`)
      .set('Authorization', `Bearer ${tokenCliente}`);
    assert.equal(occupation.status, 200);
    assert.equal(occupation.body.some((row) => row.id === expiredId), false);
    assert.equal(occupation.body.some((row) => row.id === otherClientId), true);

    const forbiddenCancellation = await request(app)
      .delete(`/api/citas/${otherClientId}`)
      .set('Authorization', `Bearer ${tokenCliente}`);
    assert.equal(forbiddenCancellation.status, 404);

    const [otherAppointment] = await pool.query('SELECT estado FROM cita WHERE id = ?', [otherClientId]);
    assert.equal(otherAppointment[0].estado, 'CONFIRMADA');
  });
});
