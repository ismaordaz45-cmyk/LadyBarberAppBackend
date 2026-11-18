const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
export function crearRegistroRecogida(fechaAprobacion) {
  const fecha = typeof fechaAprobacion === 'string' ? Date.parse(fechaAprobacion) : NaN;
  if (!Number.isFinite(fecha)) throw fail(409, 'El pago aprobado no incluye una fecha de aprobación válida');
  return { version: 1, aprobadoEn: new Date(fecha).toISOString(),
    limiteEn: new Date(fecha + 24 * 60 * 60000).toISOString() };
}
export function estadoRecogida(pedido, registro, ahora = Date.now()) {
  if (pedido.paymentStatus !== 'approved' || pedido.estado !== 'pagado') return 'no_disponible';
  if (registro?.version !== 1 || !Number.isFinite(Date.parse(registro.aprobadoEn))
    || Date.parse(registro.limiteEn) - Date.parse(registro.aprobadoEn) !== 24 * 3600000) return 'sin_registro';
  return ahora >= Date.parse(registro.limiteEn) ? 'vencida' : 'vigente';
}
