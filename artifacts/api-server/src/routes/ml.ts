/**
 * ML Model Integration — Bill Prediction via uploaded sklearn model.
 *
 * When bill_prediction_model.pkl (and optionally scaler.pkl + features.json)
 * are present in <project_root>/artifacts/api-server/models/, this endpoint
 * invokes a Python subprocess to run the model against the latest DB readings.
 *
 * If no model files are found, it falls back to the existing statistical
 * prediction from prediction.ts so the UI always works.
 *
 * Upload your model files to:
 *   artifacts/api-server/models/bill_prediction_model.pkl
 *   artifacts/api-server/models/scaler.pkl          (optional)
 *   artifacts/api-server/models/features.json        (required for Python script)
 */

import { Router } from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { eq, gte, and, sql } from "drizzle-orm";
import { db, devicesTable, dailyUsageTable, settingsTable, readingsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

const MODELS_DIR = path.resolve(process.cwd(), "models");
const MODEL_PATH     = path.join(MODELS_DIR, "bill_prediction_model.pkl");
const SCALER_PATH    = path.join(MODELS_DIR, "scaler.pkl");
const FEATURES_PATH  = path.join(MODELS_DIR, "features.json");
const PREDICT_SCRIPT = path.join(process.cwd(), "src", "lib", "ml_predict.py");

function modelFilesExist(): boolean {
  return fs.existsSync(MODEL_PATH) && fs.existsSync(FEATURES_PATH);
}

/**
 * Run the Python prediction script and return the predicted value.
 * @param featureValues Object mapping feature names → values
 */
function runPythonModel(featureValues: Record<string, number>): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      PREDICT_SCRIPT,
      "--model",    MODEL_PATH,
      "--features", FEATURES_PATH,
      "--input",    JSON.stringify(featureValues),
    ];
    if (fs.existsSync(SCALER_PATH)) {
      args.push("--scaler", SCALER_PATH);
    }

    const proc = spawn("python3", args, { timeout: 15000 });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python exited ${code}: ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(Number(result.prediction));
      } catch {
        reject(new Error(`Could not parse python output: ${stdout}`));
      }
    });

    proc.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/prediction/ml
// Returns bill prediction from the sklearn model (if uploaded) or falls back
// to the statistical model.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/prediction/ml", async (req, res): Promise<void> => {
  try {
    const now = new Date();
    const [device] = await db.select().from(devicesTable).limit(1);
    const [settings] = await db.select().from(settingsTable).limit(1);
    const tariff = settings?.tariffRatePerKwh ?? 8.5;
    const budget = settings?.monthlyBudgetInr ?? 1500;

    // ── Gather feature values from DB ─────────────────────────────────────────
    let avgDailyKwh = 0;
    let currentMonthKwh = 0;
    let prevMonthKwh = 0;
    let latestPowerW = 0;
    let latestVoltage = 0;
    let latestCurrent = 0;

    if (device) {
      const firstOfMonth = `${now.toISOString().slice(0, 7)}-01`;
      const [monthSum] = await db
        .select({ total: sql<number>`COALESCE(SUM(energy_kwh), 0)` })
        .from(dailyUsageTable)
        .where(and(eq(dailyUsageTable.deviceId, device.id), gte(dailyUsageTable.usageDate, firstOfMonth)));
      currentMonthKwh = parseFloat(Number(monthSum?.total ?? 0).toFixed(2));

      const prevFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const prevLast  = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      const [prevSum] = await db
        .select({ total: sql<number>`COALESCE(SUM(energy_kwh), 0)` })
        .from(dailyUsageTable)
        .where(and(eq(dailyUsageTable.deviceId, device.id), gte(dailyUsageTable.usageDate, prevFirst), sql`usage_date <= ${prevLast}`));
      prevMonthKwh = parseFloat(Number(prevSum?.total ?? 0).toFixed(2));

      const thirtyDaysAgo = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);
      const [avgRow] = await db
        .select({ avg: sql<number>`COALESCE(AVG(energy_kwh), 0)` })
        .from(dailyUsageTable)
        .where(and(eq(dailyUsageTable.deviceId, device.id), gte(dailyUsageTable.usageDate, thirtyDaysAgo)));
      avgDailyKwh = parseFloat(Number(avgRow?.avg ?? 0).toFixed(2));

      const [latest] = await db
        .select()
        .from(readingsTable)
        .where(eq(readingsTable.deviceId, device.id))
        .orderBy(desc(readingsTable.recordedAt))
        .limit(1);

      if (latest) {
        latestPowerW   = latest.powerWatts;
        latestVoltage  = latest.voltageV   ?? 0;
        latestCurrent  = latest.currentA   ?? 0;
      }
    }

    const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth   = now.getDate();

    const featureValues: Record<string, number> = {
      avg_daily_kwh:       avgDailyKwh,
      current_month_kwh:   currentMonthKwh,
      prev_month_kwh:      prevMonthKwh,
      days_in_month:       daysInMonth,
      day_of_month:        dayOfMonth,
      tariff_rate:         tariff,
      latest_power_w:      latestPowerW,
      latest_voltage_v:    latestVoltage,
      latest_current_a:    latestCurrent,
    };

    // ── Use ML model if available, otherwise statistical fallback ─────────────
    let predictedBillInr: number;
    let modelUsed: string;

    if (modelFilesExist()) {
      try {
        predictedBillInr = await runPythonModel(featureValues);
        modelUsed = "sklearn";
      } catch (err) {
        console.error("[ML] Python model failed, using fallback:", err);
        const daysInMonth2  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        predictedBillInr = parseFloat((avgDailyKwh * daysInMonth2 * tariff).toFixed(0));
        modelUsed = "statistical_fallback";
      }
    } else {
      // Statistical fallback
      const daysInMonth3  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      predictedBillInr = parseFloat((avgDailyKwh * daysInMonth3 * tariff).toFixed(0));
      modelUsed = "statistical_fallback";
    }

    res.json({
      predictedBillInr,
      modelUsed,
      featureValues,
      modelReady: modelFilesExist(),
      modelPath: MODELS_DIR,
      uploadInstructions: modelFilesExist()
        ? "Model is loaded and active."
        : `Upload bill_prediction_model.pkl and features.json to: ${MODELS_DIR}`,
    });
  } catch (err) {
    console.error("GET /prediction/ml error:", err);
    res.status(500).json({ error: "Failed to run ML prediction" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/prediction/ml/status
// Quick check: is the model uploaded and ready?
// ─────────────────────────────────────────────────────────────────────────────
router.get("/prediction/ml/status", (req, res) => {
  const ready = modelFilesExist();
  res.json({
    ready,
    modelPath:    MODEL_PATH,
    scalerPath:   SCALER_PATH,
    featuresPath: FEATURES_PATH,
    files: {
      model:    fs.existsSync(MODEL_PATH),
      scaler:   fs.existsSync(SCALER_PATH),
      features: fs.existsSync(FEATURES_PATH),
    },
    uploadInstructions: ready
      ? "Model is active."
      : `Copy your model files to the models/ directory:\n  ${MODEL_PATH}\n  ${SCALER_PATH} (optional)\n  ${FEATURES_PATH}`,
  });
});

export default router;
