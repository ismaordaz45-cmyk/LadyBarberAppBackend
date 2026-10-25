CREATE TABLE usuario (
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

CREATE TABLE cliente (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuarioId BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cliente_usuario (usuarioId),
  CONSTRAINT fk_cliente_usuario
    FOREIGN KEY (usuarioId) REFERENCES usuario (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
