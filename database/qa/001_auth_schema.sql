-- Esquema mínimo de autenticación para LadyBarberAppBackend-QA.
-- Ejecutar manualmente una sola vez con una cuenta administradora del servicio.
-- La cuenta runtime de la aplicación no debe tener permisos CREATE, ALTER ni DROP.

CREATE DATABASE IF NOT EXISTS lady_barber_qa
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lady_barber_qa;

CREATE TABLE IF NOT EXISTS usuario (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  apellidoPaterno VARCHAR(120) NULL,
  apellidoMaterno VARCHAR(120) NULL,
  correo VARCHAR(254) NOT NULL,
  telefono VARCHAR(30) NULL,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(30) NOT NULL DEFAULT 'CLIENTE',
  preguntaSecreta VARCHAR(255) NULL,
  respuestaSecretaHash VARCHAR(255) NULL,
  estaActivo TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuario_correo (correo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cliente (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuarioId BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cliente_usuario (usuarioId),
  CONSTRAINT fk_cliente_usuario
    FOREIGN KEY (usuarioId) REFERENCES usuario (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
