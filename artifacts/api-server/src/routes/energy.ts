import { Router } from "express";
import { desc, eq, gte, and, sql } from "drizzle-orm";
import {
  db,
  devicesTable,
  readingsTable,
  dailyUsageTable,
  appliancesTable,
} from "@workspace/db";
import {
  GetEnergyConsumptionQueryParams,
  GetEnergyConsumptionResponse,
  GetApplianceBreakdownResponse,
  GetEnergyAnalyticsResponse,
} from "@workspace/api-zod";

const router = Router();

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

async function getDefaultDevice() {
  const [device] = await db.select().from(devicesTable).limit(1);
  return device ?? null;
}

// ── /energy/consumption ─────────────────────────────────────────────────────

router.get("/energy/consumption", async (req, res): Promise<void> => {
  try {
    const query = GetEnergyConsumptionQueryParams.safeParse(req.query);
    const period = query.success ? (query.data.period ?? "month") : "month";
    const device = await getDefaultDevice();
    const now = new Date();

    let data: { label: string; energyKwh: number; date: string }[] = [];

    if (period === "day") {
      // Hourly breakdown from readings table grouped by hour
      if (device) {
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        const rows = await db
          .select({
            hour: sql<number>`EXTRACT(HOUR FROM recorded_at)`,
            energyKwh: sql<number>`COALESCE(SUM(power_watts) / 1000.0 / 120.0, 0)`, // avg watts * 30s interval / 3600
          })
          .from(readingsTable)
          .where(
            and(
              eq(readingsTable.deviceId, device.id),
              gte(readingsTable.recordedAt, startOfDay),
            ),
          )
          .groupBy(sql`EXTRACT(HOUR FROM recorded_at)`)
          .orderBy(sql`EXTRACT(HOUR FROM recorded_at)`);

        const hourMap = new Map(rows.map((r) => [Number(r.hour), parseFloat(Number(r.energyKwh).toFixed(2))]));
        const today = now.toISOString().slice(0, 10);
        data = Array.from({ length: 24 }, (_, h) => ({
          label: `${String(h).padStart(2, "0")}:00`,
          energyKwh: hourMap.get(h) ?? 0,
          date: today,
        }));
      }
      // No device: return empty — no readings yet
    } else if (period === "week") {
      // Last 7 days from dailyUsage
      if (device) {
        const sevenDaysAgo = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
        const rows = await db
          .select()
          .from(dailyUsageTable)
          .where(
            and(
              eq(dailyUsageTable.deviceId, device.id),
              gte(dailyUsageTable.usageDate, sevenDaysAgo),
            ),
          )
          .orderBy(dailyUsageTable.usageDate);

        const kwMap = new Map(rows.map((r) => [r.usageDate, r.energyKwh]));
        const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        data = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(now.getTime() - (6 - i) * 86400000);
          const dateStr = d.toISOString().slice(0, 10);
          return {
            label: DAYS[d.getDay()],
            energyKwh: parseFloat(Number(kwMap.get(dateStr) ?? 0).toFixed(2)),
            date: dateStr,
          };
        });
      }
      // No device: return empty
    } else if (period === "month") {
      // All days in current month from dailyUsage
      const firstOfMonth = `${now.toISOString().slice(0, 7)}-01`;
      if (device) {
        const rows = await db
          .select()
          .from(dailyUsageTable)
          .where(
            and(
              eq(dailyUsageTable.deviceId, device.id),
              gte(dailyUsageTable.usageDate, firstOfMonth),
            ),
          )
          .orderBy(dailyUsageTable.usageDate);

        const kwMap = new Map(rows.map((r) => [r.usageDate, r.energyKwh]));
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const today = now.getDate();
        data = Array.from({ length: Math.min(today, daysInMonth) }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth(), i + 1);
          const dateStr = d.toISOString().slice(0, 10);
          return {
            label: `${i + 1} ${MONTHS[now.getMonth()]}`,
            energyKwh: parseFloat(Number(kwMap.get(dateStr) ?? 0).toFixed(2)),
            date: dateStr,
          };
        });
      }
      // No device: return empty
    } else if (period === "year") {
      // Last 12 months aggregated from dailyUsage
      if (device) {
        const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1).toISOString().slice(0, 10);
        const rows = await db
          .select({
            month: sql<string>`TO_CHAR(usage_date::date, 'YYYY-MM')`,
            energyKwh: sql<number>`COALESCE(SUM(energy_kwh), 0)`,
          })
          .from(dailyUsageTable)
          .where(
            and(
              eq(dailyUsageTable.deviceId, device.id),
              gte(dailyUsageTable.usageDate, twelveMonthsAgo),
            ),
          )
          .groupBy(sql`TO_CHAR(usage_date::date, 'YYYY-MM')`)
          .orderBy(sql`TO_CHAR(usage_date::date, 'YYYY-MM')`);

        const kwMap = new Map(rows.map((r) => [r.month, parseFloat(Number(r.energyKwh).toFixed(2))]));
        data = Array.from({ length: 12 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          return {
            label: MONTHS[d.getMonth()],
            energyKwh: kwMap.get(key) ?? 0,
            date: d.toISOString().slice(0, 10),
          };
        });
      }
      // No device: return empty
    }

    res.json(GetEnergyConsumptionResponse.parse(data));
  } catch (err) {
    console.error("energy/consumption error:", err);
    res.status(500).json({ error: "Failed to fetch energy consumption" });
  }
});

