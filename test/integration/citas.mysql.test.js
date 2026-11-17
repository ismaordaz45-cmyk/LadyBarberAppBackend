import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import pool from '../../src/config/database.js';
import { CitasPagoRepository } from '../../src/repositories/citasPagoRepository.js';
import { getMinimumBookingDate } from '../../src/services/citasDomain.js';
import { applyPaymentTestMigration, dropCitasTestDatabaseObjects, resetCitasTestDatabase } from '../helpers/citasTestDb.js';

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
  it('conserva pagos pendientes de la web y definiciones existentes al repetir la migración', async () => {
    const [columns] = await pool.query('SHOW COLUMNS FROM pago_mercado_pago');
    const column = (name) => columns.find((item) => item.Field === name);
    assert.equal(column('id').Type, 'int');
    assert.equal(column('citaId').Type, 'varchar(64)');
    assert.equal(column('preferenciaId').Type, 'varchar(100)');
    assert.equal(column('paymentId').Type, 'varchar(100)');
    assert.equal(column('paymentId').Null, 'YES');
    assert.equal(column('rawData').Type, 'longtext');
    assert.equal(column('rawData').Null, 'YES');
    assert.equal(column('moneda').Type, 'varchar(5)');
    assert.equal(column('moneda').Default, 'MXN');
    assert.equal(column('estado').Type, 'varchar(50)');
    assert.equal(column('estado').Default, 'PENDIENTE');
    assert.equal(column('estadoDetalle').Type, 'varchar(100)');
    assert.equal(column('metodoPago').Type, 'varchar(50)');
    assert.equal(column('tipoPago').Type, 'varchar(50)');
    assert.equal(column('creadoEn').Null, 'YES');
    assert.equal(column('actualizadoEn').Null, 'YES');
    const [foreignKeys] = await pool.query(`
      SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pago_mercado_pago'
         AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    assert.equal(foreignKeys.length, 0);
    const [appointmentColumns] = await pool.query('SHOW COLUMNS FROM cita');
    for (const [name, type] of [
      ['mp_preference_id', 'varchar(255)'],
      ['mp_payment_id', 'varchar(255)'],
      ['mp_status', 'varchar(50)'],
    ]) {
      const item = appointmentColumns.find((entry) => entry.Field === name);
      assert.equal(item.Type, type);
      assert.equal(item.Null, 'YES');
    }

    // La web puede tener más de un pago pendiente sin paymentId ni rawData.
    await pool.query(`
      INSERT INTO pago_mercado_pago (citaId, monto, creadoEn, actualizadoEn)
      VALUES ('web-pendiente-1', 100, NULL, NULL),
             ('web-pendiente-2', 100, NULL, NULL)
    `);
    // Las columnas ya existentes conservan su definición y sus datos.
    await pool.query('ALTER TABLE cita MODIFY mp_preference_id VARCHAR(100) NULL');
    const [before] = await pool.query('SHOW CREATE TABLE cita');
    const [paymentSchemaBefore] = await pool.query('SHOW CREATE TABLE pago_mercado_pago');
    await applyPaymentTestMigration();
    await applyPaymentTestMigration();
    const [after] = await pool.query('SHOW CREATE TABLE cita');
    assert.deepEqual(after, before);
    const [paymentSchemaAfter] = await pool.query('SHOW CREATE TABLE pago_mercado_pago');
    assert.deepEqual(paymentSchemaAfter, paymentSchemaBefore);
    const [pending] = await pool.query("SELECT * FROM pago_mercado_pago WHERE estado = 'PENDIENTE' ORDER BY id");
    assert.equal(pending.length, 2);
    for (const payment of pending) {
      assert.equal(payment.moneda, 'MXN');
      assert.equal(payment.paymentId, null);
      assert.equal(payment.rawData, null);
      assert.equal(payment.creadoEn, null);
      assert.equal(payment.actualizadoEn, null);
    }
    await pool.query("UPDATE pago_mercado_pago SET paymentId = 'web-payment-unique' WHERE citaId = 'web-pendiente-1'");
    await assert.rejects(
      () => pool.query("UPDATE pago_mercado_pago SET paymentId = 'web-payment-unique' WHERE citaId = 'web-pendiente-2'"),
      (error) => error.code === 'ER_DUP_ENTRY'
    );
  });

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

  it('persiste pendientes y rechazos sin confirmar, y no degrada un aprobado por un webhook tardío', async () => {
    const citaId = '00000000-0000-4000-8000-000000000022';
    await pool.query(
      `INSERT INTO cita
       (id, clienteId, empleadaId, fecha, horaInicio, horaFin, estado, precioFinal)
       VALUES (?, 1, 1, ?, ?, ?, 'APARTADA', 200)`,
      [citaId, `${targetDate} 00:00:00`, `${targetDate} 15:00:00`, `${targetDate} 15:30:00`]
    );
    const repository = new CitasPagoRepository(pool);
    const payment = {
      citaId, preferenceId: 'pref-statuses', id: 'payment-statuses', amount: 100,
      currency: 'MXN', statusDetail: null, paymentMethod: null, paymentType: null,
      approvedAt: null,
    };
    const readState = async () => {
      const [rows] = await pool.query(
        `SELECT c.estado, c.mp_status, p.estado AS paymentStatus, p.rawData
           FROM cita c JOIN pago_mercado_pago p ON p.citaId = c.id WHERE c.id = ?`,
        [citaId]
      );
      return rows;
    };
    // Un monto incorrecto se rechaza antes de escribir evidencia o confirmar.
    await assert.rejects(
      () => repository.applyVerifiedPayment({ ...payment, amount: 1, status: 'approved', rawData: {} }),
      (error) => error.statusCode === 409
    );
    assert.deepEqual(await readState(), []);
    for (const status of ['pending', 'rejected']) {
      await repository.applyVerifiedPayment({ ...payment, status, rawData: { status } });
      const [row] = await readState();
      assert.equal(row.estado, 'APARTADA');
      assert.equal(row.mp_status, status);
      assert.equal(row.paymentStatus, status);
    }
    await repository.applyVerifiedPayment({ ...payment, status: 'approved', rawData: { status: 'approved' } });
    await repository.applyVerifiedPayment({ ...payment, status: 'pending', rawData: { status: 'pending' } });
    const rows = await readState();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].estado, 'CONFIRMADA');
    assert.equal(rows[0].mp_status, 'approved');
    assert.equal(rows[0].paymentStatus, 'approved');
    assert.equal(JSON.parse(rows[0].rawData).status, 'approved');
  });

  it('persiste un pago aprobado, confirma la cita y mantiene idempotencia', async () => {
    const paidCitaId = '00000000-0000-4000-8000-000000000020';
    const secondCitaId = '00000000-0000-4000-8000-000000000021';
    await pool.query(
      `INSERT INTO cita
       (id, clienteId, empleadaId, fecha, horaInicio, horaFin, estado, precioFinal, creadoEn)
       VALUES
         (?, 1, 1, ?, ?, ?, 'APARTADA', 200, NOW()),
         (?, 2, 1, ?, ?, ?, 'APARTADA', 200, NOW())`,
      [
        paidCitaId, `${targetDate} 00:00:00`, `${targetDate} 12:00:00`, `${targetDate} 12:30:00`,
        secondCitaId, `${targetDate} 00:00:00`, `${targetDate} 13:00:00`, `${targetDate} 13:30:00`,
      ]
    );

    const repository = new CitasPagoRepository(pool);
    const payment = {
      citaId: paidCitaId,
      preferenceId: 'pref-integration',
      id: 'payment-integration-1',
      amount: 100,
      currency: 'MXN',
      status: 'approved',
      statusDetail: 'accredited',
      paymentMethod: 'visa',
      paymentType: 'credit_card',
      approvedAt: new Date('2026-11-11T12:00:00.000Z'),
      rawData: { id: 'payment-integration-1', status: 'approved' },
    };

    assert.deepEqual(await repository.applyVerifiedPayment(payment), { confirmed: true, status: 'approved' });
    assert.deepEqual(await repository.applyVerifiedPayment(payment), { confirmed: true, status: 'approved' });

    const [appointments] = await pool.query(
      'SELECT estado, mp_payment_id AS paymentId, mp_status AS paymentStatus FROM cita WHERE id = ?',
      [paidCitaId]
    );
    assert.equal(appointments[0].estado, 'CONFIRMADA');
    assert.equal(appointments[0].paymentId, 'payment-integration-1');
    assert.equal(appointments[0].paymentStatus, 'approved');

    const [payments] = await pool.query(
      'SELECT citaId, paymentId, monto, moneda, estado FROM pago_mercado_pago WHERE paymentId = ?',
      ['payment-integration-1']
    );
    assert.equal(payments.length, 1);
    assert.equal(payments[0].citaId, paidCitaId);
    assert.equal(Number(payments[0].monto), 100);
    assert.equal(payments[0].moneda, 'MXN');
    assert.equal(payments[0].estado, 'approved');

    await pool.query('INSERT INTO citaservicio (citaId, servicioId, precio, duracion) VALUES (?, 1, 200, 30)', [paidCitaId]);
    const detalle = await request(app).get(`/api/citas/${paidCitaId}`).set('Authorization', `Bearer ${tokenCliente}`);
    assert.equal(detalle.status, 200);
    assert.equal(detalle.body.clienteNombre, 'Cliente CI');
    assert.equal(detalle.body.empleadaNombre, 'Especialista CI');
    assert.equal(detalle.body.comprobanteDisponible, true);
    assert.equal(detalle.body.anticipoPagado, 100);
    assert.equal(detalle.body.saldoPendiente, 100);
    assert.equal(Number(detalle.body.servicios[0].precio), 200);
    assert.equal(detalle.body.servicios[0].duracionMinutos, 30);
    const ajena = await request(app).get(`/api/citas/${secondCitaId}`).set('Authorization', `Bearer ${tokenCliente}`);
    assert.equal(ajena.status, 404);
    const page = await request(app).get('/api/citas/mis-citas?offset=1').set('Authorization', `Bearer ${tokenCliente}`);
    assert.equal(page.status, 200);
    const firstPage = await request(app).get('/api/citas/mis-citas').set('Authorization', `Bearer ${tokenCliente}`);
    assert.deepEqual(page.body.map(c => c.id), firstPage.body.slice(1).map(c => c.id));

    await assert.rejects(
      () => repository.applyVerifiedPayment({ ...payment, citaId: secondCitaId }),
      (error) => error.statusCode === 409
    );
  });
  it('recupera detalle y evidencia de anticipo con intercalaciones distintas entre cita y pagos', async () => {
    // Solo en la base efímera: MySQL no tiene uca1400 de MariaDB. Dos
    // collations utf8mb4 distintas reproducen el mismo error de comparación.
    await pool.query(`ALTER TABLE pago_mercado_pago
      MODIFY citaId VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
      MODIFY paymentId VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL`);
    try {
      const citaId = '00000000-0000-4000-8000-000000000030';
      await pool.query(`INSERT INTO cita
        (id, clienteId, empleadaId, fecha, horaInicio, horaFin, estado, precioFinal)
        VALUES (?, 1, 1, ?, ?, ?, 'APARTADA', 120)`,
      [citaId, `${targetDate} 00:00:00`, `${targetDate} 17:00:00`, `${targetDate} 17:45:00`]);
      await pool.query('INSERT INTO citaservicio (citaId, servicioId, precio, duracion) VALUES (?, 1, 120, 45)', [citaId]);
      const repository = new CitasPagoRepository(pool);
      await repository.applyVerifiedPayment({
        citaId, preferenceId: 'pref-collation', id: 'payment-collation', amount: 60,
        currency: 'MXN', status: 'approved', statusDetail: 'accredited',
        paymentMethod: 'visa', paymentType: 'credit_card', approvedAt: new Date(), rawData: {},
      });
      // Control: la comparación columna-columna original sí reproduce el fallo.
      await assert.rejects(pool.query(`SELECT c.id FROM cita c
        LEFT JOIN pago_mercado_pago p ON p.citaId = c.id AND p.paymentId = c.mp_payment_id
        WHERE c.id = ?`, [citaId]), e => e.code === 'ER_CANT_AGGREGATE_2COLLATIONS');
      const detalle = await request(app).get(`/api/citas/${citaId}`).set('Authorization', `Bearer ${tokenCliente}`);
      assert.equal(detalle.status, 200);
      assert.equal(detalle.body.comprobanteDisponible, true);
      assert.equal(detalle.body.clienteNombre, 'Cliente CI');
      assert.equal(detalle.body.anticipoPagado, 60);
      assert.equal(detalle.body.saldoPendiente, 60);
      assert.equal(detalle.body.servicios[0].duracionMinutos, 45);
      assert.equal(detalle.body.paymentId, 'payment-collation');
      await pool.query('UPDATE pago_mercado_pago SET citaId = ? WHERE paymentId = ?',
        ['00000000-0000-4000-8000-000000000099', 'payment-collation']);
      const noCoincidente = await request(app).get(`/api/citas/${citaId}`).set('Authorization', `Bearer ${tokenCliente}`);
      assert.equal(noCoincidente.status, 200);
      assert.equal(noCoincidente.body.comprobanteDisponible, false);
      assert.equal(noCoincidente.body.anticipoPagado, null);
      assert.equal(noCoincidente.body.saldoPendiente, null);
    } finally {
      await pool.query(`ALTER TABLE pago_mercado_pago
        MODIFY citaId VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        MODIFY paymentId VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL`);
    }
  });
});
