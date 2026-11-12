-- Auditoria e idempotencia de pagos de citas procesados por Mercado Pago.
-- Esta migracion no elimina ni modifica registros existentes.
-- Debe ejecutarse una sola vez con una cuenta administrativa controlada.

CREATE TABLE IF NOT EXISTS pago_mercado_pago (
  id BIGINT NOT NULL AUTO_INCREMENT,
  citaId CHAR(36) NOT NULL,
  preferenciaId VARCHAR(120) NULL,
  paymentId VARCHAR(120) NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  moneda CHAR(3) NOT NULL,
  estado VARCHAR(40) NOT NULL,
  estadoDetalle VARCHAR(80) NULL,
  metodoPago VARCHAR(80) NULL,
  tipoPago VARCHAR(80) NULL,
  fechaAprobacion DATETIME NULL,
  rawData JSON NOT NULL,
  creadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pago_mp_payment (paymentId),
  KEY idx_pago_mp_cita (citaId),
  CONSTRAINT fk_pago_mp_cita
    FOREIGN KEY (citaId) REFERENCES cita (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
