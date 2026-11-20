import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing; configure it in the repository root .env file.");
}

if (!process.env.CORS_ORIGIN) {
  throw new Error("CORS_ORIGIN is missing; configure it in apps/api/.env.");
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set to a random value of at least 32 characters in apps/api/.env.");
}

const { app } = await import("./app.js");
const { prisma } = await import("./db.js");
const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => {
  console.log(`Heal Spot API listening on http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
