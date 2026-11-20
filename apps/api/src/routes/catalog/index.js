import { Router } from "express";
import { departmentRouter } from "./departments.js";
import { doctorRouter } from "./doctors.js";

const router = Router();

router.use(departmentRouter);
router.use(doctorRouter);

export { router as catalogRouter };
