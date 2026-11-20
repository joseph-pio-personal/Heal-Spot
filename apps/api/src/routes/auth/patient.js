import { randomInt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { prisma } from "../../db.js";
import { hashOtp, normalizeMobile, normalizeName } from "../../auth/validation.js";
import { publicPatient, setSession } from "../../auth/session.js";
import { authRateLimit } from "../../auth/rate-limit.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import {
  hasPartialTextbeeConfiguration,
  isTextbeeConfigured,
} from "../../config/textbee.js";
import { sendSMS } from "../../services/sms.service.js";

const router = Router();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function patientOtpResponse(delivery) {
  if (!delivery) {
    return { message: "If verification is available, a code has been sent." };
  }

  const smsBatchId = typeof delivery.smsBatchId === "string" && delivery.smsBatchId.trim()
    ? delivery.smsBatchId
    : undefined;

  return {
    message: "Textbee accepted the SMS request. Delivery is not confirmed; check Messaging > History.",
    ...(smsBatchId ? { smsBatchId } : {}),
  };
}

async function requestPatientOtp(mobile) {
  const textbeeConfigured = isTextbeeConfigured();
  if (hasPartialTextbeeConfiguration()) {
    throw new ApiError(503, "Set both Textbee credentials to enable SMS verification.");
  }
  if (!textbeeConfigured && (process.env.NODE_ENV === "production" || process.env.OTP_DEV_MODE !== "true")) {
    throw new ApiError(503, "SMS verification is not configured for this environment.");
  }

  const code = String(randomInt(100000, 1000000));
  const challenge = await prisma.otpChallenge.create({
    data: {
      mobile,
      codeHash: hashOtp(mobile, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  if (!textbeeConfigured) {
    console.info(`[DEV OTP] ${code}`);
    return null;
  }

  try {
    return await sendSMS(mobile, `Your Heal Spot verification code is ${code}. It expires in 5 minutes.`);
  } catch (error) {
    await prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    console.error("Textbee verification SMS failed:", error.message);
    throw new ApiError(502, "Could not send the verification code. Please try again later.");
  }
}

router.post(
  "/register",
  authRateLimit(5, 15 * 60 * 1000),
  asyncRoute(async (request, response) => {
    const mobile = normalizeMobile(request.body?.mobile);
    normalizeName(request.body?.name);
    const delivery = await requestPatientOtp(mobile);
    response.status(202).json(patientOtpResponse(delivery));
  }),
);

router.post(
  "/login",
  authRateLimit(5, 15 * 60 * 1000),
  asyncRoute(async (request, response) => {
    const mobile = normalizeMobile(request.body?.mobile);
    const delivery = await requestPatientOtp(mobile);
    response.status(202).json(patientOtpResponse(delivery));
  }),
);

router.post(
  "/verify",
  authRateLimit(10, 15 * 60 * 1000),
  asyncRoute(async (request, response) => {
    const mobile = normalizeMobile(request.body?.mobile);
    const mode = request.body?.mode;
    const code = request.body?.code;
    if (!["register", "login"].includes(mode) || typeof code !== "string" || !/^\d{6}$/.test(code)) {
      throw new ApiError(400, "Enter the six-digit verification code.");
    }
    const name = mode === "register" ? normalizeName(request.body?.name) : undefined;
    const now = new Date();
    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        mobile,
        consumedAt: null,
        expiresAt: { gt: now },
        attemptCount: { lt: OTP_MAX_ATTEMPTS },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge) {
      throw new ApiError(401, "The code is invalid or expired. Request a new code.");
    }

    const expected = Buffer.from(challenge.codeHash, "hex");
    const submitted = Buffer.from(hashOtp(mobile, code), "hex");
    if (expected.length !== submitted.length || !timingSafeEqual(expected, submitted)) {
      await prisma.otpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, attemptCount: { lt: OTP_MAX_ATTEMPTS } },
        data: { attemptCount: { increment: 1 } },
      });
      throw new ApiError(401, "The code is invalid or expired. Request a new code.");
    }

    const result = await prisma.$transaction(async (transaction) => {
      const consumed = await transaction.otpChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attemptCount: { lt: OTP_MAX_ATTEMPTS },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) return { error: "invalid" };

      const existing = await transaction.patientAccount.findUnique({ where: { mobile } });
      if (mode === "register") {
        if (existing) return { error: "exists" };
        const account = await transaction.patientAccount.create({
          data: {
            mobile,
            verifiedAt: new Date(),
            profiles: { create: { name, mobile, relationship: "SELF" } },
          },
          include: { profiles: { orderBy: { createdAt: "asc" }, take: 1 } },
        });
        return { account };
      }

      if (!existing || existing.status !== "ACTIVE") return { error: "invalid" };
      const account = await transaction.patientAccount.findUnique({
        where: { mobile },
        include: { profiles: { orderBy: { createdAt: "asc" }, take: 1 } },
      });
      return { account };
    });

    if (result.error === "exists") {
      throw new ApiError(409, "This number already has an account. Sign in instead.");
    }
    if (result.error || !result.account) {
      throw new ApiError(401, "The code is invalid or expired. Request a new code.");
    }

    setSession(response, result.account.id, "PATIENT");
    response.json({ user: publicPatient(result.account) });
  }),
);

export { router as patientAuthRouter };
