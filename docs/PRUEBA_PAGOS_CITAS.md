# Prueba de pagos de citas desde Expo Go

## Estado y alcance de la corrección

La migración `database/migrations/002_citas_mercado_pago.sql` reproduce los tipos,
longitudes, nulabilidad y valores por defecto comunicados para Hostinger.
Conserva la unicidad de `paymentId` y no agrega una clave foránea a pagos.
Los nombres de índices pueden diferir de los existentes sin afectar las consultas.
No se recrean índices redundantes ni se modifican tablas de pagos existentes.
Las columnas `mp_*` de `cita` se agregan únicamente si faltan; no se alteran las existentes.

La base compartida ya dispone de estas tablas y columnas según el diagnóstico.
No ejecutar la migración en Hostinger como paso automático del despliegue.
No importar fixtures de pruebas ni iniciar la app con credenciales de pruebas MySQL.

## Integración móvil preparada localmente

El contrato que debe consumir el móvil es:

- `POST /api/citas/:id/pago/preferencia` con JWT del cliente, sin importe enviado por el móvil.
- Respuesta HTTP 201: `{ preferenceId, checkoutUrl, amount, currency }`.
- `GET /api/citas/:id/pago/estado` con el mismo JWT.
- Respuesta: `{ citaId, estado, precioFinal, preferenceId, paymentId, paymentStatus }`.

El worktree `LadyBarberApp-pago-citas-mercadopago`, en la rama
`feature/pago-citas-mercadopago`, ya consume este contrato. Abre el checkout con
`expo-web-browser` y consulta el estado al regresar al primer plano, al cerrar
el navegador en plataformas que notifican su cierre, o al pulsar el botón de consulta.
No confirma la cita por la URL de retorno: la autoridad es el estado persistido
por el backend. El resumen deja de ofrecer pago y detiene el temporizador al
recibir un pago aprobado. Si vence el apartado, mantiene su ID para consultar
un pago que todavía esté procesándose.

La consulta usa el ID de la cita mantenido en memoria. No prueba recuperación
después de cerrar completamente la app ni sustituye el módulo de historial.

## Publicación y Render

1. Revisar el diff local y sus pruebas antes de autorizar commit y publicación.
2. Integrar mediante PR y checks: `feature/* → develop → release → main`.
3. Confirmar que el commit desplegable de `main` contiene pagos y su corrección.
4. En Render, comprobar que el servicio sigue `main` y revisar las variables sin
   compartir sus valores:
   - `MP_ACCESS_TOKEN`: credencial de prueba de la aplicación correcta.
   - `MP_WEBHOOK_SECRET`: secreto de firma del webhook de esa aplicación.
   - `PUBLIC_BACKEND_URL=https://ladybarberappbackend-prod.onrender.com`.
5. `MP_ENV` no es consumida por este backend y no cambia el entorno del token.
6. `Save only` guarda las variables; no las aplica al proceso ya desplegado.
   Una vez integrado el código correcto, desplegar el último commit de `main`.
7. Comprobar en Events/Logs el SHA desplegado, arranque y health check.

## Mercado Pago Developers

Se reutiliza la aplicación de Mercado Pago de la web. Conservar en el panel su
URL de pruebas de ngrok y sus eventos actuales. No reemplazar esa URL por Render
ni restablecer su clave secreta: la web también depende de esta configuración.

El backend móvil envía por preferencia esta `notification_url`:

`https://ladybarberappbackend-prod.onrender.com/api/pagos/mercadopago/webhook`

Las URL enviadas al crear el pago tienen prioridad sobre la configuración del
panel, según la documentación de Mercado Pago. Así los pagos móviles pueden
notificar a Render conservando el destino existente de la web.
Usar en `MP_WEBHOOK_SECRET` de Render la clave real de esta misma aplicación,
verificada privadamente, y en `MP_ACCESS_TOKEN` sus credenciales de prueba.
Un secreto aleatorio creado en Render no valida las firmas de Mercado Pago.
La simulación del panel seguirá apuntando al destino web mientras conserve esa URL;
la recepción móvil debe validarse con un pago de prueba creado por este backend.
Usar comprador y vendedor de prueba diferentes y una tarjeta de prueba de México.
Verificar el origen de la credencial en el panel; el prefijo del token por sí
solo no demuestra que sea una credencial de pruebas.

## Validación en el teléfono

Una vez desplegado el backend corregido, iniciar Expo Go desde el worktree móvil:

```powershell
cd "C:\Users\Latitude 5320 eq1\Documents\Proyectos\LadyBarberApp-pago-citas-mercadopago"
$env:EXPO_PUBLIC_API_URL = 'https://ladybarberappbackend-prod.onrender.com/api'
npm start -- --go
```

Escanear el QR desde Expo Go en un teléfono conectado a la misma red del equipo.
No agregar secretos de Mercado Pago al móvil.
Reservar una cita de prueba identificable; comprobar total y anticipo del 50%.
Abrir Checkout Pro con el comprador de prueba, pagar con tarjeta de prueba y
volver a la aplicación para consultar el resultado.
Registrar por separado el estado del checkout, recepción del webhook, respuesta
HTTP y estado persistido de la cita. Repetir con rechazo y pendiente sin confirmar
la cita. Un webhook repetido no debe duplicar la evidencia ni degradar un aprobado.
La simulación de notificaciones del panel no sustituye una compra de prueba real.

No generar otro AAB en esta etapa. Esta guía no certifica un pago de extremo a extremo.

## Evidencia local y limitaciones

Backend: 58 pruebas unitarias/API y 10 pruebas MySQL local aprobadas; cero
vulnerabilidades reportadas por `npm audit --omit=dev --audit-level=high`.
La cobertura incluye migración repetida sin alterar pagos pendientes, defaults,
unicidad, monto incorrecto, pendiente/rechazado sin confirmar y aprobado protegido
contra una notificación tardía. El MySQL local de pruebas quedó detenido.

Móvil: la validación se registra en `docs/VALIDACION_PAGOS.md` del worktree móvil.
Ya dispone de configuración ESLint, dependencias propias y lockfile actualizado.
Se retiró únicamente el enlace local de dependencias; su destino se conservó.
En otro equipo se requiere instalar las dependencias desde el lockfile.

Los tests móviles simulan API y navegador; no llaman a Hostinger, Render o Mercado Pago.
La validación local no acredita publicación, despliegue, SQL remoto ni una compra
real o de prueba en Mercado Pago. Verificar esos pasos por separado.

## Referencias oficiales

- [Variables de entorno en Render](https://render.com/docs/configure-environment-variables)
- [Compras de prueba de Checkout Pro con Preferences](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases)
- [Notificaciones de Checkout Pro con Preferences](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/payment-notifications)
- [Cuentas de prueba](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/test-accounts)
