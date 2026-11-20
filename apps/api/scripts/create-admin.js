import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { resolve } from "node:path";
import { prisma } from "../src/db.js";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing; configure it in the repository root .env file.");
}
if (!name || name.length < 2 || name.length > 160) {
  throw new Error("Set BOOTSTRAP_ADMIN_NAME to a name between 2 and 160 characters.");
}
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  throw new Error("Set BOOTSTRAP_ADMIN_EMAIL to a valid email address.");
}
if (typeof password !== "string" || Buffer.byteLength(password, "utf8") < 12 || Buffer.byteLength(password, "utf8") > 72) {
  throw new Error("Set BOOTSTRAP_ADMIN_PASSWORD to a password between 12 and 72 bytes.");
}

try {
  const adminCount = await prisma.staffUser.count({ where: { role: "ADMIN" } });
  if (adminCount > 0) {
    throw new Error("An admin account already exists. Create additional staff while signed in as an admin.");
  }

  await prisma.staffUser.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
    },
  });
  console.info(`Initial admin account created for ${email}.`);
} finally {
  await prisma.$disconnect();
}
