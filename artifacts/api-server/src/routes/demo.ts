import { Router } from "express";
import {
  DEMO_APPLIANCES,
  GetAlertsResponse,
  GetAppliancesResponse,
  GetDashboardSummaryResponse,
  GetEnergyConsumptionResponse,
  GetLiveMetricsResponse,
  GetSettingsResponse,
  ToggleApplianceBody,
  ToggleApplianceParams,
  ToggleApplianceResponse,
  TurnAllOffResponse,
  estimateBillInr,
  getAppliancePowerRatingW,
  simulateElectricalReadings,
} from "@workspace/api-zod";
import {
  getDemoEnergyKwh,
  getDemoPowerW,
  getDemoStates,
  setDemoAppliance,
  turnAllDemoOff,
} from "../lib/demo-mode";

/**
 * DEMO MODE — SIMULATED READINGS. Mounted ahead of every other router, and only
 * when DEMO_MODE=true (see routes/index.ts). Nothing here touches a database,
 * the commands table or the ESP32, and nothing simulated is stored as a sensor
 * reading. Appliance state lives in server memory.
 */
const router = Router();

// Same defaults the real settings route seeds; used because there is no database.
const DEMO_TARIFF_PER_KWH = 8.5;
const DEMO_MONTHLY_BUDGET_INR = 1500;

const NOT_AVAILABLE =
  "Not available in DEMO MODE: this feature needs real historical data from the database.";

/** Never let NaN/Infinity reach the frontend. */
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function applianceView(id: string) {
  const def = DEMO_APPLIANCES.find((a) => a.id === id)!;
  const isOn = getDemoStates().find((s) => s.id === id)?.isOn === true;
  return {
    id: def.id,
    name: def.name,
    location: def.location,
    isOn,
    // Rated power from the one central config; 0 while OFF (as the real route does).
    powerW: isOn ? getAppliancePowerRatingW(def.id, 0) : 0,
    // No real usage history exists in demo mode.
    todayUsageKwh: 0,
    monthlyCostInr: 0,
    iconType: def.iconType,
    runningHoursToday: 0,
  };
}

// ── Appliances (in-memory) ───────────────────────────────────────────────────

router.get("/appliances", (_req, res): void => {
  res.json(GetAppliancesResponse.parse(DEMO_APPLIANCES.map((a) => applianceView(a.id))));
});

router.patch("/appliances/:id/toggle", (req, res): void => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ToggleApplianceParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: "Invalid appliance id" });
    return;
  }
  const body = ToggleApplianceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!setDemoAppliance(params.data.id, body.data.isOn)) {
    res.status(404).json({ error: "Appliance not found" });
    return;
  }
  res.json(ToggleApplianceResponse.parse(applianceView(params.data.id)));
});

router.post("/appliances/turn-all-off", (_req, res): void => {
  turnAllDemoOff();
  res.json(
    TurnAllOffResponse.parse({
      success: true,
      message: "All demo appliances turned off (simulated; no hardware command sent)",
    }),
  );
});

// ── Dashboard (simulated) ────────────────────────────────────────────────────

router.get("/dashboard/summary", (_req, res): void => {
  const sim = simulateElectricalReadings(getDemoPowerW()) ?? simulateElectricalReadings(0)!;
  const { todayKwh, monthKwh } = getDemoEnergyKwh();
  const states = getDemoStates();

  res.json(
    GetDashboardSummaryResponse.parse({
      currentPowerW: finite(sim.currentPowerW),
      todayEnergyKwh: finite(parseFloat(todayKwh.toFixed(6))),
      monthEnergyKwh: finite(parseFloat(monthKwh.toFixed(6))),
      estimatedBillInr: finite(
        parseFloat(estimateBillInr(monthKwh, DEMO_TARIFF_PER_KWH).toFixed(4)),
      ),
      voltageV: sim.voltageV,
      currentA: finite(sim.currentA),
      powerFactorKw: finite(parseFloat((sim.currentPowerW / 1000).toFixed(4))),
      // No simulated history exists to compare against.
      todayChangePercent: 0,
      monthChangePercent: 0,
      billChangePercent: 0,
      systemStatus: "online",
      lastUpdated: new Date().toISOString(),
      activeApplianceCount: states.filter((s) => s.isOn).length,
      totalApplianceCount: states.length,
      demoMode: true,
      powerFactor: sim.powerFactor,
    }),
  );
});

router.get("/dashboard/live", (_req, res): void => {
  const sim = simulateElectricalReadings(getDemoPowerW()) ?? simulateElectricalReadings(0)!;
  res.json(
    GetLiveMetricsResponse.parse({
      timestamp: new Date().toISOString(),
      powerW: finite(sim.currentPowerW),
      voltageV: sim.voltageV,
      currentA: finite(sim.currentA),
      frequency: 50,
      history: [], // sensor history is deliberately not mixed into simulated values
    }),
  );
});

// ── Honest, database-free answers for the rest of the dashboard page ─────────

router.get("/energy/consumption", (_req, res): void => {
  // No stored history in demo mode and none is invented.
  res.json(GetEnergyConsumptionResponse.parse([]));
});

router.get("/alerts", (_req, res): void => {
  res.json(GetAlertsResponse.parse([]));
});

router.get("/settings", (_req, res): void => {
  res.json(
    GetSettingsResponse.parse({
      userName: "Shreyas",
      homeDescription: "4 Room Smart Home",
      electricityProvider: "MSEDCL",
      tariffRatePerKwh: DEMO_TARIFF_PER_KWH,
      monthlyBudgetInr: DEMO_MONTHLY_BUDGET_INR,
      highPowerThresholdW: 750,
      notificationsEnabled: true,
      emailNotifications: true,
      smsNotifications: false,
      timezone: "Asia/Kolkata",
    }),
  );
});

// ── Everything that needs the database is refused with a clear message ───────

router.use(["/energy", "/prediction", "/ml"], (_req, res): void => {
  res.status(503).json({ error: NOT_AVAILABLE, demoMode: true });
});
router.put("/settings", (_req, res): void => {
  res.status(503).json({ error: NOT_AVAILABLE, demoMode: true });
});
router.patch("/alerts/:id/dismiss", (_req, res): void => {
  res.status(503).json({ error: NOT_AVAILABLE, demoMode: true });
});

// ── ESP32-facing routes: acknowledged but inert ──────────────────────────────
// A physical ESP32 that happens to talk to a demo server gets no commands and its
// readings are not stored, so demo mode can neither switch relays nor save data.

router.get("/commands/:deviceKey", (_req, res): void => {
  res.status(204).send();
});
router.post("/commandAck", (_req, res): void => {
  res.status(202).json({ demoMode: true, ignored: true });
});
router.post("/readings", (_req, res): void => {
  res.status(202).json({ demoMode: true, stored: false });
});

export default router;
