import bcrypt from "bcryptjs";
import { passwordFromRequest } from "../auth/validation.js";
import { ApiError } from "../lib/api-error.js";

const PASSWORD_ACCOUNT_CONFIG = {
  PATIENT: {
    delegate: "patientAccount",
    activeField: "status",
    activeValue: "ACTIVE",
    auditAction: null,
    entityType: null,
  },
  DOCTOR: {
    delegate: "doctor",
    activeField: "status",
    activeValue: "ACTIVE",
    auditAction: "DOCTOR_PASSWORD_CHANGED",
    entityType: "Doctor",
  },
};

export async function changeAccountPassword(database, {
  role,
  accountId,
  currentPassword,
  newPassword,
}) {
  const config = PASSWORD_ACCOUNT_CONFIG[role];
  if (!config) throw new ApiError(403, "Password change is not available for this account.");
  if (
    typeof currentPassword !== "string"
    || Buffer.byteLength(currentPassword, "utf8") === 0
    || Buffer.byteLength(currentPassword, "utf8") > 72
  ) {
    throw new ApiError(400, "Enter your current password.");
  }
  const validatedNewPassword = passwordFromRequest(newPassword);
  const delegate = database[config.delegate];
  const account = await delegate.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      passwordHash: true,
      sessionVersion: true,
      [config.activeField]: true,
    },
  });
  if (
    !account
    || account[config.activeField] !== config.activeValue
    || !account.passwordHash
  ) {
    throw new ApiError(401, "Your account is unavailable. Please sign in again.");
  }

  if (!await bcrypt.compare(currentPassword, account.passwordHash)) {
    throw new ApiError(400, "Current password is incorrect.");
  }
  if (await bcrypt.compare(validatedNewPassword, account.passwordHash)) {
    throw new ApiError(400, "Choose a new password that is different from your current password.");
  }

  const passwordHash = await bcrypt.hash(validatedNewPassword, 12);
  return database.$transaction(async (transaction) => {
    const result = await transaction[config.delegate].updateMany({
      where: {
        id: account.id,
        passwordHash: account.passwordHash,
        sessionVersion: account.sessionVersion,
        [config.activeField]: config.activeValue,
      },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ApiError(409, "Your password changed in another session. Sign in again and retry.");
    }

    if (config.auditAction) {
      await transaction.auditLog.create({
        data: {
          action: config.auditAction,
          entityType: config.entityType,
          entityId: account.id,
          details: {},
        },
      });
    }
    return transaction[config.delegate].findUnique({
      where: { id: account.id },
      select: { id: true, sessionVersion: true },
    });
  });
}
