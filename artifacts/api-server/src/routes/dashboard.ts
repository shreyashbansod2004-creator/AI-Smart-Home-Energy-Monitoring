import { Router } from "express";
import {
  GetDashboardSummaryResponse,
  GetLiveMetricsResponse,
} from "@workspace/api-zod";

const router = Router();

// Simulate live fluctuation
function liveWatts(): number {
  const base = 782;
  return Math.round(base + (Math.random() - 0.5) * 120);
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const currentPowerW = liveWatts();
  const summary = GetDashboardSummaryResponse.parse({
    currentPowerW,
    todayEnergyKwh: 5.42,
    monthEnergyKwh: 126.7,
    estimatedBillInr: 1245,
    voltageV: 232,
    currentA: parseFloat((currentPowerW / 232).toFixed(2)),
    powerFactorKw: parseFloat((currentPowerW / 1000).toFixed(2)),
    todayChangePercent: 8.6,
    monthChangePercent: 12.4,
    billChangePercent: 10.3,
    systemStatus: "online",
    lastUpdated: new Date().toISOString(),
    activeApplianceCount: 3,
    totalApplianceCount: 7,
  });
  res.json(summary);
});

router.get("/dashboard/live", async (req, res): Promise<void> => {
  const now = new Date();
  const history = Array.from({ length: 20 }, (_, i) => {
    const t = new Date(now.getTime() - (19 - i) * 5 * 60 * 1000);
    const h = t.getHours();
    // realistic day/night pattern
    let base = 300;
    if (h >= 6 && h < 10) base = 700;
    else if (h >= 10 && h < 14) base = 900;
    else if (h >= 14 && h < 18) base = 1100;
    else if (h >= 18 && h < 23) base = 1300;
    return {
      time: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
      powerW: Math.round(base + (Math.random() - 0.5) * 200),
    };
  });

  const powerW = liveWatts();
  const metrics = GetLiveMetricsResponse.parse({
    timestamp: now.toISOString(),
    powerW,
    voltageV: 232,
    currentA: parseFloat((powerW / 232).toFixed(2)),
    frequency: 50,
    history,
  });
  res.json(metrics);
});

export default router;
