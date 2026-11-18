-- Exclusivamente para MySQL local efímero. Replica estructura confirmada por el usuario en phpMyAdmin.
CREATE TABLE pedidos (
 id INT PRIMARY KEY AUTO_INCREMENT, cliente_id INT NOT NULL, fecha DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
 total DECIMAL(10,2) NOT NULL, estado ENUM('pendiente','pagado','cancelado') NULL DEFAULT 'pendiente',
 mp_preference_id VARCHAR(255) NULL, mp_payment_id VARCHAR(255) NULL, mp_status VARCHAR(50) NULL,
 created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE pedido_items (
 id INT PRIMARY KEY AUTO_INCREMENT, pedido_id INT NOT NULL, insumo_id INT NOT NULL,
 cantidad INT NOT NULL, precio_unitario DECIMAL(10,2) NOT NULL,
 FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
 FOREIGN KEY (insumo_id) REFERENCES insumo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE ventas_online (
 id INT PRIMARY KEY AUTO_INCREMENT, cliente_id INT NOT NULL, comprador_nombre VARCHAR(255) NULL,
 comprador_email VARCHAR(255) NULL, comprador_telefono VARCHAR(50) NULL, total DECIMAL(10,2) NOT NULL,
 detalle LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 fecha_hora DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (cliente_id) REFERENCES usuario(id) ON DELETE CASCADE,
 CHECK (JSON_VALID(detalle))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
