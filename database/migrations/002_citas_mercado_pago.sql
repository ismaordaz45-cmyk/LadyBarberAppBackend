-- Auditoria e idempotencia de pagos de citas procesados por Mercado Pago.
-- Compatible con el esquema compartido con la web confirmado en Hostinger.
-- No altera tablas de pagos existentes ni elimina o modifica sus registros.
-- Ejecucion manual controlada; nunca se ejecuta al iniciar la aplicacion.
-- Seleccionar primero la base de destino. Puede ejecutarse nuevamente.

CREATE TABLE IF NOT EXISTS pago_mercado_pago (
  id INT NOT NULL AUTO_INCREMENT,
  citaId VARCHAR(64) NOT NULL,
  preferenciaId VARCHAR(100) NULL,
  paymentId VARCHAR(100) NULL,
  monto DECIMAL(10,2) NOT NULL,
  moneda VARCHAR(5) NULL DEFAULT 'MXN',
  estado VARCHAR(50) NULL DEFAULT 'PENDIENTE',
  estadoDetalle VARCHAR(100) NULL,
  metodoPago VARCHAR(50) NULL,
  tipoPago VARCHAR(50) NULL,
  fechaAprobacion DATETIME NULL,
  rawData LONGTEXT NULL,
  creadoEn DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  actualizadoEn DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pago_mp_payment (paymentId),
  KEY idx_pago_mp_cita (citaId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- La base compartida ya tiene estas columnas. Agregarlas solo cuando falten
-- permite preparar instalaciones nuevas sin alterar definiciones existentes.
SET @mp_schema_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cita'
            AND COLUMN_NAME = 'mp_preference_id'),
  'SELECT 1',
  'ALTER TABLE cita ADD COLUMN mp_preference_id VARCHAR(255) NULL'
);
PREPARE mp_schema_statement FROM @mp_schema_sql;
EXECUTE mp_schema_statement;
DEALLOCATE PREPARE mp_schema_statement;

SET @mp_schema_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cita'
            AND COLUMN_NAME = 'mp_payment_id'),
  'SELECT 1',
  'ALTER TABLE cita ADD COLUMN mp_payment_id VARCHAR(255) NULL'
);
PREPARE mp_schema_statement FROM @mp_schema_sql;
EXECUTE mp_schema_statement;
DEALLOCATE PREPARE mp_schema_statement;

SET @mp_schema_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cita'
            AND COLUMN_NAME = 'mp_status'),
  'SELECT 1',
  'ALTER TABLE cita ADD COLUMN mp_status VARCHAR(50) NULL'
);
PREPARE mp_schema_statement FROM @mp_schema_sql;
EXECUTE mp_schema_statement;
DEALLOCATE PREPARE mp_schema_statement;
