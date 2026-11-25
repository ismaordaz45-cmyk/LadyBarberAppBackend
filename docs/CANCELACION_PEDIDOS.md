# Cancelación de pedidos móviles

POST /api/pedidos/:id/cancelar requiere JWT, cuenta activa, rol CLIENTE y propiedad por usuario.id. Es idempotente para un pedido ya cancelado desde la app. No altera tablas ni requiere variables nuevas.

La cancelación se serializa con la creación de preferencias mediante el bloqueo existente por pedido. Si aún no hubo checkout, cancela sin consultar Mercado Pago. Si ya hay preferencia, comprueba su referencia móvil, consulta los pagos conocidos y los encontrados por referencia, solicita el vencimiento de la preferencia y verifica la respuesta. Vuelve a comprobar pagos antes de cancelar transaccionalmente. No borra artículos, ventas ni inventario y no ejecuta reembolsos ni cancela pagos financieros.

Un pago aprobado, pendiente, autorizado, devuelto o en revisión impide la cancelación normal. Errores de red, búsquedas incompletas o vencimiento no confirmado conservan el pedido. No se modifican preferencias de la web.

Una notificación de pago que ya estaba en tránsito no se pierde: si llega después de cancelar, se conserva su evidencia. Una aprobación confirma la compra con la transacción de inventario existente, o permanece en revisión si falta stock; los reintentos no duplican ventas. Un pago pendiente vuelve a dejar el pedido pendiente sin descontar existencias. Esto no equivale a un reembolso ni garantiza anular un pago que ya estaba siendo procesado.

La actualización de preferencias usa el contrato oficial PUT /checkout/preferences/{id}: https://www.mercadopago.com.mx/developers/en/reference/online-payments/checkout-pro-preferences/update-preference/put . La aceptación real del vencimiento requiere prueba con el vendedor de prueba después de desplegar. Las pruebas locales simulan el proveedor; no se hacen llamadas financieras reales.

El frontend conserva el carrito y solo borra el pedido activo local después de la confirmación del servidor. Este endpoint todavía no está en Render: integrar por feature → develop → release → main con checks y revisión antes de desplegar. No se ejecutó SQL en Hostinger ni se modificó la web.
