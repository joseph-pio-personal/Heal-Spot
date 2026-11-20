export const TEXTBEE_BASE_URL = "https://api.textbee.dev/api/v1";

export function getTextbeeApiKey() {
  const apiKey = process.env.TEXTBEE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("TEXTBEE_API_KEY is not configured in apps/api/.env.");
  }
  return apiKey;
}

export function getTextbeeDeviceId() {
  const deviceId = process.env.TEXTBEE_DEVICE_ID?.trim();
  if (!deviceId) {
    throw new Error("TEXTBEE_DEVICE_ID is not configured in apps/api/.env.");
  }
  return deviceId;
}

export function isTextbeeConfigured() {
  return Boolean(process.env.TEXTBEE_API_KEY?.trim() && process.env.TEXTBEE_DEVICE_ID?.trim());
}

export function hasPartialTextbeeConfiguration() {
  return Boolean(process.env.TEXTBEE_API_KEY?.trim()) !== Boolean(process.env.TEXTBEE_DEVICE_ID?.trim());
}
