const DIAS_SEMANA = [
  'DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO',
];

export const createCitasError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseLocalDate = (value) => {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw createCitasError(400, 'fecha debe tener el formato YYYY-MM-DD');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw createCitasError(400, 'fecha no es una fecha calendario válida');
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

const getCalendarDateInTimeZone = (now, timeZone) => {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
  } catch {
    throw createCitasError(500, 'BUSINESS_TIME_ZONE no es una zona horaria válida');
  }

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Number(values.year), Number(values.month) - 1, Number(values.day));
};

export const getMinimumBookingDate = (
  now = new Date(),
  timeZone = process.env.BUSINESS_TIME_ZONE || 'America/Mexico_City'
) => {
  const cursor = getCalendarDateInTimeZone(now, timeZone);
  let businessDays = 0;
  while (businessDays < 2) {
    cursor.setDate(cursor.getDate() + 1);
    const weekDay = cursor.getDay();
    if (weekDay !== 0 && weekDay !== 6) businessDays += 1;
  }
  return formatLocalDate(cursor);
};

export const parseTime = (value) => {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw createCitasError(400, 'horaInicio debe tener formato HH:mm o HH:mm:ss');

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw createCitasError(400, 'horaInicio no es una hora válida');
  }
  return {
    text: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    minutes: hours * 60 + minutes + seconds / 60,
  };
};

export const normalizeBookingRequest = (request, now = new Date()) => {
  const clienteId = Number(request?.clienteId);
  const empleadaId = Number(request?.empleadaId);
  if (!Number.isInteger(clienteId) || clienteId < 1) throw createCitasError(400, 'clienteId inválido');
  if (!Number.isInteger(empleadaId) || empleadaId < 1) throw createCitasError(400, 'empleadaId inválido');

  const fecha = formatLocalDate(parseLocalDate(request?.fecha));
  const minimumDate = getMinimumBookingDate(now);
  if (fecha < minimumDate) {
    throw createCitasError(400, `La cita requiere al menos 2 días hábiles de anticipación. Fecha mínima: ${minimumDate}`);
  }

  const horaInicio = parseTime(request?.horaInicio).text;
  if (!Array.isArray(request?.serviciosIds) || request.serviciosIds.length === 0) {
    throw createCitasError(400, 'Debe seleccionar al menos un servicio');
  }
  const serviciosIds = request.serviciosIds.map(Number);
  if (serviciosIds.some((id) => !Number.isInteger(id) || id < 1)) {
    throw createCitasError(400, 'Cada servicio debe tener un ID entero positivo');
  }
  if (new Set(serviciosIds).size !== serviciosIds.length) {
    throw createCitasError(400, 'Los servicios no deben contener duplicados');
  }
  return { clienteId, empleadaId, fecha, horaInicio, serviciosIds };
};

export const buildBookingDateRange = (fecha, horaInicio, durationMinutes) => {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw createCitasError(400, 'Los servicios deben tener una duración válida');
  }
  const date = parseLocalDate(fecha);
  const time = parseTime(horaInicio);
  const start = new Date(date);
  start.setHours(Math.floor(time.minutes / 60), Math.floor(time.minutes % 60), 0, 0);
  return { start, end: new Date(start.getTime() + durationMinutes * 60 * 1000) };
};

export const toMysqlDateTime = (date) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export const getBusinessDayName = (fecha) => DIAS_SEMANA[parseLocalDate(fecha).getDay()];

export const timeToMinutes = (value) => {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
};
