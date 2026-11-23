import { Router } from "express";
import { normalizeId } from "../../catalog/validation.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { enqueueEmail } from "../../notifications/outbox.js";
import { prisma } from "../../db.js";
import { parsePrescriptionInput } from "../../services/prescription-input.js";

const router = Router();
const PRESCRIPTION_INCLUDE = {
  items: { orderBy: { position: "asc" } },
  replacesPrescription: { select: { id: true, version: true } },
  amendment: { select: { id: true, version: true, status: true } },
};

router.use(authenticate, requireRole("DOCTOR"), (_request, response, next) => {
  response.set("Cache-Control", "private, no-store");
  next();
});

async function findEligibleBooking(transaction, bookingId, doctorId) {
  const booking = await transaction.booking.findFirst({
    where: { id: bookingId, doctorId },
    select: {
      id: true,
      doctorId: true,
      status: true,
      bookedByAccountId: true,
      patientProfileId: true,
    },
  });
  if (!booking) throw new ApiError(404, "Visit not found.");
  if (!["CALLED", "COMPLETED"].includes(booking.status)) {
    throw new ApiError(409, "Prescriptions can be created only for a called or completed visit.");
  }
  return booking;
}

async function replaceItems(transaction, prescriptionId, items) {
  await transaction.prescriptionItem.deleteMany({ where: { prescriptionId } });
  if (items.length) {
    await transaction.prescriptionItem.createMany({
      data: items.map((item) => ({ ...item, prescriptionId })),
    });
  }
}

async function lockOwnedPrescription(transaction, prescriptionId, doctorId, include) {
  const reference = await transaction.prescription.findFirst({
    where: { id: prescriptionId, doctorId },
    select: { visit: { select: { bookingId: true } } },
  });
  if (!reference) throw new ApiError(404, "Prescription draft not found.");

  await transaction.$queryRaw`
    SELECT "id" FROM "Booking" WHERE "id" = ${reference.visit.bookingId}::uuid FOR UPDATE
  `;
  await transaction.$queryRaw`
    SELECT "id" FROM "Prescription" WHERE "id" = ${prescriptionId}::uuid FOR UPDATE
  `;
  return transaction.prescription.findFirst({
    where: { id: prescriptionId, doctorId },
    include,
  });
}

router.get(
  "/bookings/:bookingId",
  asyncRoute(async (request, response) => {
    const bookingId = normalizeId(request.params.bookingId, "booking ID");
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, doctorId: request.currentUser.id },
      select: {
        id: true,
        status: true,
        patientProfile: { select: { name: true } },
        visit: {
          select: {
            prescriptions: {
              where: { doctorId: request.currentUser.id },
              orderBy: { version: "desc" },
              include: PRESCRIPTION_INCLUDE,
            },
          },
        },
      },
    });
    if (!booking) throw new ApiError(404, "Visit not found.");
    if (!["CALLED", "COMPLETED"].includes(booking.status)) {
      throw new ApiError(409, "Prescriptions are available only for a called or completed visit.");
    }
    response.json({
      booking: { id: booking.id, status: booking.status, patientName: booking.patientProfile.name },
      prescriptions: booking.visit?.prescriptions ?? [],
    });
  }),
);

