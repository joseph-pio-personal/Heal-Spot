import { ApiError } from "../lib/api-error.js";

const CATALOG_STATUSES = new Set(["ACTIVE", "INACTIVE"]);
const WEEKDAYS = new Set([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

export function normalizeId(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, `Invalid ${label}.`);
  }
  return value;
}

export function requiredText(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new ApiError(400, `${label} is required and must be no more than ${maxLength} characters.`);
  }
  return value.trim();
}

export function optionalText(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, label, maxLength);
}

export function parseStatus(value) {
  if (!CATALOG_STATUSES.has(value)) {
    throw new ApiError(400, "Status must be ACTIVE or INACTIVE.");
  }
  return value;
}

export function parseFee(value) {
  if (
    (typeof value !== "string" && typeof value !== "number")
    || !/^\d{1,8}(?:\.\d{1,2})?$/.test(String(value))
  ) {
    throw new ApiError(400, "Consultation fee must be a non-negative amount with up to two decimals.");
  }
  return String(value);
}

export function parseExperience(value) {
  if (value === undefined || value === null || value === "") return null;
  if (
    (typeof value !== "string" && typeof value !== "number")
    || !/^\d{1,2}$/.test(String(value))
  ) {
    throw new ApiError(400, "Experience must be a whole number from 0 to 80.");
  }
  const experience = Number(value);
  if (experience > 80) {
    throw new ApiError(400, "Experience must be a whole number from 0 to 80.");
  }
  return experience;
}

export function parsePhotoUrl(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 1000) {
    throw new ApiError(400, "Photo URL must be no more than 1000 characters.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, "Enter a valid HTTP or HTTPS photo URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ApiError(400, "Photo URL must use HTTP or HTTPS.");
  }
  return url.toString();
}

function parseTime(value, label) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new ApiError(400, `${label} must use 24-hour HH:mm format.`);
  }
  return value;
}

function toDatabaseTime(value) {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function fromDatabaseTime(value) {
  return value.toISOString().slice(11, 16);
}

export function parseSchedules(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 28) {
    throw new ApiError(400, "Add at least one schedule session and no more than 28.");
  }

  const schedules = value.map((schedule) => {
    if (!schedule || typeof schedule !== "object" || !WEEKDAYS.has(schedule.weekday)) {
      throw new ApiError(400, "Each schedule session needs a valid weekday.");
    }
    const startTime = parseTime(schedule.startTime, "Start time");
    const endTime = parseTime(schedule.endTime, "End time");
    if (startTime >= endTime) {
      throw new ApiError(400, "A session end time must be after its start time.");
    }
    if (!Number.isInteger(schedule.maxTokens) || schedule.maxTokens < 1 || schedule.maxTokens > 1000) {
      throw new ApiError(400, "Maximum tokens per session must be from 1 to 1000.");
    }
    if (schedule.isActive !== undefined && typeof schedule.isActive !== "boolean") {
      throw new ApiError(400, "Schedule isActive must be true or false.");
    }
    return {
      weekday: schedule.weekday,
      startTime,
      endTime,
      maxTokens: schedule.maxTokens,
      isActive: schedule.isActive !== false,
    };
  });

  const sessionsByDay = new Map();
  for (const schedule of schedules) {
    if (!schedule.isActive) continue;
    const sessions = sessionsByDay.get(schedule.weekday) ?? [];
    sessions.push(schedule);
    sessionsByDay.set(schedule.weekday, sessions);
  }
  for (const sessions of sessionsByDay.values()) {
    sessions.sort((left, right) => left.startTime.localeCompare(right.startTime));
    for (let index = 1; index < sessions.length; index += 1) {
      if (sessions[index].startTime < sessions[index - 1].endTime) {
        throw new ApiError(400, "Schedule sessions on the same day cannot overlap.");
      }
    }
  }
  return schedules;
}

export function toDatabaseSchedule(schedule) {
  return {
    weekday: schedule.weekday,
    startTime: toDatabaseTime(schedule.startTime),
    endTime: toDatabaseTime(schedule.endTime),
    maxTokens: schedule.maxTokens,
    isActive: schedule.isActive,
  };
}

export function serializeSchedule(schedule) {
  return {
    id: schedule.id,
    weekday: schedule.weekday,
    startTime: fromDatabaseTime(schedule.startTime),
    endTime: fromDatabaseTime(schedule.endTime),
    maxTokens: schedule.maxTokens,
    isActive: schedule.isActive,
  };
}
