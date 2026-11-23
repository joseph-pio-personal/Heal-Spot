import { ApiError } from "../lib/api-error.js";

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
export const DEFAULT_HOSPITAL_TIME_ZONE = "Asia/Kolkata";
export const BOOKING_WINDOW_DAYS = 7;

export function parseBookingDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, "Date must use YYYY-MM-DD format.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, "Enter a valid calendar date.");
  }
  return date;
}

export function dateString(date) {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(value, days) {
  const date = parseBookingDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateString(date);
}

export function weekdayForDate(value) {
  return WEEKDAYS[parseBookingDate(value).getUTCDay()];
}

function formatParts(date, timeZone, options) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, ...options })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
}

export function hospitalLocalDate(date, timeZone) {
  const parts = formatParts(date, timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function hospitalLocalTime(date, timeZone) {
  const parts = formatParts(date, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${parts.hour}:${parts.minute}`;
}

export function hospitalLocalDateTimeToUtc(dateValue, timeValue, timeZone) {
  parseBookingDate(dateValue);
  if (typeof timeValue !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) {
    throw new ApiError(400, "Time must use 24-hour HH:mm format.");
  }
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatParts(new Date(candidate), timeZone, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const observed = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    const correction = target - observed;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate);
}

export async function getHospitalTimeZone(database) {
  const settings = await database.hospitalSettings.findUnique({
    where: { id: "default" },
    select: { timezone: true },
  });
  return settings?.timezone || DEFAULT_HOSPITAL_TIME_ZONE;
}

export function assertWithinBookingWindow(value, timeZone, now = new Date()) {
  const today = hospitalLocalDate(now, timeZone);
  const latestDate = addCalendarDays(today, BOOKING_WINDOW_DAYS);
  if (value < today || value > latestDate) {
    throw new ApiError(400, `Bookings are available from today through ${latestDate}.`);
  }
}
