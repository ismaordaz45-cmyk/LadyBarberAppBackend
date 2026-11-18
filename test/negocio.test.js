import { it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import negocioRepository from '../src/repositories/negocioRepository.js';

it('expone solo el perfil público activo sin exigir sesión', async t => {
  const perfil = { id: 1, nombre: 'Salón de prueba', logo: null, direccion: 'Dirección de prueba', ubicacion: '21.14,-98.42', telefono: null, horarioAtencion: null };
  t.mock.method(negocioRepository, 'obtenerPerfilPublico', async () => perfil);
  const res = await request(app).get('/api/perfil-empresa');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, perfil);
});
it('devuelve 404 si no existe negocio activo y conserva la protección del resumen privado', async t => {
  t.mock.method(negocioRepository, 'obtenerPerfilPublico', async () => null);
  assert.equal((await request(app).get('/api/perfil-empresa')).status, 404);
  assert.equal((await request(app).get('/api/cliente/resumen')).status, 401);
});
