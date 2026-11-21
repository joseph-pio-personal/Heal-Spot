import { ApiError } from "../lib/api-error.js";

export const STAFF_ROLES = new Set(["ADMIN", "RECEPTIONIST", "NURSE"]);

export function normalizeMobile(value) {
  if (typeof value !== "string") {
    throw new ApiError(400, "Enter a valid mobile number.");
  }

  const cleaned = value.trim().replace(/[\s()-]/g, "");
  const normalized = /^\d{10}$/.test(cleaned) ? `+91${cleaned}` : cleaned;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new ApiError(400, "Enter a valid mobile number with country code.");
  }
  return normalized;
}

export function normalizeName(value) {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > 160) {
    throw new ApiError(400, "Name must be between 2 and 160 characters.");
  }
  return value.trim();
}

export function normalizeEmail(value) {
  if (typeof value !== "string") {
    throw new ApiError(400, "Enter a valid email address.");
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Enter a valid email address.");
  }
  return email;
}

export function normalizeUsername(value) {
  if (typeof value !== "string") {
    throw new ApiError(400, "Enter a valid username.");
  }
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    throw new ApiError(400, "Username must be 3-32 characters and use letters, numbers, dots, underscores, or hyphens.");
  }
  return username;
}

export function normalizePatientIdentifier(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "Enter your email or username.");
  }
  const identifier = value.trim();
  return identifier.includes("@") ? normalizeEmail(identifier) : normalizeUsername(identifier);
}

export function normalizeOptionalMobile(value) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    return null;
  }
  return normalizeMobile(value);
}

export function passwordFromRequest(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < 12 || Buffer.byteLength(value, "utf8") > 72) {
    throw new ApiError(400, "Password must be between 12 and 72 bytes.");
  }
  return value;
}
