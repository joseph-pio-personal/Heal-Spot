import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { authRouter } from "./routes/auth/index.js";
import { catalogRouter } from "./routes/catalog/index.js";
import { bookingsRouter } from "./routes/bookings.js";
import { patientProfilesRouter } from "./routes/patient/profiles.js";
import { patientDocumentsRouter } from "./routes/patient/documents.js";
import { profileRouter } from "./routes/profile.js";
import { staffQueueRouter } from "./routes/staff/queue.js";
import { staffLeavesRouter } from "./routes/staff/leaves.js";
import { staffDocumentsRouter } from "./routes/staff/documents.js";
import { doctorDashboardRouter } from "./routes/doctor/dashboard.js";
import { ApiError } from "./lib/api-error.js";
import { prisma } from "./db.js";

const app = express();
const configuredOrigins = new Set(
  (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    const localDevelopmentOrigin = process.env.NODE_ENV !== "production"
      && /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin ?? "");
    if (!origin || configuredOrigins.has(origin) || localDevelopmentOrigin) {
      callback(null, origin ?? false);
      return;
    }
    callback(null, false);
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "heal-spot-api" });
});

app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/patient/profiles", patientProfilesRouter);
app.use("/api/patient/documents", patientDocumentsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/staff/queue", staffQueueRouter);
app.use("/api/staff/leaves", staffLeavesRouter);
app.use("/api/staff", staffDocumentsRouter);
app.use("/api/doctor", doctorDashboardRouter);
app.use("/api", catalogRouter);

app.get("/api/health/ready", async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.json({ status: "ready", database: "connected" });
  } catch (error) {
    console.error("Database readiness check failed:", error);
    response.status(503).json({ status: "not_ready", database: "unavailable" });
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: error.message });
    return;
  }

  if (error?.code === "P2002") {
    response.status(409).json({ error: "A record with the same unique value already exists." });
    return;
  }

  if (error?.type === "entity.parse.failed") {
    response.status(400).json({ error: "Request body must be valid JSON." });
    return;
  }

  if (error?.type === "entity.too.large") {
    response.status(413).json({ error: "Request body exceeds the allowed size." });
    return;
  }

  console.error("Unexpected API error:", error);
  response.status(500).json({ error: "An unexpected error occurred." });
});

app.use((request, response) => {
  response.status(404).json({
    error: "Not found",
    path: request.path,
  });
});

export { app };
