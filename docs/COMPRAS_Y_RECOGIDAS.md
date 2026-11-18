# Mis compras, comprobantes y plazo de recogida

Incluye compras propias paginadas, tres por página con Ver más y filtros Todas, Plazo vigente y Plazo vencido. Los nombres y precios provienen de la venta histórica coincidente y las imágenes del catálogo actual.

El comprobante exige pedido pagado, evidencia aprobada y venta coincidente. Incluye folio, cliente, fecha de aprobación, referencia Mercado Pago, productos, cantidades, importes, dirección y límite de recogida. Las 24 horas se calculan desde date_approved; consultar o descargar otra vez no renueva el plazo. Las compras antiguas sin evidencia coincidente no reciben fechas inventadas.

Al vencer se conserva el pago y se indica contactar al salón. No hay reembolsos ni prórrogas automáticos. Los filtros describen el plazo, no una entrega física.

## Alcance acordado
Se difieren panel del personal, códigos y registro de entrega única. El PDF y la fecha límite no impiden una segunda recogida ni prueban una entrega. No se requieren variables nuevas ni configuración del personal.

El backend respeta ruta → controlador → servicio → repositorio, JWT, cuenta activa, rol CLIENTE y propiedad por usuario.id. Guarda únicamente metadatos de fechas en el JSON existente de ventas_online.detalle, sin alterar tablas. El registro público móvil solo acepta CLIENTE, como protección independiente.

El frontend respeta MVVM + Repository, temas y barra inferior. Perfil → Mis compras permite vista previa y PDF guardable mediante el servicio común de archivos, con manejo de cancelación, errores y cambio de sesión. No agrega Compartir PDF.

## Validación
87 pruebas unitarias/API y 29 de integración MySQL local efímero aprobadas. La validación móvil cubre listado, filtros, vista previa, plantilla y guardado; la prueba física del selector y del checkout requiere desplegar y probar en Expo Go. No se ejecutó SQL en Hostinger ni se modificó la web. No se hizo commit ni push.
