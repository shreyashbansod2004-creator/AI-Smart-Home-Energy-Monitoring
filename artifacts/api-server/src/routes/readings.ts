import { Router } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  devicesTable,
  readingsTable,
  dailyUsageTable,
  alertsTable,
  settingsTable,
} from "@workspace/db";

const router = Router();

// ── Validation schema for ESP32 POST body ─────────────────────────────────────
const PostReadingBody = z.object({
  deviceId: z.string().min(1),
  voltage:  z.number().optional(),
  current:  z.number().optional(),
  power:    z.number(),
  energy:   z.number().optional(),
  timestamp: z.string().optional(),
});

// ── Alert thresholds (can be overridden per-device from settings) ─────────────
const THRESHOLDS = {
  voltageHighV:    250,
  voltageLowV:     200,
  currentHighA:    10,
  powerHighW:      750,  // default — also checked against settings
  offlineAfterMs:  600_000, // 10 minutes = device offline
};

// ── Deduplicate: only raise an alert of each type once per 30 min ─────────────
const recentAlerts = new Map<string, number>(); // type → timestamp
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

// Map internal dedup keys → valid alert type enum values
const TYPE_MAP: Record<string, string> = {
  high_voltage:  "appliance_alert",
  low_voltage:   "appliance_alert",
  high_current:  "high_power",
  high_power:    "high_power",
};

