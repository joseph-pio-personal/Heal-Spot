import bcrypt from "bcryptjs";
import { passwordFromRequest } from "../auth/validation.js";
import { ApiError } from "../lib/api-error.js";

export async function changeStaffPassword(database, { staffId, currentPassword, newPassword }) {
  if (typeof currentPassword !== "string" || Buffer.byteLength(currentPassword, "utf8") > 72) {
    throw new ApiError(400, "Enter your current password.");
  }
  const validatedNewPassword = passwordFromRequest(newPassword);
  const staff = await database.staffUser.findUnique({
    where: { id: staffId },
    select: {
      id: true,
      role: true,
      isActive: true,
      passwordHash: true,
      sessionVersion: true,
    },
  });
  if (!staff || !staff.isActive) {
    throw new ApiError(401, "Your account is unavailable. Please sign in again.");
  }

  const currentPasswordMatches = await bcrypt.compare(currentPassword, staff.passwordHash);
  if (!currentPasswordMatches) {
    throw new ApiError(400, "Current password is incorrect.");
  }
  if (await bcrypt.compare(validatedNewPassword, staff.passwordHash)) {
    throw new ApiError(400, "Choose a new password that is different from your current password.");
  }

  const passwordHash = await bcrypt.hash(validatedNewPassword, 12);
  return database.$transaction(async (transaction) => {
    const result = await transaction.staffUser.updateMany({
      where: {
        id: staff.id,
        passwordHash: staff.passwordHash,
        sessionVersion: staff.sessionVersion,
        isActive: true,
      },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ApiError(409, "Your password changed in another session. Sign in again and retry.");
    }

    await transaction.auditLog.create({
      data: {
        staffUserId: staff.id,
        action: "STAFF_PASSWORD_CHANGED",
        entityType: "StaffUser",
        entityId: staff.id,
        details: {},
      },
    });
    return transaction.staffUser.findUnique({
      where: { id: staff.id },
      select: { id: true, role: true, sessionVersion: true },
    });
  });
}
