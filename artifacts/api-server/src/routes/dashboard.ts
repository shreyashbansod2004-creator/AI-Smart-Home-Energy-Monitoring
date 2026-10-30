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
  estimatePowerFromConfirmedStates,
  calculateEnergyBillInr,
} from "@workspace/api-zod";
import {
  demoEnergyLedger,
  getConfirmedApplianceStates,
  isDemoModeEnabled,
} from "../lib/demo-mode";

const demoModeEnabled = () => isDemoModeEnabled(process.env.DEMO_MODE);

const router = Router();

async function getDefaultDevice() {
  const [device] = await db.select().from(devicesTable).limit(1);
  return device ?? null;
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  try {
    const device = await getDefaultDevice();
    const appliances = await db.select().from(appliancesTable);

    // Demo values are derived only from the complete set of confirmed relay states.
    // An incomplete state set is an error, never a fabricated zero reading.
    const demo = demoModeEnabled();
    const confirmedStates = getConfirmedApplianceStates(appliances);
    const simulated = demo && confirmedStates
      ? demoEnergyLedger.sample(confirmedStates)
      : null;
    if (demo && !simulated) {
      res.status(503).json({ error: "APPLIANCE_STATES_UNAVAILABLE" });
      return;
    }

    let sensorPowerW = 0;
    let hasSensorReading = false;
    let voltageV = simulated?.voltageV ?? 0;
    let currentA = simulated?.currentA ?? 0;

    if (device && !demo) {
      const [latest] = await db
        .select()
        .from(readingsTable)
        .where(eq(readingsTable.deviceId, device.id))
        .orderBy(desc(readingsTable.recordedAt))
        .limit(1);
      if (latest) {
        sensorPowerW = Math.round(latest.powerWatts);
        hasSensorReading = true;
        voltageV = latest.voltageV ?? 0;
        currentA = latest.currentA ?? 0;
      }
    }

    const estimatedAppliancePowerW = estimatePowerFromConfirmedStates(appliances);
    const currentPowerW = demo
      ? simulated!.powerW
      : estimatedAppliancePowerW ?? (hasSensorReading ? sensorPowerW : null);
    if (currentPowerW === null) {
      res.status(503).json({ error: "APPLIANCE_STATES_UNAVAILABLE" });
      return;
    }

    // ── Today's energy from dailyUsage ──────────────────────────────────────
    const todayStr = new Date().toISOString().slice(0, 10);
    let todayEnergyKwh = demo ? simulated!.energyKwh : 0;
    if (device && !demo) {
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
    // Demo totals are session-scoped and never read from or written to history.
    let monthEnergyKwh = demo ? simulated!.energyKwh : 0;
    let prevMonthEnergyKwh = 0;

    if (device && !demo) {
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
    const configuredTariff = Number(settings?.tariffRatePerKwh);
    const tariff = Number.isFinite(configuredTariff) && configuredTariff >= 0
      ? configuredTariff
      : 8.5;
    const budget = settings?.monthlyBudgetInr ?? 1500;

    const estimatedBillInr = calculateEnergyBillInr(monthEnergyKwh, tariff) ?? 0;

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
    if (device && !demo) {
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
    const activeCount = appliances.filter((a) => a.isOn).length;

    const summary = GetDashboardSummaryResponse.parse({
      currentPowerW,
      todayEnergyKwh,
      monthEnergyKwh,
      estimatedBillInr,
      voltageV,
      currentA,
      // Preserve the existing numeric API field; the dashboard no longer
      // presents this power-derived value as a measured power factor.
      powerFactorKw: parseFloat((sensorPowerW / 1000).toFixed(2)),
      todayChangePercent,
      monthChangePercent,
      billChangePercent,
      systemStatus: "online",
      lastUpdated: new Date().toISOString(),
      activeApplianceCount: activeCount,
      totalApplianceCount: appliances.length,
      demoMode: demo,
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
    const appliances = await db.select().from(appliancesTable);

    // ── Last 20 readings for the sparkline ──────────────────────────────────
    let history: { time: string; powerW: number }[] = [];
    const demo = demoModeEnabled();
    const confirmedStates = getConfirmedApplianceStates(appliances);
    const simulated = demo && confirmedStates
      ? demoLedger.sample(confirmedStates)
      : null;
    if (demo && !simulated) {
      res.status(503).json({ error: "APPLIANCE_STATES_UNAVAILABLE" });
      return;
    }
    const estimatedAppliancePowerW = estimatePowerFromConfirmedStates(appliances);
    let powerW = demo ? simulated!.powerW : estimatedAppliancePowerW ?? 0;
    let voltageV = simulated?.voltageV ?? 0;
    let currentA = simulated?.currentA ?? 0;
    let powerFactor = demo ? 0.9 : undefined;
    let hasSensorReading = false;
    let timestamp = simulated?.sampledAt ?? now.toISOString();

    if (device && !demo) {
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
      if (latest && !demo) {
        timestamp = latest.recordedAt.toISOString();
        voltageV = latest.voltageV ?? 0;
        currentA = latest.currentA ?? 0;
        powerW = Math.round(latest.powerWatts);
        hasSensorReading = true;
        const apparentPower = voltageV * currentA;
        if (apparentPower > 0) {
          const calculatedPowerFactor = latest.powerWatts / apparentPower;
          if (Number.isFinite(calculatedPowerFactor) && calculatedPowerFactor >= 0 && calculatedPowerFactor <= 1.1) {
            powerFactor = calculatedPowerFactor;
          }
        }
      }
    }

    if (!demo && estimatedAppliancePowerW === null && !hasSensorReading) {
      res.status(503).json({ error: "APPLIANCE_STATES_UNAVAILABLE" });
      return;
    }

    const metrics = GetLiveMetricsResponse.parse({
      timestamp,
      powerW,
      voltageV,
      currentA,
      powerFactor,
      frequency: 50,
      history,
      demoMode: demo,
    });
    res.json(metrics);
  } catch (err) {
    console.error("dashboard/live error:", err);
    res.status(500).json({ error: "Failed to fetch live metrics" });
  }
});

export default router;
