import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptEmailOtp,
  encryptEmailOtp,
  generateEmailOtpCode,
  hashEmailOtp,
} from "../src/auth/email-otp.js";

process.env.JWT_SECRET = "test-secret-with-more-than-thirty-two-characters";

test("email verification codes are six digits and are stored as account-bound hashes", () => {
  const code = generateEmailOtpCode();

  assert.match(code, /^\d{6}$/);
  assert.match(hashEmailOtp("account-one", code), /^[a-f0-9]{64}$/);
  assert.notEqual(hashEmailOtp("account-one", code), code);
  assert.notEqual(hashEmailOtp("account-one", code), hashEmailOtp("account-two", code));
  const encrypted = encryptEmailOtp(code);
  assert.notEqual(encrypted, code);
  assert.equal(decryptEmailOtp(encrypted), code);
  assert.throws(() => decryptEmailOtp(`${encrypted.slice(0, -1)}x`));
});
