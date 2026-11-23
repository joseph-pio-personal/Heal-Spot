import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
} from "node:crypto";

function otpSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required to manage email verification codes.");
  return secret;
}

function encryptionKey() {
  return createHash("sha256").update(otpSecret()).digest();
}

export function generateEmailOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashEmailOtp(accountId, code) {
  return createHmac("sha256", otpSecret())
    .update(`${accountId}:${code}`)
    .digest("hex");
}

export function encryptEmailOtp(code) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptEmailOtp(value) {
  const [ivValue, tagValue, ciphertextValue] = String(value).split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Encrypted email code is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
