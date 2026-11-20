import { Router } from "express";
import { clearSession } from "../../auth/session.js";
import { authenticate } from "../../middleware/authenticate.js";
import { patientAuthRouter } from "./patient.js";
import { staffAuthRouter } from "./staff.js";
import { staffAdminRouter } from "../admin/staff.js";

const router = Router();

router.use("/patient", patientAuthRouter);
router.use("/staff", staffAuthRouter);
router.use("/admin/staff", staffAdminRouter);

router.get(
  "/me",
  authenticate,
  (request, response) => response.json({ user: request.currentUser }),
);

router.post("/logout", (_request, response) => {
  clearSession(response);
  response.status(204).end();
});

export { router as authRouter };
