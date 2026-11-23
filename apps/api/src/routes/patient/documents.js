import { Router } from "express";
import { normalizeId } from "../../catalog/validation.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { prisma } from "../../db.js";
import { readMedicalDocument } from "../../services/medical-document-storage.js";

const router = Router();

router.use(authenticate, requireRole("PATIENT"));

router.get(
  "/:documentId",
  asyncRoute(async (request, response) => {
    const documentId = normalizeId(request.params.documentId, "document ID");
    const document = await prisma.medicalDocument.findFirst({
      where: {
        id: documentId,
        type: "PRESCRIPTION",
        deletedAt: null,
        visit: {
          is: {
            booking: { is: { bookedByAccountId: request.currentUser.id } },
          },
        },
      },
      select: { id: true, storageKey: true, mimeType: true },
    });
    if (!document) throw new ApiError(404, "Prescription not found.");

    let buffer;
    try {
      buffer = await readMedicalDocument(document.storageKey);
    } catch (error) {
      if (error?.code === "ENOENT") throw new ApiError(404, "Prescription file not found.");
      throw error;
    }
    const extension = document.storageKey.slice(document.storageKey.lastIndexOf(".") + 1);
    response
      .set("Cache-Control", "private, no-store")
      .set("X-Content-Type-Options", "nosniff")
      .type(document.mimeType)
      .attachment(`prescription-${document.id}.${extension}`)
      .send(buffer);
  }),
);

export { router as patientDocumentsRouter };
