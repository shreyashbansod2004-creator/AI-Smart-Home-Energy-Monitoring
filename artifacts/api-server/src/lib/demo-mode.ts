import {
  advanceEnergyLedger,
  createDemoApplianceStates,
  createEnergyLedger,
  demoStatesToList,
  estimatePowerFromConfirmedStates,
  parseDemoModeFlag,
  setDemoApplianceState,
  turnAllDemoAppliancesOff,
  whToKwh,
  type DemoApplianceStates,
  type SimulatedEnergyLedger,
} from "@workspace/api-zod";
import { logger } from "./logger";

/**
 * DEMO MODE — SIMULATED READINGS.
 *
 * Enabled only with DEMO_MODE=true. Everything here lives in server memory:
 *  - appliance ON/OFF state (the buttons do NOT reach the ESP32 or any database),
 *  - simulated energy.
 * Nothing in this file imports the database module, writes a command, or stores a
 * simulated value as a sensor reading. State restarts (all OFF, 0 energy) when the
 * server restarts.
 */
export const DEMO_MODE_ENABLED = parseDemoModeFlag(process.env["DEMO_MODE"]);

const SAMPLE_INTERVAL_MS = 1000;

let states: DemoApplianceStates = createDemoApplianceStates();
let ledger: SimulatedEnergyLedger | null = null;
let timer: NodeJS.Timeout | null = null;

function currentPowerW(): number {
  // Always recomputed from the complete state set, never adjusted by +/- deltas.
  return estimatePowerFromConfirmedStates(demoStatesToList(states)) ?? 0;
}

/**
 * Advance the energy ledger to "now". Synchronous, so toggles, polling and the
 * background sampler are applied strictly in order, and a repeat at the same
 * instant adds no energy (no double counting).
 */
export function tickDemoEnergy(nowMs: number = Date.now()): SimulatedEnergyLedger {
  const iso = new Date(nowMs).toISOString();
  const dayKey = iso.slice(0, 10);
  const monthKey = iso.slice(0, 7);
  ledger = ledger
    ? advanceEnergyLedger(ledger, nowMs, currentPowerW(), dayKey, monthKey)
    : createEnergyLedger(nowMs, currentPowerW(), dayKey, monthKey);
  return ledger;
}

export function getDemoStates(): { id: string; isOn: boolean }[] {
  return demoStatesToList(states);
}

export function getDemoPowerW(): number {
  return currentPowerW();
}

/**
 * Returns false for an unknown appliance id. The elapsed interval is first
 * charged at the OLD power, then the new state is applied.
 */
export function setDemoAppliance(id: string, isOn: boolean): boolean {
  tickDemoEnergy();
  const next = setDemoApplianceState(states, id, isOn);
  if (!next) return false;
  states = next;
  tickDemoEnergy();
  return true;
}

export function turnAllDemoOff(): void {
  tickDemoEnergy();
  states = turnAllDemoAppliancesOff(states);
  tickDemoEnergy();
}

export function getDemoEnergyKwh() {
  const l = tickDemoEnergy();
  return { todayKwh: whToKwh(l.dayWh), monthKwh: whToKwh(l.monthWh) };
}

/** Keeps integrating while nobody is looking at the dashboard. */
export function startDemoEnergySampler(): void {
  if (!DEMO_MODE_ENABLED || timer) return;
  logger.info(
    "DEMO MODE enabled: simulated readings and in-memory appliances; no database, no ESP32 commands",
  );
  tickDemoEnergy();
  timer = setInterval(() => tickDemoEnergy(), SAMPLE_INTERVAL_MS);
  timer.unref();
}
