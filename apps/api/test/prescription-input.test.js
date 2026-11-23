import assert from "node:assert/strict";
import test from "node:test";
import { parsePrescriptionInput } from "../src/services/prescription-input.js";

const medication = {
  medicationName: "Example medicine",
  strength: "10 mg",
  dosage: "1 tablet",
  route: "Oral",
  frequency: "Twice daily",
  duration: "5 days",
  quantity: "10 tablets",
  instructions: "Take after meals",
};

test("prescription input normalizes structured medication details", () => {
  const parsed = parsePrescriptionInput({
    notes: "Follow-up if symptoms continue.",
    items: [{ ...medication, medicationName: "  Example medicine  " }],
  }, { requireMedication: true });

  assert.equal(parsed.notes, "Follow-up if symptoms continue.");
  assert.deepEqual(parsed.items[0], {
    ...medication,
    position: 1,
    medicationName: "Example medicine",
  });
});

test("drafts may be empty but final prescriptions require at least one medication", () => {
  assert.deepEqual(parsePrescriptionInput({ notes: "", items: [] }), { notes: null, items: [] });
  assert.throws(
    () => parsePrescriptionInput({ items: [] }, { requireMedication: true }),
    (error) => error.status === 400 && /at least one medication/.test(error.message),
  );
});

test("medication details and item count are validated", () => {
  assert.throws(
    () => parsePrescriptionInput({ items: [{ ...medication, dosage: " " }] }),
    (error) => error.status === 400 && /Dosage/.test(error.message),
  );
  assert.throws(
    () => parsePrescriptionInput({ items: Array.from({ length: 31 }, () => medication) }),
    (error) => error.status === 400 && /no more than 30/.test(error.message),
  );
});
