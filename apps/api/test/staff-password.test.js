import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import test from "node:test";
import { changeStaffPassword } from "../src/services/staff-password.js";

async function passwordDatabase({ updateCount = 1 } = {}) {
  const staff = {
    id: "staff-id",
    role: "ADMIN",
    isActive: true,
    passwordHash: await bcrypt.hash("current-password-123", 4),
    sessionVersion: 7,
  };
  let savedPasswordHash = staff.passwordHash;
  let sessionVersion = staff.sessionVersion;
  const auditEvents = [];

  const database = {
    staffUser: {
      findUnique: async () => ({ ...staff, passwordHash: savedPasswordHash, sessionVersion }),
    },
    $transaction: async (operation) => operation({
      staffUser: {
        updateMany: async ({ where, data }) => {
          if (
            updateCount !== 1
            || where.passwordHash !== savedPasswordHash
            || where.sessionVersion !== sessionVersion
          ) {
            return { count: 0 };
          }
          savedPasswordHash = data.passwordHash;
          sessionVersion += data.sessionVersion.increment;
          return { count: 1 };
        },
        findUnique: async () => ({ id: staff.id, role: staff.role, sessionVersion }),
      },
      auditLog: {
        create: async ({ data }) => auditEvents.push(data),
      },
    }),
  };

  return {
    database,
    auditEvents,
    currentHash: () => savedPasswordHash,
    currentVersion: () => sessionVersion,
  };
}

test("staff password changes verify the current password and invalidate prior sessions", async () => {
  const fixture = await passwordDatabase();

  await assert.rejects(
    changeStaffPassword(fixture.database, {
      staffId: "staff-id",
      currentPassword: "wrong-password",
      newPassword: "a-different-password",
    }),
    (error) => error.status === 400,
  );
  await assert.rejects(
    changeStaffPassword(fixture.database, {
      staffId: "staff-id",
      currentPassword: "current-password-123",
      newPassword: "current-password-123",
    }),
    (error) => error.status === 400,
  );

  const updated = await changeStaffPassword(fixture.database, {
    staffId: "staff-id",
    currentPassword: "current-password-123",
    newPassword: "a-different-password",
  });

  assert.equal(updated.sessionVersion, 8);
  assert.equal(fixture.currentVersion(), 8);
  assert.equal(await bcrypt.compare("a-different-password", fixture.currentHash()), true);
  assert.equal(fixture.auditEvents[0].action, "STAFF_PASSWORD_CHANGED");
});

test("staff password change rejects invalid new passwords and concurrent updates", async () => {
  const fixture = await passwordDatabase();
  await assert.rejects(
    changeStaffPassword(fixture.database, {
      staffId: "staff-id",
      currentPassword: "current-password-123",
      newPassword: "short",
    }),
    (error) => error.status === 400,
  );

  const staleFixture = await passwordDatabase({ updateCount: 0 });
  await assert.rejects(
    changeStaffPassword(staleFixture.database, {
      staffId: "staff-id",
      currentPassword: "current-password-123",
      newPassword: "a-different-password",
    }),
    (error) => error.status === 409,
  );
  assert.equal(staleFixture.auditEvents.length, 0);
});