router.post(
  "/bookings/:bookingId",
  asyncRoute(async (request, response) => {
    const bookingId = normalizeId(request.params.bookingId, "booking ID");
    const rawReplacesPrescriptionId = request.body?.replacesPrescriptionId;
    const replacesPrescriptionId = rawReplacesPrescriptionId == null
      ? null
      : normalizeId(rawReplacesPrescriptionId, "prescription ID");

    const prescription = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "Booking" WHERE "id" = ${bookingId}::uuid FOR UPDATE
      `;
      const booking = await findEligibleBooking(transaction, bookingId, request.currentUser.id);
      const visit = await transaction.visit.upsert({
        where: { bookingId },
        create: {
          bookingId,
          completedAt: booking.status === "COMPLETED" ? new Date() : null,
        },
        update: {},
        select: { id: true },
      });
      const latest = await transaction.prescription.findFirst({
        where: { visitId: visit.id },
        orderBy: { version: "desc" },
        select: { id: true, version: true, status: true },
      });
      if (latest?.status === "DRAFT") {
        throw new ApiError(409, "Save or finalize the existing draft before starting another prescription.");
      }
      if (latest && replacesPrescriptionId !== latest.id) {
        throw new ApiError(409, "Create this prescription as an amendment to the latest finalized version.");
      }
      if (!latest && replacesPrescriptionId) {
        throw new ApiError(409, "The prescription being amended does not exist for this visit.");
      }

      const created = await transaction.prescription.create({
        data: {
          visitId: visit.id,
          doctorId: request.currentUser.id,
          version: (latest?.version ?? 0) + 1,
          replacesPrescriptionId,
        },
        include: PRESCRIPTION_INCLUDE,
      });
      await transaction.auditLog.create({
        data: {
          doctorId: request.currentUser.id,
          action: replacesPrescriptionId ? "PRESCRIPTION_AMENDMENT_DRAFTED" : "PRESCRIPTION_DRAFT_CREATED",
          entityType: "Prescription",
          entityId: created.id,
          details: { bookingId, version: created.version, replacesPrescriptionId },
        },
      });
      return created;
    });

    response.status(201).json({ prescription });
  }),
);

router.put(
  "/:prescriptionId",
  asyncRoute(async (request, response) => {
    const prescriptionId = normalizeId(request.params.prescriptionId, "prescription ID");
    const input = parsePrescriptionInput(request.body);
    const prescription = await prisma.$transaction(async (transaction) => {
      const current = await lockOwnedPrescription(
        transaction,
        prescriptionId,
        request.currentUser.id,
        { visit: { include: { booking: { select: { id: true, status: true } } } } },
      );
      if (!current) throw new ApiError(404, "Prescription draft not found.");
      if (current.status !== "DRAFT") throw new ApiError(409, "Finalized prescriptions cannot be edited; create an amendment.");
      if (!["CALLED", "COMPLETED"].includes(current.visit.booking.status)) {
        throw new ApiError(409, "This visit is no longer available for prescription changes.");
      }

      await replaceItems(transaction, prescriptionId, input.items);
      const updated = await transaction.prescription.update({
        where: { id: prescriptionId },
        data: { notes: input.notes },
        include: PRESCRIPTION_INCLUDE,
      });
      await transaction.auditLog.create({
        data: {
          doctorId: request.currentUser.id,
          action: "PRESCRIPTION_DRAFT_SAVED",
          entityType: "Prescription",
          entityId: prescriptionId,
          details: { bookingId: current.visit.booking.id, version: current.version, itemCount: input.items.length },
        },
      });
      return updated;
    });
    response.json({ prescription });
  }),
);

router.post(
  "/:prescriptionId/finalize",
  asyncRoute(async (request, response) => {
    const prescriptionId = normalizeId(request.params.prescriptionId, "prescription ID");
    const input = parsePrescriptionInput(request.body, { requireMedication: true });
    const result = await prisma.$transaction(async (transaction) => {
      const current = await lockOwnedPrescription(
        transaction,
        prescriptionId,
        request.currentUser.id,
        {
          visit: {
            include: {
              booking: {
                select: {
                  id: true,
                  status: true,
                  bookedByAccountId: true,
                  bookedByAccount: { select: { email: true } },
                },
              },
            },
          },
        },
      );
      if (!current) throw new ApiError(404, "Prescription draft not found.");
      if (current.status !== "DRAFT") throw new ApiError(409, "This prescription has already been finalized.");
      if (!["CALLED", "COMPLETED"].includes(current.visit.booking.status)) {
        throw new ApiError(409, "This visit is no longer available for prescription changes.");
      }

      await replaceItems(transaction, prescriptionId, input.items);
      const prescription = await transaction.prescription.update({
        where: { id: prescriptionId },
        data: { notes: input.notes, status: "FINALIZED", issuedAt: new Date() },
        include: PRESCRIPTION_INCLUDE,
      });
      await transaction.auditLog.create({
        data: {
          doctorId: request.currentUser.id,
          action: "PRESCRIPTION_FINALIZED",
          entityType: "Prescription",
          entityId: prescriptionId,
          details: { bookingId: current.visit.booking.id, version: current.version, itemCount: input.items.length },
        },
      });
      const hasRecipient = Boolean(current.visit.booking.bookedByAccount?.email);
      if (hasRecipient) {
        await enqueueEmail(transaction, {
          dedupeKey: `prescription-finalized:${prescriptionId}`,
          eventType: "PRESCRIPTION_FINALIZED",
          payload: { prescriptionId },
        });
      }
      return { prescription, emailStatus: hasRecipient ? "QUEUED" : "NO_RECIPIENT" };
    });
    response.json(result);
  }),
);

export { router as doctorPrescriptionsRouter };
