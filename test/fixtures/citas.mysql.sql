CREATE TABLE usuario (
  id INT NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(40) NOT NULL,
  apellidoPaterno VARCHAR(40) NULL,
  apellidoMaterno VARCHAR(40) NULL,
  correo VARCHAR(120) NOT NULL,
  telefono VARCHAR(15) NULL,
  password VARCHAR(100) NOT NULL,
  rol ENUM('PROPIETARIA','EMPLEADA','CLIENTE') NOT NULL,
  preguntaSecreta VARCHAR(150) NULL,
  respuestaSecretaHash VARCHAR(255) NULL,
  creadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  estaActivo TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuario_correo (correo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cliente (
  id INT NOT NULL AUTO_INCREMENT,
  usuarioId INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cliente_usuario (usuarioId),
  CONSTRAINT fk_cliente_usuario FOREIGN KEY (usuarioId) REFERENCES usuario (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE empleada (
  id INT NOT NULL AUTO_INCREMENT,
  usuarioId INT NOT NULL,
  especialidad VARCHAR(60) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_empleada_usuario (usuarioId),
  CONSTRAINT fk_empleada_usuario FOREIGN KEY (usuarioId) REFERENCES usuario (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE servicio (
  id INT NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(60) NOT NULL,
  descripcion VARCHAR(250) NULL,
  precio DECIMAL(8,2) NOT NULL,
  duracionMinutos INT NOT NULL,
  categoria VARCHAR(40) NOT NULL,
  imagenUrl LONGTEXT NULL,
  estaActivo TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE insumo (
  id INT NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(80) NOT NULL,
  descripcion VARCHAR(200) NULL,
  unidad VARCHAR(20) NULL,
  stockActual INT NOT NULL,
  stockMinimo INT NOT NULL,
  precioUnitario DECIMAL(8,2) NULL,
  estaActivo TINYINT(1) NOT NULL DEFAULT 1,
  imagen TEXT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE empleada_servicio (
  id INT NOT NULL AUTO_INCREMENT,
  empleadaId INT NOT NULL,
  servicioId INT NOT NULL,
  creadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_empleada_servicio (empleadaId, servicioId),
  CONSTRAINT fk_es_empleada FOREIGN KEY (empleadaId) REFERENCES empleada (id),
  CONSTRAINT fk_es_servicio FOREIGN KEY (servicioId) REFERENCES servicio (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE horario_negocio (
  id INT NOT NULL AUTO_INCREMENT,
  diaSemana ENUM('LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO') NULL,
  horaApertura TIME NULL,
  horaCierre TIME NULL,
  activo TINYINT(1) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cita (
  id CHAR(36) NOT NULL,
  clienteId INT NOT NULL,
  empleadaId INT NOT NULL,
  fecha DATETIME NOT NULL,
  horaInicio DATETIME NOT NULL,
  horaFin DATETIME NOT NULL,
  estado ENUM('APARTADA','CONFIRMADA','EN_PROCESO','COMPLETADA','CANCELADA','NO_ASISTIO') NOT NULL,
  notas VARCHAR(250) NULL,
  precioFinal DECIMAL(8,2) NULL,
  creadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cita_cliente (clienteId),
  KEY idx_cita_empleada (empleadaId),
  CONSTRAINT fk_cita_cliente FOREIGN KEY (clienteId) REFERENCES cliente (id),
  CONSTRAINT fk_cita_empleada FOREIGN KEY (empleadaId) REFERENCES empleada (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE citaservicio (
  id INT NOT NULL AUTO_INCREMENT,
  citaId CHAR(36) NOT NULL,
  servicioId INT NOT NULL,
  precio DECIMAL(8,2) NOT NULL,
  duracion INT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_cs_cita (citaId),
  KEY idx_cs_servicio (servicioId),
  CONSTRAINT fk_cs_cita FOREIGN KEY (citaId) REFERENCES cita (id),
  CONSTRAINT fk_cs_servicio FOREIGN KEY (servicioId) REFERENCES servicio (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
