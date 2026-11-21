import bcrypt from "bcryptjs";
import { Router } from "express";
import { authRateLimit } from "../../auth/rate-limit.js";
import { normalizeEmail } from "../../auth/validation.js";
import { publicDoctor, setSession } from "../../auth/session.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import { prisma } from "../../db.js";
import { changeAccountPassword } from "../../services/account-password.js";

const router = Router();
const DUMMY_PASSWORD_HASH = await bcrypt.hash("heal-spot-nonexistent-account", 12);

router.post(
  "/login",
  authRateLimit(10, 15 * 60 * 1000),
  asyncRoute(async (request, response) => {
    const email = normalizeEmail(request.body?.email);
    const password = request.body?.password;
    if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > 72) {
      throw new ApiError(401, "Email or password is incorrect.");
    }

    const doctor = await prisma.doctor.findUnique({ where: { email } });
    const passwordMatches = await bcrypt.compare(
      password,
      doctor?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (
      !doctor
      || doctor.status !== "ACTIVE"
      || !doctor.passwordHash
      || !passwordMatches
    ) {
      throw new ApiError(401, "Email or password is incorrect.");
    }

    setSession(response, doctor.id, "DOCTOR", doctor.sessionVersion);
    response.json({ user: publicDoctor(doctor) });
  }),
);

router.post(
  "/change-password",
  authRateLimit(5, 15 * 60 * 1000),
  authenticate,
  requireRole("DOCTOR"),
  asyncRoute(async (request, response) => {
    const updated = await changeAccountPassword(prisma, {
      role: "DOCTOR",
      accountId: request.currentUser.id,
      currentPassword: request.body?.currentPassword,
      newPassword: request.body?.newPassword,
    });
    setSession(response, updated.id, "DOCTOR", updated.sessionVersion);
    response.json({ message: "Password changed. Other doctor sessions have been signed out." });
  }),
);

export { router as doctorAuthRouter };
