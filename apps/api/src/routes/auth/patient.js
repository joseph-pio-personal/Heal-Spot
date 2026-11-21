import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../../db.js";
import {
  normalizeEmail,
  normalizeName,
  normalizeOptionalMobile,
  normalizePatientIdentifier,
  normalizeUsername,
  passwordFromRequest,
} from "../../auth/validation.js";
import { publicPatient, setSession } from "../../auth/session.js";
import { authRateLimit } from "../../auth/rate-limit.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { changeAccountPassword } from "../../services/account-password.js";

const router = Router();
const DUMMY_PASSWORD_HASH = await bcrypt.hash("heal-spot-nonexistent-account", 12);

router.post(
  "/register",
  authRateLimit(5, 15 * 60 * 1000),
  asyncRoute(async (request, response) => {
    const name = normalizeName(request.body?.name);
    const email = normalizeEmail(request.body?.email);
    const username = normalizeUsername(request.body?.username);
    const password = passwordFromRequest(request.body?.password);
    const mobile = normalizeOptionalMobile(request.body?.mobile);

    const existing = await prisma.patientAccount.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(409, "An account with that email or username already exists.");
    }

    const account = await prisma.patientAccount.create({
      data: {
        email,
        username,
        passwordHash: await bcrypt.hash(password, 12),
        mobile,
        profiles: {
          create: {
            name,
            mobile,
            relationship: "SELF",
          },
        },
      },
      include: { profiles: { orderBy: { createdAt: "asc" }, take: 1 } },
    });

    setSession(response, account.id, "PATIENT", account.sessionVersion);
    response.status(201).json({ user: publicPatient(account) });
  }),
);

router.post(
  "/login",
  authRateLimit(10, 15 * 60 * 1000),
  asyncRoute(async (request, response) => {
    const identifier = normalizePatientIdentifier(request.body?.identifier);
    const password = request.body?.password;
    if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > 72) {
      throw new ApiError(401, "Email, username, or password is incorrect.");
    }

    const account = await prisma.patientAccount.findFirst({
      where: identifier.includes("@") ? { email: identifier } : { username: identifier },
      include: { profiles: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    const passwordMatches = await bcrypt.compare(
      password,
      account?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!account || !account.passwordHash || account.status !== "ACTIVE" || !passwordMatches) {
      throw new ApiError(401, "Email, username, or password is incorrect.");
    }

    setSession(response, account.id, "PATIENT", account.sessionVersion);
    response.json({ user: publicPatient(account) });
  }),
);

router.post(
  "/change-password",
  authRateLimit(5, 15 * 60 * 1000),
  authenticate,
  requireRole("PATIENT"),
  asyncRoute(async (request, response) => {
    const updated = await changeAccountPassword(prisma, {
      role: "PATIENT",
      accountId: request.currentUser.id,
      currentPassword: request.body?.currentPassword,
      newPassword: request.body?.newPassword,
    });
    setSession(response, updated.id, "PATIENT", updated.sessionVersion);
    response.json({ message: "Password changed. Other patient sessions have been signed out." });
  }),
);

export { router as patientAuthRouter };
