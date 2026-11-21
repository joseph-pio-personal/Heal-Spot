import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../../db.js";
import { authRateLimit } from "../../auth/rate-limit.js";
import { normalizeEmail, STAFF_ROLES } from "../../auth/validation.js";
import { publicStaff, setSession } from "../../auth/session.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import { changeStaffPassword } from "../../services/staff-password.js";

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
    const staff = await prisma.staffUser.findUnique({ where: { email } });
    const passwordMatches = await bcrypt.compare(
      password,
      staff?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!staff || !staff.isActive || !passwordMatches) {
      throw new ApiError(401, "Email or password is incorrect.");
    }

    setSession(response, staff.id, staff.role, staff.sessionVersion);
    response.json({ user: publicStaff(staff) });
  }),
);

router.post(
  "/change-password",
  authRateLimit(5, 15 * 60 * 1000),
  authenticate,
  requireRole(...STAFF_ROLES),
  asyncRoute(async (request, response) => {
    const updated = await changeStaffPassword(prisma, {
      staffId: request.currentUser.id,
      currentPassword: request.body?.currentPassword,
      newPassword: request.body?.newPassword,
    });

    setSession(response, updated.id, updated.role, updated.sessionVersion);
    response.json({ message: "Password changed. Other staff sessions have been signed out." });
  }),
);

export { router as staffAuthRouter };