// ── /energy/appliance-breakdown ─────────────────────────────────────────────

router.get("/energy/appliance-breakdown", async (req, res): Promise<void> => {
  try {
    const appliances = await db.select().from(appliancesTable);

    // Estimate each appliance's monthly contribution based on powerW and 8h/day average
    const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316", "#6b7280", "#ec4899"];
    const totalWh = appliances.reduce((sum, a) => sum + a.powerW * 8, 0) || 1;

    let breakdown = appliances.map((a, i) => {
      const applianceWh = a.powerW * 8; // 8 hours average per day
      const percentage = parseFloat(((applianceWh / totalWh) * 100).toFixed(1));
      const energyKwh = parseFloat(((applianceWh / 1000) * 30).toFixed(1)); // 30 days
      return { name: a.name, percentage, energyKwh, color: COLORS[i % COLORS.length] };
    });

    // Ensure percentages sum to 100
    const total = breakdown.reduce((s, b) => s + b.percentage, 0);
    if (total > 0 && Math.abs(total - 100) > 0.5) {
      breakdown = breakdown.map((b) => ({
        ...b,
        percentage: parseFloat(((b.percentage / total) * 100).toFixed(1)),
      }));
    }

    res.json(GetApplianceBreakdownResponse.parse(breakdown));
  } catch (err) {
    console.error("energy/appliance-breakdown error:", err);
    res.status(500).json({ error: "Failed to fetch appliance breakdown" });
  }
});

// ── /energy/analytics ───────────────────────────────────────────────────────

