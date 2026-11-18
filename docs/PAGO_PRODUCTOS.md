# Pagos de productos para recogida en el salón

## Esquema confirmado

El usuario confirmó mediante phpMyAdmin los campos de `pedidos`, `pedido_items`, `ventas_online` e `insumo`, el motor InnoDB de las cuatro y el FK `ventas_online.cliente_id → usuario.id`. `pedidos` no tiene FK; la integración web escribe el ID de usuario en su `cliente_id`, y el móvil conserva esa convención. No usa `cliente.id` ni ejecuta migraciones.

## API y arquitectura

Ruta → controlador → servicio → repositorio. Las rutas de pedidos exigen JWT, cuenta activa y rol CLIENTE. La identidad se obtiene del JWT; pedidos ajenos devuelven 404.

- `POST /api/pedidos`: recibe `{ items: [{ insumoId, cantidad }] }`. Consulta precios, productos activos y existencias en la base; calcula el 100% en MXN con centavos y persiste líneas y total. Reutiliza un pedido móvil pendiente equivalente entre los últimos 40 de los últimos 30 minutos, serializando creaciones por usuario.
- `GET /api/pedidos?offset=0`: pedidos propios, seis por página, ID descendente estable.
- `GET /api/pedidos/:id`: detalle persistido, pago, confirmación, revisión de existencias y vencimiento.
- `POST /api/pedidos/:id/preferencia`: serializa solicitudes por pedido, reutiliza la preferencia guardada y limita el checkout a 30 minutos. Calcula la edad con el reloj de MySQL para evitar diferencias de zona horaria. Una preferencia iniciada en la web no se convierte a un checkout móvil.
- `POST /api/pedidos/:id/sincronizar`: consulta la evidencia ya registrada o busca pagos por referencia propia en Mercado Pago, y verifica el recurso completo antes de aplicarlo. No acepta como autoridad un estado o paymentId enviado por el dispositivo.
- `POST /api/pagos/productos/mercadopago/webhook`: exige firma HMAC para eventos payment y comprueba el recurso, referencia `pedido-movil:<id>`, monto completo y moneda MXN. Otros tópicos no mutan datos.
- `GET /api/pagos/productos/mercadopago/retorno/:estado`: indica volver a la app; no confirma una compra desde parámetros del navegador.

Las llamadas de productos reutilizan el transporte de Mercado Pago existente, con un adaptador propio y tiempo límite. No se cambian las rutas, referencias, porcentajes o firmas del anticipo de citas. Se mantienen `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y `PUBLIC_BACKEND_URL` existentes. No se sustituye la URL global del webhook web: cada preferencia móvil lleva su `notification_url` de productos.

## Consistencia y límites del inventario compartido

El carrito no reserva stock. Al aprobarse el pago, una transacción bloquea el pedido, el comprador y los insumos; valida existencias, descuenta cada línea, registra `ventas_online` con usuario correcto y marca el pedido pagado. Un error revierte todos esos pasos. La repetición de un webhook o de la consulta no duplica venta ni descuento. Los estados `mobile_created` y `mobile_checkout` identifican la etapa previa al primer evento; luego `mp_status` conserva el estado verificado de Mercado Pago.

Si las existencias ya no alcanzan, se guarda la evidencia aprobada, pero el pedido permanece pendiente, sin venta ni descuento parcial. La API devuelve `pagoAprobado: true`, `compraConfirmada: false`, `requiereRevision: true`; la app explica que el salón debe revisar el pedido y bloquea otro pago de ese pedido. No se inicia un reembolso automático. Si el stock se repone, una nueva conciliación puede completar la transacción. Cancelaciones, devoluciones y contracargos no reponen inventario automáticamente; requieren gestión del establecimiento.

La protección transaccional cubre las escrituras de este backend. El backend web continúa intacto y puede escribir sobre el mismo stock con su lógica previa; no se garantiza que escrituras externas incondicionales eviten valores negativos. La política de pago recibido en revisión atiende ese caso para el móvil. Es necesario probar el escenario conjunto antes de habilitar ventas reales.

El detalle general de pedidos usa el catálogo actual; precios y cantidades se conservan en pedido_items. Mis compras y el comprobante utilizan el nombre histórico de la venta coincidente y las imágenes actuales. La implementación de historial, PDF y plazo de recogida está descrita en [COMPRAS_Y_RECOGIDAS.md](COMPRAS_Y_RECOGIDAS.md).

## Validación y despliegue

- 87 pruebas unitarias/API aprobadas y 29 de integración con MySQL local efímero.
- Casos de comprador con usuario.id distinto de cliente.id, propiedad, importes alterados, moneda, firma, preferencias simultáneas, webhook repetido, última unidad entre dos clientes, rollback al fallar venta, reembolso y recuperación de webhook perdido.
- 542 pruebas móviles aprobadas, TypeScript sin errores y lint con cero errores y 36 advertencias.
- Solo se utilizó SQL en la base local efímera protegida por los controles de entorno de pruebas. No se ejecutó SQL en Hostinger ni se cambió su estructura.
- El servidor MySQL efímero se apagó y se eliminó su directorio de datos; se conservaron únicamente los logs de validación.

Integrar mediante `feature → develop → release → main`, con checks y revisión humana; después desplegar en Render y probar con cuentas y tarjetas de prueba. No iniciar el checkout desde el teléfono hasta que esté desplegado el backend que contiene estas rutas. No se requieren variables nuevas ni configuración del personal. Se difieren códigos y control de entrega única. No se realizaron commits, push ni despliegues.
