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

// ── Fallback generators (used when DB has no data for that period) ──────────

function fallbackHourly(): { label: string; energyKwh: number; date: string }[] {
  const today = new Date().toISOString().slice(0, 10);
  return Array.from({ length: 24 }, (_, h) => {
    let base = 0.3;
    if (h >= 6 && h < 10) base = 0.8;
    else if (h >= 10 && h < 14) base = 1.0;
    else if (h >= 14 && h < 18) base = 1.2;
    else if (h >= 18 && h < 23) base = 1.5;
    return { label: `${String(h).padStart(2, "0")}:00`, energyKwh: parseFloat((base + (Math.random() - 0.4) * 0.3).toFixed(2)), date: today };
  });
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
      } else {
        data = fallbackHourly();
      }
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
            energyKwh: parseFloat(Number(kwMap.get(dateStr) ?? (12 + Math.random() * 8)).toFixed(2)),
            date: dateStr,
          };
        });
      } else {
        const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        data = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(now.getTime() - (6 - i) * 86400000);
          return { label: DAYS[d.getDay()], energyKwh: parseFloat((12 + Math.random() * 8).toFixed(2)), date: d.toISOString().slice(0, 10) };
        });
      }
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
            energyKwh: parseFloat(Number(kwMap.get(dateStr) ?? (10 + Math.random() * 8)).toFixed(2)),
            date: dateStr,
          };
        });
      } else {
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const today = now.getDate();
        data = Array.from({ length: Math.min(today, daysInMonth) }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth(), i + 1);
          return {
            label: `${i + 1} ${MONTHS[now.getMonth()]}`,
            energyKwh: parseFloat((10 + Math.random() * 8).toFixed(2)),
            date: d.toISOString().slice(0, 10),
          };
        });
      }
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
            energyKwh: kwMap.get(key) ?? parseFloat((80 + Math.random() * 80).toFixed(2)),
            date: d.toISOString().slice(0, 10),
          };
        });
      } else {
        data = Array.from({ length: 12 }, (_, i) => {
          const d = new Date(now.getFullYear(), i, 1);
          return { label: MONTHS[i], energyKwh: parseFloat((80 + Math.random() * 80).toFixed(2)), date: d.toISOString().slice(0, 10) };
        });
      }
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
    let avgDailyKwh = 8.4;

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
        const kwh = kwMap.get(dateStr) ?? (12 + Math.random() * 8);
        return { label: DAYS[d.getDay()], energyKwh: parseFloat(Number(kwh).toFixed(2)), date: dateStr };
      });

      const validDays = weeklyTrend.filter((d) => d.energyKwh > 0);
      if (validDays.length > 0) {
        avgDailyKwh = parseFloat((validDays.reduce((s, d) => s + d.energyKwh, 0) / validDays.length).toFixed(2));
      }
    } else {
      weeklyTrend = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now.getTime() - (6 - i) * 86400000);
        return { label: DAYS[d.getDay()], energyKwh: parseFloat((12 + Math.random() * 8).toFixed(2)), date: d.toISOString().slice(0, 10) };
      });
    }

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
    } else {
      hourlyPattern = fallbackHourly();
    }

    // ── Appliance-driven recommendations ────────────────────────────────────
    const appliances = await db.select().from(appliancesTable);
    const ac = appliances.find((a) => a.name.toLowerCase().includes("condition") || a.name.toLowerCase().includes("ac"));
    const washer = appliances.find((a) => a.name.toLowerCase().includes("wash"));
    const highPower = appliances.filter((a) => a.powerW >= 1000);

    // Efficiency score: based on avg daily usage (target 7–10 kWh for a 4-room home)
    const efficiencyScore = Math.max(40, Math.min(95, Math.round(100 - (avgDailyKwh - 7) * 4)));

    // Peak hour detection from hourly pattern
    const peakHour = hourlyPattern.reduce((max, h) => (h.energyKwh > max.energyKwh ? h : max), hourlyPattern[0]);
    const lowHour = hourlyPattern.reduce((min, h) => (h.energyKwh < min.energyKwh ? h : min), hourlyPattern[0]);

    const recommendations = [];
    if (ac && ac.powerW >= 1500) {
      recommendations.push({ id: "rec-1", appliance: ac.name, message: `Your ${ac.name} (${ac.powerW}W) is a top energy consumer. Increasing set temperature by 2°C can save approx ₹300/month.`, savingInr: 300, severity: "warning" });
    }
    if (washer) {
      recommendations.push({ id: "rec-2", appliance: washer.name, message: `Running ${washer.name} during peak hours adds up to 30% to electricity cost. Shift usage to off-peak hours (10pm–6am).`, savingInr: 180, severity: "warning" });
    }
    if (highPower.length > 0) {
      recommendations.push({ id: "rec-3", appliance: highPower[0].name, message: `${highPower.length} appliance(s) above 1000W detected. Staggering their usage prevents simultaneous peak load.`, savingInr: 150, severity: "info" });
    }
    if (recommendations.length === 0) {
      recommendations.push({ id: "rec-0", appliance: "System", message: "Your energy usage looks efficient! Keep maintaining current habits to stay on budget.", savingInr: 0, severity: "info" });
    }

    const analytics = {
      efficiencyScore,
      peakUsageHour: peakHour ? peakHour.label : "19:00",
      lowestUsageHour: lowHour ? lowHour.label : "03:00",
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