router.get("/energy/analytics", async (req, res): Promise<void> => {
  try {
    const device = await getDefaultDevice();
    const now = new Date();

    // ── Weekly trend from dailyUsage ──────────────────────────────────────
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let weeklyTrend: { label: string; energyKwh: number; date: string }[] = [];
    let avgDailyKwh = 0;

    if (device) {
      const sevenDaysAgo = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
      const rows = await db
        .select()
        .from(dailyUsageTable)
        .where(and(eq(dailyUsageTable.deviceId, device.id), gte(dailyUsageTable.usageDate, sevenDaysAgo)))
        .orderBy(dailyUsageTable.usageDate);

      const kwMap = new Map(rows.map((r) => [r.usageDate, r.energyKwh]));
      weeklyTrend = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now.getTime() - (6 - i) * 86400000);
        const dateStr = d.toISOString().slice(0, 10);
        const kwh = kwMap.get(dateStr) ?? 0;
        return { label: DAYS[d.getDay()], energyKwh: parseFloat(Number(kwh).toFixed(2)), date: dateStr };
      });

      const validDays = weeklyTrend.filter((d) => d.energyKwh > 0);
      if (validDays.length > 0) {
        avgDailyKwh = parseFloat((validDays.reduce((s, d) => s + d.energyKwh, 0) / validDays.length).toFixed(2));
      }
    }
    // No device: weeklyTrend stays empty, avgDailyKwh stays 0

    // ── Hourly pattern from readings ──────────────────────────────────────
    let hourlyPattern: { label: string; energyKwh: number; date: string }[] = [];
    if (device) {
      const yesterday = new Date(now.getTime() - 86400000);
      yesterday.setHours(0, 0, 0, 0);
      const rows = await db
        .select({
          hour: sql<number>`EXTRACT(HOUR FROM recorded_at)`,
          energyKwh: sql<number>`COALESCE(AVG(power_watts) / 1000.0, 0)`,
        })
        .from(readingsTable)
        .where(and(eq(readingsTable.deviceId, device.id), gte(readingsTable.recordedAt, yesterday)))
        .groupBy(sql`EXTRACT(HOUR FROM recorded_at)`)
        .orderBy(sql`EXTRACT(HOUR FROM recorded_at)`);

      const hourMap = new Map(rows.map((r) => [Number(r.hour), parseFloat(Number(r.energyKwh).toFixed(2))]));
      const today = now.toISOString().slice(0, 10);
      hourlyPattern = Array.from({ length: 24 }, (_, h) => ({
        label: `${String(h).padStart(2, "0")}:00`,
        energyKwh: hourMap.get(h) ?? 0,
        date: today,
      }));
    }
    // No device: hourlyPattern stays empty

    // ── Appliance-driven recommendations ────────────────────────────────────
    const appliances = await db.select().from(appliancesTable);
    const fan = appliances.find((a) => a.name.toLowerCase().includes("fan"));
    const highPower = appliances.filter((a) => a.powerW >= 100);

    // Efficiency score: based on avg daily usage (target 1–3 kWh for a lights+fan home)
    const efficiencyScore = avgDailyKwh > 0
      ? Math.max(40, Math.min(95, Math.round(100 - (avgDailyKwh - 1) * 8)))
      : 100;

    // Peak hour detection from hourly pattern
    const peakHour = hourlyPattern.length > 0
      ? hourlyPattern.reduce((max, h) => (h.energyKwh > max.energyKwh ? h : max), hourlyPattern[0])
      : null;
    const lowHour = hourlyPattern.length > 0
      ? hourlyPattern.reduce((min, h) => (h.energyKwh < min.energyKwh ? h : min), hourlyPattern[0])
      : null;

    const recommendations = [];
    if (fan) {
      recommendations.push({ id: "rec-1", appliance: fan.name, message: `Running ${fan.name} continuously adds to consumption. Use a timer to switch it off when not needed.`, savingInr: 30, severity: "info" });
    }
    if (highPower.length >= 3) {
      recommendations.push({ id: "rec-2", appliance: highPower[0].name, message: `${highPower.length} lights are on simultaneously. Switch off lights in unoccupied rooms to cut usage.`, savingInr: 50, severity: "warning" });
    }
    if (avgDailyKwh > 0 && avgDailyKwh < 2) {
      recommendations.push({ id: "rec-3", appliance: "System", message: "Your energy usage is very low — great job! Continue switching off lights and the fan when leaving rooms.", savingInr: 0, severity: "info" });
    }
    if (recommendations.length === 0) {
      recommendations.push({ id: "rec-0", appliance: "System", message: "Your energy usage looks efficient! Keep maintaining current habits to stay on budget.", savingInr: 0, severity: "info" });
    }

    const analytics = {
      efficiencyScore,
      peakUsageHour: peakHour ? peakHour.label : "N/A",
      lowestUsageHour: lowHour ? lowHour.label : "N/A",
      avgDailyKwh,
      savingOpportunities: recommendations.map((r) => r.message),
      recommendations,
      weeklyTrend,
      hourlyPattern,
    };

    res.json(GetEnergyAnalyticsResponse.parse(analytics));
  } catch (err) {
    console.error("energy/analytics error:", err);
    res.status(500).json({ error: "Failed to fetch energy analytics" });
  }
});

export default router;
