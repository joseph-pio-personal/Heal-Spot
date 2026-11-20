import { createHmac } from "node:crypto";
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

export function passwordFromRequest(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < 12 || Buffer.byteLength(value, "utf8") > 72) {
    throw new ApiError(400, "Password must be between 12 and 72 bytes.");
  }
  return value;
}

export function hashOtp(mobile, code) {
  return createHmac("sha256", process.env.JWT_SECRET)
    .update(`${mobile}:${code}`)
    .digest("hex");
}
