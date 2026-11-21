import { Router } from "express";
import { authRateLimit } from "../../auth/rate-limit.js";
import { normalizeName, normalizeOptionalMobile } from "../../auth/validation.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import { normalizeId, optionalText } from "../../catalog/validation.js";
import { prisma } from "../../db.js";

const router = Router();
const MAX_PATIENT_PROFILES = 20;

router.use(authenticate, requireRole("PATIENT"));

router.get(
  "/",
  asyncRoute(async (request, response) => {
    const profiles = await prisma.patientProfile.findMany({
      where: { accountId: request.currentUser.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        mobile: true,
        relationship: true,
        createdAt: true,
      },
    });
    response.json({ profiles });
  }),
);

router.post(
  "/",
  authRateLimit(10, 15 * 60 * 1000),
  asyncRoute(async (request, response) => {
    const name = normalizeName(request.body?.name);
    const mobile = normalizeOptionalMobile(request.body?.mobile);
    const relationship = optionalText(request.body?.relationship, "Relationship", 40) ?? "FAMILY";
    const count = await prisma.patientProfile.count({
      where: { accountId: request.currentUser.id },
    });
    if (count >= MAX_PATIENT_PROFILES) {
      throw new ApiError(400, `A patient account can have up to ${MAX_PATIENT_PROFILES} profiles.`);
    }

    const profile = await prisma.patientProfile.create({
      data: {
        accountId: request.currentUser.id,
        name,
        mobile,
        relationship,
      },
      select: {
        id: true,
        name: true,
        mobile: true,
        relationship: true,
        createdAt: true,
      },
    });
    response.status(201).json({ profile });
  }),
);

router.patch(
  "/:id",
  asyncRoute(async (request, response) => {
    const id = normalizeId(request.params.id, "profile ID");
    const body = request.body ?? {};
    const data = {};
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      data.name = normalizeName(body.name);
    }
    if (Object.prototype.hasOwnProperty.call(body, "mobile")) {
      data.mobile = normalizeOptionalMobile(body.mobile);
    }
    if (Object.keys(data).length === 0) {
      throw new ApiError(400, "Provide a profile name or mobile number to update.");
    }

    const updated = await prisma.patientProfile.updateMany({
      where: { id, accountId: request.currentUser.id },
      data,
    });
    if (updated.count !== 1) throw new ApiError(404, "Patient profile not found.");

    const profile = await prisma.patientProfile.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        mobile: true,
        relationship: true,
        createdAt: true,
      },
    });
    response.json({ profile });
  }),
);

export { router as patientProfilesRouter };
