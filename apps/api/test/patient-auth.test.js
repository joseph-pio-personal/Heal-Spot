import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOptionalMobile,
  normalizePatientIdentifier,
  normalizeUsername,
} from "../src/auth/validation.js";

test("patient usernames are case-insensitive and normalized", () => {
  assert.equal(normalizeUsername("  Jane_Doe "), "jane_doe");
  assert.equal(normalizePatientIdentifier("Jane_Doe"), "jane_doe");
});

test("patient login identifiers normalize email addresses", () => {
  assert.equal(normalizePatientIdentifier(" Patient@Example.com "), "patient@example.com");
});

test("optional patient mobile numbers are normalized only when supplied", () => {
  assert.equal(normalizeOptionalMobile("9876543210"), "+919876543210");
  assert.equal(normalizeOptionalMobile(" "), null);
  assert.equal(normalizeOptionalMobile(undefined), null);
});

test("invalid patient usernames are rejected", () => {
  assert.throws(() => normalizeUsername("has spaces"), (error) => error.status === 400);
});
