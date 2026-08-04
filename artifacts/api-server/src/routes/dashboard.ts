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

async function getDefaultDevice() {
  const [device] = await db.select().from(devicesTable).limit(1);
  return device ?? null;
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  try {
    const device = await getDefaultDevice();

    // ── Live power from latest reading ──────────────────────────────────────
    let currentPowerW = 0;
    let voltageV = 0;
    let currentA = 0;

    if (device) {
      const [latest] = await db
        .select()
        .from(readingsTable)
        .where(eq(readingsTable.deviceId, device.id))
        .orderBy(desc(readingsTable.recordedAt))
        .limit(1);
      if (latest) {
        currentPowerW = Math.round(latest.powerWatts);
        voltageV = latest.voltageV ?? 0;
        currentA = latest.currentA ?? 0;
      }
    }

    // ── Today's energy from dailyUsage ──────────────────────────────────────
    const todayStr = new Date().toISOString().slice(0, 10);
    let todayEnergyKwh = 0;
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
      voltageV,
      currentA,
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
    let powerW = 0;
    let voltageV = 0;
    let currentA = 0;

    if (device) {
      const rows = await db
        .select()
        .from(readingsTable)
        .where(eq(readingsTable.deviceId, device.id))
        .orderBy(desc(readingsTable.recordedAt))
        .limit(20);

      const ordered = rows.reverse();
      history = ordered.map((r) => {
        const t = r.recordedAt;
        return {
          time: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
          powerW: Math.round(r.powerWatts),
        };
      });

      // Pull voltage and current from the latest reading
      const latest = ordered.at(-1);
      if (latest) {
        powerW = Math.round(latest.powerWatts);
        voltageV = latest.voltageV ?? 0;
        currentA = latest.currentA ?? 0;
      }
    }

    // No readings: history stays empty and all metrics are 0 (device offline/not yet connected)

    const metrics = GetLiveMetricsResponse.parse({
      timestamp: now.toISOString(),
      powerW,
      voltageV,
      currentA,
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
