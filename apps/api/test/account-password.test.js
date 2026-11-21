import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import test from "node:test";
import { changeAccountPassword } from "../src/services/account-password.js";

async function passwordDatabase(role) {
  const delegateName = role === "PATIENT" ? "patientAccount" : "doctor";
  const account = {
    id: `${role.toLowerCase()}-id`,
    passwordHash: await bcrypt.hash("current-password-123", 4),
    sessionVersion: 2,
    status: "ACTIVE",
  };
  let savedHash = account.passwordHash;
  let sessionVersion = account.sessionVersion;
  const auditEvents = [];
  const database = {
    [delegateName]: {
      findUnique: async () => ({ ...account, passwordHash: savedHash, sessionVersion }),
    },
    $transaction: async (operation) => operation({
      [delegateName]: {
        updateMany: async ({ where, data }) => {
          if (where.passwordHash !== savedHash || where.sessionVersion !== sessionVersion) {
            return { count: 0 };
          }
          savedHash = data.passwordHash;
          sessionVersion += data.sessionVersion.increment;
          return { count: 1 };
        },
        findUnique: async () => ({ id: account.id, sessionVersion }),
      },
      auditLog: {
        create: async ({ data }) => auditEvents.push(data),
      },
    }),
  };
  return { database, auditEvents, currentHash: () => savedHash, currentVersion: () => sessionVersion, account };
}

for (const role of ["PATIENT", "DOCTOR"]) {
  test(`${role.toLowerCase()} password change rotates the session version`, async () => {
    const fixture = await passwordDatabase(role);
    await assert.rejects(
      changeAccountPassword(fixture.database, {
        role,
        accountId: fixture.account.id,
        currentPassword: "wrong-password",
        newPassword: "a-different-password",
      }),
      (error) => error.status === 400,
    );

    const updated = await changeAccountPassword(fixture.database, {
      role,
      accountId: fixture.account.id,
      currentPassword: "current-password-123",
      newPassword: "a-different-password",
    });

    assert.equal(updated.sessionVersion, 3);
    assert.equal(fixture.currentVersion(), 3);
    assert.equal(await bcrypt.compare("a-different-password", fixture.currentHash()), true);
    assert.equal(fixture.auditEvents.length, role === "DOCTOR" ? 1 : 0);
  });
}
