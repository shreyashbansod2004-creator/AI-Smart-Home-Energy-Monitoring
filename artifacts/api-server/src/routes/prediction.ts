import { Router } from "express";
import {
  PredictBillBody,
  PredictBillResponse,
  GetCurrentPredictionResponse,
} from "@workspace/api-zod";

const router = Router();

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

  // Simple linear projection with a slight trend factor
  const trendFactor = prevMonthKwh > 0 ? currentMonthKwh / Math.max(prevMonthKwh, 1) : 1;
  const projectedKwh = avgDailyKwh * daysInMonth * Math.min(trendFactor, 1.3);
  const applianceFactor = 1 + (applianceCount - 5) * 0.02;
  const expectedKwh = parseFloat((projectedKwh * applianceFactor).toFixed(1));

  const predictedBillInr = parseFloat((expectedKwh * tariffRate).toFixed(0));
  const predictedBillMinInr = parseFloat((predictedBillInr * 0.92).toFixed(0));
  const predictedBillMaxInr = parseFloat((predictedBillInr * 1.08).toFixed(0));
  const confidencePercent = Math.min(
    98,
    Math.round(75 + dayOfMonth * 0.75)
  );
  const budgetUsedPercent = parseFloat(
    ((currentMonthKwh * tariffRate * 100) / targetBudgetInr).toFixed(1)
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
  const { prevMonthKwh, currentMonthKwh, avgDailyKwh, applianceCount, targetBudgetInr } = body.data;
  const result = computePrediction(
    prevMonthKwh,
    currentMonthKwh,
    avgDailyKwh,
    applianceCount,
    targetBudgetInr ?? 1500,
  );
  res.json(PredictBillResponse.parse(result));
});

router.get("/prediction/current", async (req, res): Promise<void> => {
  // Use realistic defaults for current month simulation
  const result = computePrediction(
    114,   // prevMonthKwh
    126.7, // currentMonthKwh (so far)
    8.4,   // avgDailyKwh
    7,     // applianceCount
    1500,  // targetBudgetInr
  );
  res.json(GetCurrentPredictionResponse.parse(result));
});

export default router;
