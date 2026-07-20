import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  devicesTable,
  readingsTable,
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

    // Insert reading
    await db.insert(readingsTable).values({
      deviceId: device.id,
      powerWatts: power,
      voltageV: voltage ?? null,
      currentA: current ?? null,
      energyKwh: energy ?? null,
      recordedAt: new Date(),
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
