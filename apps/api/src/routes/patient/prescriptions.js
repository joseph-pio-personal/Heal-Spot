import { Router } from "express";
import { normalizeId } from "../../catalog/validation.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { prisma } from "../../db.js";
import { dateString } from "../../booking/dates.js";

const router = Router();
const PRESCRIPTION_INCLUDE = {
  items: { orderBy: { position: "asc" } },
  doctor: { select: { id: true, name: true, department: { select: { name: true } } } },
  replacesPrescription: { select: { id: true, version: true } },
  amendment: { select: { id: true, version: true, status: true } },
  visit: {
    select: {
      booking: {
        select: {
          id: true,
          date: true,
          tokenNumber: true,
          patientProfile: { select: { name: true } },
        },
      },
    },
  },
};

router.use(authenticate, requireRole("PATIENT"), (_request, response, next) => {
  response.set("Cache-Control", "private, no-store");
  next();
});

function serializePrescription(prescription) {
  return {
    ...prescription,
    visit: {
      ...prescription.visit,
      booking: {
        ...prescription.visit.booking,
        date: dateString(prescription.visit.booking.date),
      },
    },
  };
}

router.get(
  "/",
  asyncRoute(async (request, response) => {
    const prescriptions = await prisma.prescription.findMany({
      where: {
        status: "FINALIZED",
        visit: { is: { booking: { is: { bookedByAccountId: request.currentUser.id } } } },
      },
      include: PRESCRIPTION_INCLUDE,
      orderBy: [{ issuedAt: "desc" }, { version: "desc" }],
    });
    response.json({ prescriptions: prescriptions.map(serializePrescription) });
  }),
);

router.get(
  "/:prescriptionId",
  asyncRoute(async (request, response) => {
    const prescriptionId = normalizeId(request.params.prescriptionId, "prescription ID");
    const prescription = await prisma.prescription.findFirst({
      where: {
        id: prescriptionId,
        status: "FINALIZED",
        visit: { is: { booking: { is: { bookedByAccountId: request.currentUser.id } } } },
      },
      include: PRESCRIPTION_INCLUDE,
    });
    if (!prescription) throw new ApiError(404, "Prescription not found.");
    await prisma.auditLog.create({
      data: {
        patientAccountId: request.currentUser.id,
        action: "PRESCRIPTION_VIEWED",
        entityType: "Prescription",
        entityId: prescription.id,
        details: { version: prescription.version },
      },
    });
    response.json({ prescription: serializePrescription(prescription) });
  }),
);

export { router as patientPrescriptionsRouter };
