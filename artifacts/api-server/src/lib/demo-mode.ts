import { db, appliancesTable } from "@workspace/db";
import {
  advanceEnergyLedger,
  createEnergyLedger,
  estimatePowerFromConfirmedStates,
  parseDemoModeFlag,
  whToKwh,
  type SimulatedEnergyLedger,
} from "@workspace/api-zod";
import { logger } from "./logger";

/**
 * Demo mode: dashboard voltage, current, power and energy are SIMULATED from the
 * acknowledged appliance ON/OFF states. Enabled by default; set DEMO_MODE=false
 * to go back to ESP32 sensor readings.
 *
 * Nothing in this file writes to the database. Simulated values are never stored
 * as sensor readings, and sensor readings are never read while demo mode is on.
 */
export const DEMO_MODE_ENABLED = parseDemoModeFlag(process.env["DEMO_MODE"]);

const SAMPLE_INTERVAL_MS = 1000;

// In-memory only: the existing schema has no place for simulated energy that
// would not mix it with real sensor history, and no migration is warranted.
// Totals therefore restart from 0 when the server restarts.
let ledger: SimulatedEnergyLedger | null = null;
let inFlight: Promise<SimulatedEnergyLedger> | null = null;
let timer: NodeJS.Timeout | null = null;

async function sampleOnce(): Promise<SimulatedEnergyLedger> {
  // The existing appliance table (updated only on ESP32 acknowledgement) is the
  // single source of truth for ON/OFF. The total is recomputed from it each
  // time, never adjusted by +/- deltas.
  const appliances = await db.select().from(appliancesTable);
  const powerW = estimatePowerFromConfirmedStates(appliances) ?? 0;

  // Timestamp taken after the await so samples are applied in time order.
  const nowMs = Date.now();
  const iso = new Date(nowMs).toISOString();
  const dayKey = iso.slice(0, 10);
  const monthKey = iso.slice(0, 7);

  ledger = ledger
    ? advanceEnergyLedger(ledger, nowMs, powerW, dayKey, monthKey)
    : createEnergyLedger(nowMs, powerW, dayKey, monthKey);
  return ledger;
}

/**
 * Advance the ledger to "now". Concurrent callers (polling, refetches, the
 * background sampler) share one in-flight sample, and a repeat at the same
 * instant adds no energy, so energy cannot be double-counted.
 */
export function sampleDemoEnergy(): Promise<SimulatedEnergyLedger> {
  if (!inFlight) {
    inFlight = sampleOnce().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export function toEnergyKwh(l: SimulatedEnergyLedger) {
  return { todayKwh: whToKwh(l.dayWh), monthKwh: whToKwh(l.monthWh) };
}

/** Keeps integrating while nobody is looking at the dashboard. */
export function startDemoEnergySampler(): void {
  if (!DEMO_MODE_ENABLED || timer) return;
  logger.info("DEMO MODE enabled: dashboard readings are simulated from appliance states");

  const tick = () => {
    sampleDemoEnergy().catch((err) => {
      logger.warn({ err }, "demo energy sample failed; interval not credited");
    });
  };
  tick();
  timer = setInterval(tick, SAMPLE_INTERVAL_MS);
  timer.unref();
}
