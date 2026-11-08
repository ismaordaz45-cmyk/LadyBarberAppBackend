CREATE TABLE tokens_temporales (
  token VARCHAR(64) NOT NULL,
  rol VARCHAR(20) NOT NULL,
  usuario_id INT NOT NULL,
  creado_en BIGINT NOT NULL,
  expira_en BIGINT NOT NULL,
  usado TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (token),
  CONSTRAINT fk_token_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ventas_online (
  id INT NOT NULL AUTO_INCREMENT,
  cliente_id INT NOT NULL,
  comprador_nombre VARCHAR(255) NULL,
  comprador_email VARCHAR(255) NULL,
  comprador_telefono VARCHAR(50) NULL,
  total DECIMAL(10,2) NOT NULL,
  detalle JSON NULL,
  fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_venta_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
