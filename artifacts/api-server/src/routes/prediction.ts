import { Router } from "express";
import { eq, gte, and, sql, desc } from "drizzle-orm";
import {
  db,
  devicesTable,
  dailyUsageTable,
  predictionsTable,
  settingsTable,
} from "@workspace/db";
import {
  PredictBillBody,
  PredictBillResponse,
  GetCurrentPredictionResponse,
} from "@workspace/api-zod";

const router = Router();

async function getDefaultDevice() {
  const [device] = await db.select().from(devicesTable).limit(1);
  return device ?? null;
}

function computePrediction(
  prevMonthKwh: number,
  currentMonthKwh: number,
  avgDailyKwh: number,
  applianceCount: number,
  targetBudgetInr: number,
  tariffRate = 8.5,
) {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  const trendFactor = prevMonthKwh > 0 ? currentMonthKwh / Math.max(prevMonthKwh, 1) : 1;
  const projectedKwh = avgDailyKwh * daysInMonth * Math.min(trendFactor, 1.3);
  const applianceFactor = 1 + (applianceCount - 5) * 0.02;
  const expectedKwh = parseFloat((projectedKwh * applianceFactor).toFixed(1));

  const predictedBillInr = parseFloat((expectedKwh * tariffRate).toFixed(0));
  const predictedBillMinInr = parseFloat((predictedBillInr * 0.92).toFixed(0));
  const predictedBillMaxInr = parseFloat((predictedBillInr * 1.08).toFixed(0));
  const confidencePercent = Math.min(98, Math.round(60 + dayOfMonth * 1.2));
  const budgetUsedPercent = parseFloat(
    ((currentMonthKwh * tariffRate * 100) / targetBudgetInr).toFixed(1),
  );
  const willExceedBudget = predictedBillInr > targetBudgetInr;

  const tip = willExceedBudget
    ? `You are likely to exceed your budget by ₹${(predictedBillInr - targetBudgetInr).toFixed(0)}. Consider reducing AC usage by 1-2 hours daily.`
    : `Great job! You are on track to stay within budget. Keep up the current usage pattern.`;

  return {
    predictedBillInr,
    predictedBillMinInr,
    predictedBillMaxInr,
    confidencePercent,
    expectedKwh,
    targetBudgetInr,
    budgetUsedPercent,
    willExceedBudget,
    tip,
    daysRemainingInMonth: daysRemaining,
  };
}

router.post("/prediction/bill", async (req, res): Promise<void> => {
  const body = PredictBillBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const { prevMonthKwh, currentMonthKwh, avgDailyKwh, applianceCount, targetBudgetInr } = body.data;
    const [settings] = await db.select().from(settingsTable).limit(1);
    const tariff = settings?.tariffRatePerKwh ?? 8.5;

    const result = computePrediction(
      prevMonthKwh,
      currentMonthKwh,
      avgDailyKwh,
      applianceCount,
      targetBudgetInr ?? settings?.monthlyBudgetInr ?? 1500,
      tariff,
    );

    // Log prediction to DB
    const device = await getDefaultDevice();
    if (device) {
      await db.insert(predictionsTable).values({
        deviceId: device.id,
        predictionType: "monthly_bill",
        predictedValue: result.predictedBillInr,
        modelVersion: "linreg-v1",
      });
    }

    res.json(PredictBillResponse.parse(result));
  } catch (err) {
    console.error("prediction/bill error:", err);
    res.status(500).json({ error: "Failed to compute prediction" });
  }
});

router.get("/prediction/current", async (req, res): Promise<void> => {
  try {
    const device = await getDefaultDevice();
    const [settings] = await db.select().from(settingsTable).limit(1);
    const tariff = settings?.tariffRatePerKwh ?? 8.5;
    const budget = settings?.monthlyBudgetInr ?? 1500;
    const now = new Date();

    let currentMonthKwh = 0;
    let prevMonthKwh = 0;
    let avgDailyKwh = 8.4;

    if (device) {
      // Current month usage
      const firstOfMonth = `${now.toISOString().slice(0, 7)}-01`;
      const [monthSum] = await db
        .select({ total: sql<number>`COALESCE(SUM(energy_kwh), 0)` })
        .from(dailyUsageTable)
        .where(and(eq(dailyUsageTable.deviceId, device.id), gte(dailyUsageTable.usageDate, firstOfMonth)));
      currentMonthKwh = parseFloat(Number(monthSum?.total ?? 0).toFixed(1));

      // Previous month usage
      const prevFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const prevLast = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      const [prevSum] = await db
        .select({ total: sql<number>`COALESCE(SUM(energy_kwh), 0)` })
        .from(dailyUsageTable)
        .where(
          and(
            eq(dailyUsageTable.deviceId, device.id),
            gte(dailyUsageTable.usageDate, prevFirst),
            sql`usage_date <= ${prevLast}`,
          ),
        );
      prevMonthKwh = parseFloat(Number(prevSum?.total ?? 0).toFixed(1));

      // Average daily kWh from last 30 days
      const thirtyDaysAgo = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);
      const [avgRow] = await db
        .select({ avg: sql<number>`COALESCE(AVG(energy_kwh), 0)` })
        .from(dailyUsageTable)
        .where(and(eq(dailyUsageTable.deviceId, device.id), gte(dailyUsageTable.usageDate, thirtyDaysAgo)));
      avgDailyKwh = parseFloat(Number(avgRow?.avg ?? 8.4).toFixed(2));
    }

    // Use seeded fallbacks if no real data yet
    if (currentMonthKwh === 0) currentMonthKwh = 126.7;
    if (prevMonthKwh === 0) prevMonthKwh = 114;
    if (avgDailyKwh === 0) avgDailyKwh = 8.4;

    const result = computePrediction(prevMonthKwh, currentMonthKwh, avgDailyKwh, 7, budget, tariff);

    // Log prediction
    if (device) {
      await db.insert(predictionsTable).values({
        deviceId: device.id,
        predictionType: "monthly_bill",
        predictedValue: result.predictedBillInr,
        modelVersion: "linreg-v1",
      }).onConflictDoNothing();
    }

    res.json(GetCurrentPredictionResponse.parse(result));
  } catch (err) {
    console.error("prediction/current error:", err);
    res.status(500).json({ error: "Failed to fetch current prediction" });
  }
});

export default router;
