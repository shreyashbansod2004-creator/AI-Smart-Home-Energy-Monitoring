import { Router } from "express";
import { desc, eq, gte, and, sql } from "drizzle-orm";
import {
  db,
  devicesTable,
  readingsTable,
  dailyUsageTable,
  appliancesTable,
  settingsTable,
} from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetLiveMetricsResponse,
} from "@workspace/api-zod";

const router = Router();

/** Fallback live watts when no DB readings exist */
function simulatedWatts(): number {
  const h = new Date().getHours();
  let base = 300;
  if (h >= 6 && h < 10) base = 700;
  else if (h >= 10 && h < 14) base = 900;
  else if (h >= 14 && h < 18) base = 1100;
  else if (h >= 18 && h < 23) base = 1300;
  return Math.round(base + (Math.random() - 0.5) * 200);
}

async function getDefaultDevice() {
  const [device] = await db.select().from(devicesTable).limit(1);
  return device ?? null;
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  try {
    const device = await getDefaultDevice();

    // ── Live power from latest reading ──────────────────────────────────────
    let currentPowerW = simulatedWatts();
    if (device) {
      const [latest] = await db
        .select()
        .from(readingsTable)
        .where(eq(readingsTable.deviceId, device.id))
        .orderBy(desc(readingsTable.recordedAt))
        .limit(1);
      if (latest) currentPowerW = Math.round(latest.powerWatts);
    }

    // ── Today's energy from dailyUsage ──────────────────────────────────────
    const todayStr = new Date().toISOString().slice(0, 10);
    let todayEnergyKwh = parseFloat((currentPowerW / 1000 * 6).toFixed(2)); // fallback estimate
    if (device) {
      const [todayRow] = await db
        .select()
        .from(dailyUsageTable)
        .where(
          and(
            eq(dailyUsageTable.deviceId, device.id),
            eq(dailyUsageTable.usageDate, todayStr),
          ),
        )
        .limit(1);
      if (todayRow) todayEnergyKwh = parseFloat(todayRow.energyKwh.toFixed(2));
    }

    // ── Month energy: sum of dailyUsage rows for current month ──────────────
    const firstOfMonth = `${todayStr.slice(0, 7)}-01`;
    let monthEnergyKwh = 0;
    let prevMonthEnergyKwh = 0;

    if (device) {
      const [monthSum] = await db
        .select({ total: sql<number>`COALESCE(SUM(energy_kwh), 0)` })
        .from(dailyUsageTable)
        .where(
          and(
            eq(dailyUsageTable.deviceId, device.id),
            gte(dailyUsageTable.usageDate, firstOfMonth),
          ),
        );
      monthEnergyKwh = parseFloat(Number(monthSum?.total ?? 0).toFixed(1));

      // Previous month for comparison
      const now = new Date();
      const prevFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        .toISOString()
        .slice(0, 10);
      const prevLast = new Date(now.getFullYear(), now.getMonth(), 0)
        .toISOString()
        .slice(0, 10);
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
      prevMonthEnergyKwh = parseFloat(Number(prevSum?.total ?? 0).toFixed(1));
    }

    // ── Tariff rate from settings ────────────────────────────────────────────
    const [settings] = await db.select().from(settingsTable).limit(1);
    const tariff = settings?.tariffRatePerKwh ?? 8.5;
    const budget = settings?.monthlyBudgetInr ?? 1500;

    const estimatedBillInr = parseFloat((monthEnergyKwh * tariff).toFixed(0));

    // ── Percentage changes ───────────────────────────────────────────────────
    const monthChangePercent =
      prevMonthEnergyKwh > 0
        ? parseFloat(
            (((monthEnergyKwh - prevMonthEnergyKwh) / prevMonthEnergyKwh) * 100).toFixed(1),
          )
        : 0;
    const billChangePercent = monthChangePercent;

    // Yesterday energy for today change
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let todayChangePercent = 0;
    if (device) {
      const [yd] = await db
        .select()
        .from(dailyUsageTable)
        .where(
          and(
            eq(dailyUsageTable.deviceId, device.id),
            eq(dailyUsageTable.usageDate, yesterdayStr),
          ),
        )
        .limit(1);
      if (yd && yd.energyKwh > 0) {
        todayChangePercent = parseFloat(
          (((todayEnergyKwh - yd.energyKwh) / yd.energyKwh) * 100).toFixed(1),
        );
      }
    }

    // ── Active appliance count ───────────────────────────────────────────────
    const appliances = await db.select().from(appliancesTable);
    const activeCount = appliances.filter((a) => a.isOn).length;

    const summary = GetDashboardSummaryResponse.parse({
      currentPowerW,
      todayEnergyKwh,
      monthEnergyKwh,
      estimatedBillInr,
      voltageV: 232,
      currentA: parseFloat((currentPowerW / 232).toFixed(2)),
      powerFactorKw: parseFloat((currentPowerW / 1000).toFixed(2)),
      todayChangePercent,
      monthChangePercent,
      billChangePercent,
      systemStatus: "online",
      lastUpdated: new Date().toISOString(),
      activeApplianceCount: activeCount,
      totalApplianceCount: appliances.length,
    });
    res.json(summary);
  } catch (err) {
    console.error("dashboard/summary error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
});

router.get("/dashboard/live", async (req, res): Promise<void> => {
  try {
    const device = await getDefaultDevice();
    const now = new Date();

    // ── Last 20 readings for the sparkline ──────────────────────────────────
    let history: { time: string; powerW: number }[] = [];
    if (device) {
      const rows = await db
        .select()
        .from(readingsTable)
        .where(eq(readingsTable.deviceId, device.id))
        .orderBy(desc(readingsTable.recordedAt))
        .limit(20);

      history = rows.reverse().map((r) => {
        const t = r.recordedAt;
        return {
          time: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
          powerW: Math.round(r.powerWatts),
        };
      });
    }

    // Fallback if no DB readings
    if (history.length === 0) {
      history = Array.from({ length: 20 }, (_, i) => {
        const t = new Date(now.getTime() - (19 - i) * 5 * 60 * 1000);
        const h = t.getHours();
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
    }

    // Latest power
    const powerW = history.at(-1)?.powerW ?? simulatedWatts();

    // Auto-insert a new reading into DB for real-time tracking
    if (device) {
      await db.insert(readingsTable).values({
        deviceId: device.id,
        powerWatts: powerW + (Math.random() - 0.5) * 50,
        recordedAt: now,
      });
    }

    const metrics = GetLiveMetricsResponse.parse({
      timestamp: now.toISOString(),
      powerW,
      voltageV: 232,
      currentA: parseFloat((powerW / 232).toFixed(2)),
      frequency: 50,
      history,
    });
    res.json(metrics);
  } catch (err) {
    console.error("dashboard/live error:", err);
    res.status(500).json({ error: "Failed to fetch live metrics" });
  }
});

export default router;
