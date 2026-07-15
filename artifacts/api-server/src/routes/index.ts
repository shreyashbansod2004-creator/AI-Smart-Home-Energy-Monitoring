import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import appliancesRouter from "./appliances";
import energyRouter from "./energy";
import alertsRouter from "./alerts";
import predictionRouter from "./prediction";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(appliancesRouter);
router.use(energyRouter);
router.use(alertsRouter);
router.use(predictionRouter);
router.use(settingsRouter);

export default router;
