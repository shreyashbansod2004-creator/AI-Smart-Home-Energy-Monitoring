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

const router: IRouter = Router();

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
