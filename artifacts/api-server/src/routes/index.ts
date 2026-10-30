import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import appliancesRouter from "./appliances";
import energyRouter from "./energy";
import alertsRouter from "./alerts";
import predictionRouter from "./prediction";
import settingsRouter from "./settings";
import readingsRouter from "./readings";
import commandsRouter from "./commands";
import mlRouter from "./ml";
import demoRouter from "./demo";
import { DEMO_MODE_ENABLED } from "../lib/demo-mode";

const router: IRouter = Router();

// DEMO_MODE=true: the in-memory demo router answers first. Its routes never touch
// the database, the commands table or the ESP32. Without DEMO_MODE it is not mounted
// at all, so the real hardware routes below are unchanged.
if (DEMO_MODE_ENABLED) {
  router.use(demoRouter);
}

router.use(healthRouter);
router.use(dashboardRouter);
router.use(appliancesRouter);
router.use(energyRouter);
router.use(alertsRouter);
router.use(predictionRouter);
router.use(settingsRouter);
router.use(readingsRouter);
router.use(commandsRouter);
router.use(mlRouter);

export default router;
