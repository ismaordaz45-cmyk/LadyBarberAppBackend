import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseConfig } from '../src/config/database.js';
import { createServerConfig } from '../src/config/server.js';

const TEST_CA = `-----BEGIN CERTIFICATE-----
Y2VydGlmaWNhZG8gZmljdGljaW8gcGFyYSBwcnVlYmFz
-----END CERTIFICATE-----`;

describe('Configuración del servidor HTTP', () => {
  it('escucha en 0.0.0.0 y usa el puerto proporcionado por Render', () => {
    assert.deepEqual(createServerConfig({ PORT: '10000' }), {
      host: '0.0.0.0',
      port: 10000,
    });
  });

  it('rechaza puertos inválidos', () => {
    assert.throws(() => createServerConfig({ PORT: 'invalido' }), /PORT/);
    assert.throws(() => createServerConfig({ PORT: '70000' }), /PORT/);
  });

  it('exige JWT_SECRET cuando el servidor se ejecuta en producción', () => {
    assert.throws(
      () => createServerConfig({ NODE_ENV: 'production', PORT: '10000' }),
      /JWT_SECRET/
    );
  });
});

describe('Configuración TLS de MySQL', () => {
  it('mantiene compatibilidad sin TLS para MySQL local y GitHub Actions', () => {
    const config = createDatabaseConfig({
      DB_HOST: '127.0.0.1',
      DB_PORT: '3306',
      DB_USER: 'lady_barber_ci',
      DB_PASSWORD: 'credencial_ficticia',
      DB_NAME: 'lady_barber_test',
      DB_SSL: 'false',
    });

    assert.equal(config.ssl, undefined);
  });

  it('habilita TLS 1.2 y verificación del certificado con una CA PEM', () => {
    const config = createDatabaseConfig({ DB_SSL: 'true', DB_SSL_CA: TEST_CA });

    assert.deepEqual(config.ssl, {
      ca: TEST_CA,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    });
  });

  it('admite la CA codificada en Base64 para gestores de secretos', () => {
    const encodedCa = Buffer.from(TEST_CA, 'utf8').toString('base64');
    const config = createDatabaseConfig({ DB_SSL: 'true', DB_SSL_CA_BASE64: encodedCa });

    assert.equal(config.ssl.ca, TEST_CA);
    assert.equal(config.ssl.rejectUnauthorized, true);
  });

  it('impide habilitar TLS sin CA o con opciones ambiguas', () => {
    assert.throws(() => createDatabaseConfig({ DB_SSL: 'true' }), /requiere/);
    assert.throws(
      () => createDatabaseConfig({ DB_SSL: 'true', DB_SSL_CA: TEST_CA, DB_SSL_CA_BASE64: 'YQ==' }),
      /solo una/
    );
    assert.throws(() => createDatabaseConfig({ DB_SSL: 'TRUE' }), /exactamente/);
  });

  it('impide usar valores predeterminados o conexiones sin TLS en producción', () => {
    assert.throws(
      () => createDatabaseConfig({ NODE_ENV: 'production', DB_SSL: 'false' }),
      /Faltan variables/
    );
    assert.throws(
      () => createDatabaseConfig({
        NODE_ENV: 'production',
        DB_HOST: 'mysql-qa.example.invalid',
        DB_PORT: '3306',
        DB_USER: 'lady_barber_qa_app',
        DB_PASSWORD: 'credencial_ficticia',
        DB_NAME: 'lady_barber_qa',
        DB_SSL: 'false',
      }),
      /obligatorio en producción/
    );
  });
});
