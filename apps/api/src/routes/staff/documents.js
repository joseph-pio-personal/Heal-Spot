import express, { Router } from "express";
import { authRateLimit } from "../../auth/rate-limit.js";
import { normalizeId } from "../../catalog/validation.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { enqueueEmail } from "../../notifications/outbox.js";
import { prisma } from "../../db.js";
import { removeMedicalDocument, saveMedicalDocument } from "../../services/medical-document-storage.js";

const router = Router();
const prescriptionBody = express.raw({
  type: ["application/pdf", "image/jpeg", "image/png"],
  limit: "10mb",
});

router.use(authenticate, requireRole("ADMIN", "RECEPTIONIST", "NURSE"));

router.post(
  "/bookings/:bookingId/prescription",
  authRateLimit(20, 15 * 60 * 1000),
  prescriptionBody,
  asyncRoute(async (request, response) => {
    const bookingId = normalizeId(request.params.bookingId, "booking ID");
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        bookedByAccount: { select: { email: true } },
      },
    });
    if (!booking) throw new ApiError(404, "Booking not found.");
    if (booking.status !== "COMPLETED") {
      throw new ApiError(409, "Prescriptions can be uploaded after the visit is completed.");
    }

    const { storageKey, mimeType, fileSizeBytes } = await saveMedicalDocument(request.body);
    try {
      const document = await prisma.$transaction(async (transaction) => {
        const visit = await transaction.visit.upsert({
          where: { bookingId },
          create: { bookingId, completedAt: new Date() },
          update: {},
          select: { id: true },
        });
        const created = await transaction.medicalDocument.create({
          data: {
            visitId: visit.id,
            title: "Prescription",
            type: "PRESCRIPTION",
            storageKey,
            mimeType,
            fileSizeBytes: BigInt(fileSizeBytes),
            uploadedByStaffId: request.currentUser.id,
          },
          select: { id: true, title: true, type: true, mimeType: true, fileSizeBytes: true, uploadedAt: true },
        });
        await enqueueEmail(transaction, {
          dedupeKey: `prescription-available:${created.id}`,
          eventType: "PRESCRIPTION_AVAILABLE",
          payload: { documentId: created.id },
        });
        return created;
      });
      response.status(201).json({
        document: { ...document, fileSizeBytes: Number(document.fileSizeBytes) },
        emailStatus: booking.bookedByAccount?.email ? "QUEUED" : "NO_RECIPIENT",
      });
    } catch (error) {
      try {
        await removeMedicalDocument(storageKey);
      } catch (cleanupError) {
        console.error("Could not clean up an unused prescription file:", cleanupError?.message ?? cleanupError);
      }
      throw error;
    }
  }),
);

export { router as staffDocumentsRouter };
