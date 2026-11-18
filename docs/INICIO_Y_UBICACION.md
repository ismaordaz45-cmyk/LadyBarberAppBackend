# Resumen de Inicio y perfil público del salón

## Comportamiento

`GET /api/cliente/resumen` mantiene su autenticación y contrato. La próxima cita se obtiene únicamente del cliente autenticado, ordenada por inicio e identificador, excluyendo reservas pasadas y apartados vencidos. Incluye los nombres de servicios y horas locales del negocio.

- Total: todas las citas del cliente, incluyendo historial.
- Pendientes: citas vigentes por atender; los apartados dejan de contar al cumplir los 30 minutos desde `creadoEn`.
- Completadas: citas en estado `COMPLETADA`.

Las horas reservadas se comparan con la hora actual de `BUSINESS_TIME_ZONE` (por defecto America/Mexico_City). La vigencia del apartado conserva el reloj de la base para comparar `creadoEn`.

## Perfil público

`GET /api/perfil-empresa` devuelve el primer perfil activo de la tabla existente `perfil_empresa`, ordenado por ID. No requiere sesión y expone solo estos campos públicos:

`id`, `nombre`, `logo`, `direccion`, `ubicacion`, `telefono`, `horarioAtencion`.

Devuelve 404 si no hay perfil activo. Se mantiene la separación ruta → controlador → servicio → repositorio. El administrador continúa editando los datos desde la web; el backend móvil solo los consulta.

La app usa dirección y ubicación para abrir indicaciones en Google Maps o en el navegador. Este endpoint no necesita claves de Maps ni permisos de geolocalización del cliente.

## Validación y despliegue

- 66 pruebas unitarias/API aprobadas.
- 13 pruebas de integración con MySQL local efímero aprobadas, incluyendo perfil activo con ubicación, aislamiento por cliente y exclusión de apartados vencidos.
- Prueba manual de Ubicación en Expo Go confirmada por el usuario.
- Sin migraciones, variables nuevas o cambios de Mercado Pago. No se ejecutó SQL en Hostinger ni se modificó el proyecto web.

Los cambios del frontend se mantienen en su propio repositorio. Integrar este backend mediante feature → develop → release → main, con los checks y la revisión humana exigidos por la política del equipo, antes de desplegar en Render.
