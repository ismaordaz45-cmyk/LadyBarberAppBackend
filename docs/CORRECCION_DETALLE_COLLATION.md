# Corrección del detalle de cita y desbloqueo del comprobante

## Causa y cambio

El detalle publicado une `pago_mercado_pago` con `cita` mediante dos igualdades entre columnas de texto. La captura de Hostinger/MariaDB muestra collations `utf8mb4_uca1400_ai_ci` y `utf8mb4_unicode_ci`; la consulta falla con `Illegal mix of collations` antes de devolver datos al móvil.

El repositorio ahora consulta primero la cita por ID y cliente autenticado, después busca evidencia por los parámetros `paymentId` y `citaId` obtenidos de esa cita. Cada comparación usa la intercalación de su propia columna. Se mantienen el contrato de respuesta, las líneas de servicio históricas y las validaciones de pago del servicio. No se fuerza una collation específica ni se cambia el esquema de la base compartida.

Sin ID o sin evidencia coincidente, el detalle sigue disponible, pero no acredita un anticipo ni habilita un comprobante pagado. Una cita ajena sigue devolviendo 404 antes de consultar los pagos.

## Validación

- Regresión en MySQL local efímero con `utf8mb4_general_ci` en identificadores de pago y `utf8mb4_unicode_ci` en cita. MySQL no dispone de la collation UCA1400 de MariaDB; se reproduce el mismo conflicto de dos columnas IMPLICIT con intercalaciones distintas.
- La prueba de control conserva la igualdad anterior y exige `ER_CANT_AGGREGATE_2COLLATIONS`.
- Antes del ajuste, el endpoint devuelve 500 en esa prueba; después devuelve 200, servicios y anticipo/saldo correctos.
- Se comprueba que una evidencia vinculada a otra cita no habilite el comprobante.
- 64 pruebas unitarias/API y 11 de integración aprobadas.
- El móvil mantiene su plantilla y generación de PDF. Las 7 pruebas de detalle, plantilla y servicio de PDF pasan. También se generó una vista previa local en PDF con datos ficticios; eso no sustituye la prueba del selector nativo en el teléfono después del despliegue.

Referencia técnica: [precedencia de intercalaciones en expresiones SQL](https://dev.mysql.com/doc/refman/8.4/en/charset-collation-coercibility.html).

## Publicación y prueba real

Integrar `feature/corregir-detalle-citas-collation` por PR a develop, después release y main. Desplegar ese commit en Render. No ejecutar ALTER/SQL en Hostinger, no cambiar credenciales ni repetir pagos.
En Expo Go, volver a abrir una cita pagada: debe mostrar detalle y habilitar Generar y compartir PDF cuando exista evidencia coincidente aprobada.
