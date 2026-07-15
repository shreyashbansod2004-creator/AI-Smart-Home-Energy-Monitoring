import { Router } from "express";
import {
  GetEnergyConsumptionQueryParams,
  GetEnergyConsumptionResponse,
  GetApplianceBreakdownResponse,
  GetEnergyAnalyticsResponse,
} from "@workspace/api-zod";

const router = Router();

function generateDailyData() {
  const now = new Date();
  return Array.from({ length: 24 }, (_, h) => {
    let base = 0.3;
    if (h >= 6 && h < 10) base = 0.8;
    else if (h >= 10 && h < 14) base = 1.0;
    else if (h >= 14 && h < 18) base = 1.2;
    else if (h >= 18 && h < 23) base = 1.5;
    return {
      label: `${String(h).padStart(2, "0")}:00`,
      energyKwh: parseFloat((base + (Math.random() - 0.4) * 0.3).toFixed(2)),
      date: now.toISOString().slice(0, 10),
    };
  });
}

function generateWeeklyData() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const now = new Date();
  return days.map((day, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - i));
    return {
      label: day,
      energyKwh: parseFloat((12 + Math.random() * 8).toFixed(2)),
      date: d.toISOString().slice(0, 10),
    };
  });
}

function generateMonthlyData() {
  const now = new Date();
  return Array.from({ length: 16 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), i + 1);
    return {
      label: `${i + 1} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][now.getMonth()]}`,
      energyKwh: parseFloat((10 + Math.random() * 10 + (i < 8 ? 0 : 3)).toFixed(2)),
      date: d.toISOString().slice(0, 10),
    };
  });
}

function generateYearlyData() {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  return months.map((m, i) => ({
    label: m,
    energyKwh: parseFloat((80 + Math.random() * 80 + (i >= 3 && i <= 6 ? 40 : 0)).toFixed(2)),
    date: `${now.getFullYear()}-${String(i + 1).padStart(2, "0")}-01`,
  }));
}

router.get("/energy/consumption", async (req, res): Promise<void> => {
  const query = GetEnergyConsumptionQueryParams.safeParse(req.query);
  const period = query.success ? (query.data.period ?? "month") : "month";

  let data;
  if (period === "day") data = generateDailyData();
  else if (period === "week") data = generateWeeklyData();
  else if (period === "year") data = generateYearlyData();
  else data = generateMonthlyData();

  res.json(GetEnergyConsumptionResponse.parse(data));
});

router.get("/energy/appliance-breakdown", async (req, res): Promise<void> => {
  const breakdown = [
    { name: "Air Conditioner", percentage: 35, energyKwh: 44.3, color: "#3b82f6" },
    { name: "Refrigerator", percentage: 20, energyKwh: 25.3, color: "#22c55e" },
    { name: "Washing Machine", percentage: 12, energyKwh: 15.2, color: "#f59e0b" },
    { name: "Television", percentage: 10, energyKwh: 12.7, color: "#8b5cf6" },
    { name: "Lights", percentage: 8, energyKwh: 10.1, color: "#06b6d4" },
    { name: "Fan", percentage: 8, energyKwh: 10.1, color: "#f97316" },
    { name: "Other", percentage: 7, energyKwh: 8.9, color: "#6b7280" },
  ];
  res.json(GetApplianceBreakdownResponse.parse(breakdown));
});

router.get("/energy/analytics", async (req, res): Promise<void> => {
  const analytics = {
    efficiencyScore: 72,
    peakUsageHour: "19:00 - 22:00",
    lowestUsageHour: "02:00 - 05:00",
    avgDailyKwh: 8.4,
    savingOpportunities: [
      "Shift washing machine use to off-peak hours (10pm-6am)",
      "Increase AC temperature by 2°C to save ~₹300/month",
      "Replace halogen lights with LED to cut lighting cost by 60%",
    ],
    recommendations: [
      {
        id: "rec-1",
        appliance: "Air Conditioner",
        message: "Your AC consumption is 35% higher than average. Increasing temperature by 2°C can save approximately ₹300/month.",
        savingInr: 300,
        severity: "warning",
      },
      {
        id: "rec-2",
        appliance: "Refrigerator",
        message: "Refrigerator door seal appears degraded based on usage pattern. Check seal to save ~₹120/month.",
        savingInr: 120,
        severity: "info",
      },
      {
        id: "rec-3",
        appliance: "Washing Machine",
        message: "Running washing machine during peak hours (6pm-10pm) adds 30% to electricity cost. Shift to off-peak.",
        savingInr: 180,
        severity: "warning",
      },
    ],
    weeklyTrend: generateWeeklyData(),
    hourlyPattern: generateDailyData(),
  };
  res.json(GetEnergyAnalyticsResponse.parse(analytics));
});

export default router;
