import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
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
import { enqueueEmail } from "../../notifications/outbox.js";
import { encryptEmailOtp, generateEmailOtpCode, hashEmailOtp } from "../../auth/email-otp.js";

const router = Router();
const DUMMY_PASSWORD_HASH = await bcrypt.hash("heal-spot-nonexistent-account", 12);
const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
const MAX_EMAIL_OTP_ATTEMPTS = 5;

async function queueVerificationOtp(transaction, account, code) {
  await transaction.patientAccount.update({
    where: { id: account.id },
    data: {
      verificationOtpHash: hashEmailOtp(account.id, code),
      verificationOtpExpiresAt: new Date(Date.now() + EMAIL_OTP_TTL_MS),
      verificationOtpAttempts: 0,
    },
  });
  await enqueueEmail(transaction, {
    dedupeKey: `patient-email-verification:${account.id}:${randomUUID()}`,
    eventType: "PATIENT_EMAIL_VERIFICATION",
    payload: { accountId: account.id, encryptedCode: encryptEmailOtp(code) },
  });
}

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

    const account = await prisma.$transaction(async (transaction) => {
      const code = generateEmailOtpCode();
      const createdAccount = await transaction.patientAccount.create({
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
      await queueVerificationOtp(transaction, createdAccount, code);
      return createdAccount;
    });

    response.status(201).json({
      message: "We sent a 6-digit verification code to your email address.",
      emailVerificationRequired: true,
      email: account.email,
    });
  }),
);

router.post(
  "/verify-email",
  authRateLimit(10, 15 * 60 * 1000),
  asyncRoute(async (request, response) => {
    const email = normalizeEmail(request.body?.email);
    const code = request.body?.code;
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
      throw new ApiError(400, "Enter the 6-digit code sent to your email.");
    }

    const account = await prisma.patientAccount.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        mobile: true,
        sessionVersion: true,
        verifiedAt: true,
        verificationOtpHash: true,
        verificationOtpExpiresAt: true,
        verificationOtpAttempts: true,
        profiles: { orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    const now = new Date();
    const validCode = account
      && !account.verifiedAt
      && account.verificationOtpHash
      && account.verificationOtpExpiresAt > now
      && account.verificationOtpAttempts < MAX_EMAIL_OTP_ATTEMPTS;

    if (!validCode || account.verificationOtpHash !== hashEmailOtp(account.id, code)) {
      if (account && !account.verifiedAt && account.verificationOtpAttempts < MAX_EMAIL_OTP_ATTEMPTS) {
        await prisma.patientAccount.updateMany({
          where: {
            id: account.id,
            verifiedAt: null,
            verificationOtpHash: account.verificationOtpHash,
            verificationOtpAttempts: { lt: MAX_EMAIL_OTP_ATTEMPTS },
          },
          data: { verificationOtpAttempts: { increment: 1 } },
        });
      }
      throw new ApiError(400, "The verification code is invalid or expired. Request a new code and try again.");
    }

    const verified = await prisma.patientAccount.updateMany({
      where: {
        id: account.id,
        verifiedAt: null,
        verificationOtpHash: account.verificationOtpHash,
        verificationOtpExpiresAt: { gt: now },
        verificationOtpAttempts: { lt: MAX_EMAIL_OTP_ATTEMPTS },
      },
      data: {
        verifiedAt: now,
        verificationOtpHash: null,
        verificationOtpExpiresAt: null,
        verificationOtpAttempts: 0,
      },
    });
    if (verified.count !== 1) {
      throw new ApiError(400, "The verification code is invalid or expired. Request a new code and try again.");
    }

    setSession(response, account.id, "PATIENT", account.sessionVersion);
    response.json({ user: publicPatient(account) });
  }),
);

router.post(
  "/resend-verification",
  authRateLimit(5, 15 * 60 * 1000),
  asyncRoute(async (request, response) => {
    const email = normalizeEmail(request.body?.email);
    const account = await prisma.patientAccount.findUnique({
      where: { email },
      select: { id: true, email: true, verifiedAt: true },
    });
    if (account && !account.verifiedAt) {
      const code = generateEmailOtpCode();
      await prisma.$transaction((transaction) => queueVerificationOtp(transaction, account, code));
    }
    response.json({
      message: "If an unverified account uses that address, a new verification code has been queued.",
    });
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
    if (!account.verifiedAt) {
      throw new ApiError(403, "Please verify your email address before signing in.");
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
