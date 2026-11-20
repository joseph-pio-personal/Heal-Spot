import { execFileSync } from "node:child_process";
import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const command = process.argv.slice(2);
if (!["generate", "migrate"].includes(command[0])) {
  throw new Error("Supported Prisma commands are generate and migrate.");
}

execFileSync(
  process.execPath,
  [
    resolve(process.cwd(), "node_modules/prisma/build/index.js"),
    ...command,
    "--schema",
    "prisma/schema.prisma",
  ],
  { stdio: "inherit", env: process.env },
);