async function maybeInsertAlert(
  dedupKey: string,
  title: string,
  message: string,
  severity: string,
  applianceName?: string,
) {
  const lastTs = recentAlerts.get(dedupKey) ?? 0;
  if (Date.now() - lastTs < ALERT_COOLDOWN_MS) return; // cooldown
  recentAlerts.set(dedupKey, Date.now());

  const dbType = TYPE_MAP[dedupKey] ?? "appliance_alert";
  const id = `${dedupKey}-${Date.now()}`;
  await db.insert(alertsTable).values({
    id,
    type: dbType,
    title,
    message,
    severity,
    isDismissed: false,
    applianceName: applianceName ?? null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/readings — ESP32 sends sensor data every 5 seconds
// ─────────────────────────────────────────────────────────────────────────────
router.post("/readings", async (req, res): Promise<void> => {
  const parsed = PostReadingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reading payload", details: parsed.error.issues });
    return;
  }

  const { deviceId: deviceKey, voltage, current, power, energy } = parsed.data;

  try {
    // Resolve device by key; auto-register if first time
    let device = await db
      .select()
      .from(devicesTable)
      .where(eq(devicesTable.deviceKey, deviceKey))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!device) {
      const [inserted] = await db
        .insert(devicesTable)
        .values({ deviceKey, name: deviceKey, tariffRatePerKwh: 8.5 })
        .returning();
      device = inserted;
    }

    // ── Compute energy increment from elapsed time (accurate for any interval) ──
    // Fetch the previous reading BEFORE inserting so we know the elapsed time.
    const [prevReading] = await db
      .select({ recordedAt: readingsTable.recordedAt, energyKwh: readingsTable.energyKwh })
      .from(readingsTable)
      .where(eq(readingsTable.deviceId, device.id))
      .orderBy(desc(readingsTable.recordedAt))
      .limit(1);

    const now = new Date();
    let energyIncrementKwh: number;
    if (prevReading) {
      const elapsedMs = now.getTime() - prevReading.recordedAt.getTime();
      const elapsedH  = elapsedMs / 3_600_000;
      if (elapsedMs >= 1_000 && elapsedMs <= 300_000) {
        // Elapsed 1 s – 5 min: reliable interval; derive energy from power × time
        energyIncrementKwh = (power / 1000) * elapsedH;
      } else if (
        energy !== undefined &&
        prevReading.energyKwh !== null &&
        energy > prevReading.energyKwh
      ) {
        // Cumulative firmware meter delta (handles any post interval or reboot guard)
        energyIncrementKwh = energy - prevReading.energyKwh;
      } else {
        // Gap too large or no usable delta: fall back to fixed 5-second estimate
        energyIncrementKwh = (power / 1000) * (5 / 3600);
      }
    } else {
      // First reading for this device: use supplied cumulative energy or 5-second estimate
      energyIncrementKwh = energy ?? (power / 1000) * (5 / 3600);
    }

    const todayStr = now.toISOString().slice(0, 10);

    // ── Atomic: reading insert + daily_usage upsert ───────────────────────────
    await db.transaction(async (tx) => {
      await tx.insert(readingsTable).values({
        deviceId: device.id,
        powerWatts: power,
        voltageV: voltage ?? null,
        currentA: current ?? null,
        energyKwh: energy ?? null,
        recordedAt: now,
      });

      await tx
        .insert(dailyUsageTable)
        .values({ deviceId: device.id, usageDate: todayStr, energyKwh: energyIncrementKwh })
        .onConflictDoUpdate({
          target: [dailyUsageTable.deviceId, dailyUsageTable.usageDate],
          set: { energyKwh: sql`${dailyUsageTable.energyKwh} + ${energyIncrementKwh}` },
        });
    });

    // ── Auto-generate alerts based on thresholds ─────────────────────────────
    const [settings] = await db.select().from(settingsTable).limit(1);
    const highPowerW = settings?.highPowerThresholdW ?? THRESHOLDS.powerHighW;

    if (voltage !== undefined && voltage > THRESHOLDS.voltageHighV) {
      await maybeInsertAlert(
        "high_voltage",
        "High Voltage Detected",
        `Voltage reading of ${voltage.toFixed(1)}V exceeds safe limit (${THRESHOLDS.voltageHighV}V). Check your supply line.`,
        "high",
      );
    }

    if (voltage !== undefined && voltage < THRESHOLDS.voltageLowV && voltage > 0) {
      await maybeInsertAlert(
        "low_voltage",
        "Low Voltage Warning",
        `Voltage reading of ${voltage.toFixed(1)}V is below minimum (${THRESHOLDS.voltageLowV}V). Appliances may not operate correctly.`,
        "medium",
      );
    }

    if (current !== undefined && current > THRESHOLDS.currentHighA) {
      await maybeInsertAlert(
        "high_current",
        "High Current Warning",
        `Current draw of ${current.toFixed(2)}A exceeds safe threshold (${THRESHOLDS.currentHighA}A). Risk of circuit overload.`,
        "critical",
      );
    }

    if (power > highPowerW) {
      await maybeInsertAlert(
        "high_power",
        "High Power Consumption",
        `Instantaneous power of ${power.toFixed(0)}W exceeds your threshold of ${highPowerW}W.`,
        "medium",
      );
    }

    res.status(201).json({ success: true, deviceId: device.id });
  } catch (err) {
    console.error("POST /readings error:", err);
    res.status(500).json({ error: "Failed to save reading" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Background job: check for device offline / communication failure
// Runs every 5 minutes and raises an alert if no reading in 10 min.
// ─────────────────────────────────────────────────────────────────────────────
let _offlineCheckInterval: ReturnType<typeof setInterval> | null = null;

export function startOfflineDetection() {
  if (_offlineCheckInterval) return;
  _offlineCheckInterval = setInterval(async () => {
    try {
      const devices = await db.select().from(devicesTable);
      for (const device of devices) {
        const [latest] = await db
          .select()
          .from(readingsTable)
          .where(eq(readingsTable.deviceId, device.id))
          .orderBy(desc(readingsTable.recordedAt))
          .limit(1);

        if (!latest) continue;

        const msSinceLastReading = Date.now() - latest.recordedAt.getTime();

        if (msSinceLastReading > THRESHOLDS.offlineAfterMs) {
          const minutesAgo = Math.round(msSinceLastReading / 60_000);
          await maybeInsertAlert(
            `device_offline_${device.deviceKey}`,
            "Device Offline",
            `${device.name ?? device.deviceKey} has not reported in ${minutesAgo} minutes. Check WiFi connection.`,
            "critical",
          );
        } else if (msSinceLastReading > THRESHOLDS.offlineAfterMs / 2) {
          const minutesAgo = Math.round(msSinceLastReading / 60_000);
          await maybeInsertAlert(
            `comm_failure_${device.deviceKey}`,
            "Communication Delay",
            `${device.name ?? device.deviceKey} last reported ${minutesAgo} minutes ago. Check network.`,
            "medium",
          );
        }
      }
    } catch (err) {
      console.error("Offline detection error:", err);
    }
  }, 5 * 60 * 1000);
}

export default router;
