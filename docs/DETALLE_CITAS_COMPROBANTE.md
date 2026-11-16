# Detalle de citas y comprobante móvil

Trabajo local en `feature/detalle-citas-comprobante`, desde `origin/develop`.
No requiere migraciones ni cambios de variables de Mercado Pago.

## Contrato

- `GET /api/citas/mis-citas?offset=0`: mantiene la respuesta como arreglo, páginas de 40, orden por inicio e ID descendentes. `offset` es entero no negativo; el cliente solicita otra página cuando recibe 40 elementos.
- `GET /api/citas/:id`: JWT de CLIENTE y cuenta activa; resuelve el cliente desde la sesión y consulta por cita y propietario. Devuelve 404 tanto para cita inexistente como ajena.
- Detalle: folio, fecha, horario, estado, total, cliente, especialista, servicios con precio y duración de `citaservicio`, referencia/estado de pago y fecha de aprobación. No expone correo, secreto, token ni `rawData`.
- `comprobanteDisponible` solo es verdadero con `mp_status=approved` y evidencia coincidente en `pago_mercado_pago`, aprobada, en MXN y con monto válido. `anticipoPagado` toma el monto guardado; `saldoPendiente` resta ese anticipo del total. Sin evidencia, ambos son null.
- El saldo describe la diferencia respecto al anticipo registrado; no registra liquidaciones posteriores en caja ni reembolsos.

## Arquitectura

Ruta → controlador (identidad) → servicio (validaciones y elegibilidad) → repositorio (lecturas parametrizadas). La generación de PDF ocurre en el móvil.
Se conserva el procesamiento de pago por webhook existente.

## Publicación y pruebas

Antes de probar el detalle y PDF contra Render, este endpoint debe llegar por PR a develop, release y main, pasar los checks y desplegarse. Hasta entonces el backend publicado puede responder 404 al nuevo detalle y no paginar.
No ejecutar SQL en Hostinger. No mezclar el diagnóstico de firma preparado anteriormente, cuyo despliegue ya no es necesario para este flujo tras la corrección de credenciales reportada por el usuario.

Las pruebas de integración se ejecutan exclusivamente contra MySQL local efímero con las salvaguardas de `test/helpers/mysqlTestDb.js`.

Resultado local del 16 de noviembre de 2026: 63 pruebas unitarias/API y 10 de integración MySQL aprobadas. Las pruebas incluyen detalle con nombres y líneas históricas, cálculo del anticipo/saldo, paginación y rechazo de citas ajenas. La instancia efímera del puerto 3311 fue detenida y sus datos desechables eliminados al terminar; se conservaron los logs en `Microsoft`.
