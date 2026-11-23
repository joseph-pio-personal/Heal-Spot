import { optionalText, requiredText } from "../catalog/validation.js";
import { ApiError } from "../lib/api-error.js";

const MAX_PRESCRIPTION_ITEMS = 30;

export function parsePrescriptionInput(body, { requireMedication = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Provide prescription details.");
  }
  if (!Array.isArray(body.items) || body.items.length > MAX_PRESCRIPTION_ITEMS) {
    throw new ApiError(400, `Add no more than ${MAX_PRESCRIPTION_ITEMS} medication items.`);
  }
  if (requireMedication && body.items.length === 0) {
    throw new ApiError(400, "Add at least one medication before finalizing the prescription.");
  }

  return {
    notes: optionalText(body.notes, "Prescription notes", 2000),
    items: body.items.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new ApiError(400, `Medication item ${index + 1} is invalid.`);
      }
      return {
        position: index + 1,
        medicationName: requiredText(item.medicationName, `Medication ${index + 1}`, 200),
        strength: optionalText(item.strength, "Strength", 100),
        dosage: requiredText(item.dosage, "Dosage", 120),
        route: optionalText(item.route, "Route", 80),
        frequency: requiredText(item.frequency, "Frequency", 120),
        duration: requiredText(item.duration, "Duration", 100),
        quantity: optionalText(item.quantity, "Quantity", 100),
        instructions: optionalText(item.instructions, "Additional instructions", 500),
      };
    }),
  };
}
