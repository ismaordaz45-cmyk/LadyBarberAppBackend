import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';
import pool from '../../src/config/database.js';
import { resetCitasTestDatabase, dropCitasTestDatabaseObjects } from '../helpers/citasTestDb.js';
let token;
let initialized = false;
before(async () => {
  await resetCitasTestDatabase(); // Rechaza cualquier base o host que no sea el efímero local.
  initialized = true;
  await pool.query(`INSERT INTO usuario (id,nombre,correo,password,rol,estaActivo) VALUES
    (1,'Cliente','cliente.inicio@ladybarber.test','hash','CLIENTE',1),
    (2,'Especialista','especialista.inicio@ladybarber.test','hash','EMPLEADA',1),
    (3,'Otro cliente','otro.inicio@ladybarber.test','hash','CLIENTE',1)`);
  await pool.query('INSERT INTO cliente (id,usuarioId) VALUES (1,1),(2,3)');
  await pool.query("INSERT INTO empleada (id,usuarioId,especialidad) VALUES (1,2,'Cabello')");
  await pool.query("INSERT INTO servicio (id,nombre,precio,duracionMinutos,categoria,estaActivo) VALUES (1,'Corte de prueba',120,45,'Cabello',1)");
  await pool.query(`INSERT INTO cita (id,clienteId,empleadaId,fecha,horaInicio,horaFin,estado,precioFinal,creadoEn) VALUES
    ('vencida',1,1,CURDATE()+INTERVAL 1 DAY,NOW()+INTERVAL 1 DAY,NOW()+INTERVAL 1 DAY+INTERVAL 45 MINUTE,'APARTADA',120,NOW()-INTERVAL 31 MINUTE),
    ('cercana',1,1,CURDATE()+INTERVAL 2 DAY,NOW()+INTERVAL 2 DAY,NOW()+INTERVAL 2 DAY+INTERVAL 45 MINUTE,'CONFIRMADA',120,NOW()),
    ('lejana',1,1,CURDATE()+INTERVAL 3 DAY,NOW()+INTERVAL 3 DAY,NOW()+INTERVAL 3 DAY+INTERVAL 45 MINUTE,'APARTADA',120,NOW()),
    ('pasada',1,1,CURDATE()-INTERVAL 1 DAY,NOW()-INTERVAL 1 DAY,NOW()-INTERVAL 1 DAY+INTERVAL 45 MINUTE,'COMPLETADA',120,NOW()-INTERVAL 2 DAY),
    ('cancelada',1,1,CURDATE()+INTERVAL 2 DAY,NOW()+INTERVAL 2 DAY,NOW()+INTERVAL 2 DAY+INTERVAL 45 MINUTE,'CANCELADA',120,NOW()),
    ('ajena',2,1,CURDATE()+INTERVAL 1 DAY,NOW()+INTERVAL 1 DAY,NOW()+INTERVAL 1 DAY+INTERVAL 45 MINUTE,'CONFIRMADA',120,NOW())`);
  await pool.query("INSERT INTO citaservicio (citaId,servicioId,precio,duracion) VALUES ('cercana',1,120,45)");
  await pool.query(`CREATE TABLE perfil_empresa (id INT PRIMARY KEY, nombre VARCHAR(120), logo LONGTEXT,
    direccion VARCHAR(255), ubicacion VARCHAR(255), telefono VARCHAR(30), horarioAtencion VARCHAR(120), activo TINYINT)`);
  await pool.query("INSERT INTO perfil_empresa VALUES (1,'Perfil inactivo',NULL,NULL,NULL,NULL,NULL,0),(2,'Nombre real del salón',NULL,'Dirección real','21.14,-98.42','7710000000','Horario real',1)");
  token = jwt.sign({ id: 1, rol: 'CLIENTE' }, process.env.JWT_SECRET, { expiresIn: '1h' });
});
after(async () => {
  try { if (initialized) { await pool.query('DROP TABLE IF EXISTS perfil_empresa'); await dropCitasTestDatabaseObjects(); } }
  finally { await pool.end(); }
});
it('elige la próxima cita vigente más cercana y calcula estadísticas privadas con datos reales', async () => {
  const res = await request(app).get('/api/cliente/resumen').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.stats, { total: 5, pendientes: 2, completadas: 1 });
  assert.equal(res.body.nextCita.id, 'cercana');
  assert.equal(res.body.nextCita.serviciosLabel, 'Corte de prueba');
  assert.equal(Number(res.body.nextCita.precioFinal), 120);
  assert.match(res.body.nextCita.horaInicio, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
});
it('lee el nombre y logo del perfil activo existente sin utilizar el perfil inactivo', async () => {
  const res = await request(app).get('/api/perfil-empresa');
  assert.equal(res.status, 200);
  assert.equal(res.body.nombre, 'Nombre real del salón');
  assert.equal(res.body.id, 2);
  assert.equal(res.body.logo, null);
  assert.equal(res.body.ubicacion, '21.14,-98.42');
});
