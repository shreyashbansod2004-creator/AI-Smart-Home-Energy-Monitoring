/**
 * Demo-mode simulation (pure functions, no I/O).
 *
 * While demo mode is enabled, the dashboard's electrical readings are
 * calculated from the confirmed ON/OFF appliance states instead of the ESP32
 * voltage/current sensors. Nothing here is a hardware measurement, and nothing
 * here is ever written to the readings table.
 *
 * Appliance wattage lives in ONE place: APPLIANCE_POWER_RATINGS_W in
 * ./energy-estimate. Callers pass the total from
 * estimatePowerFromConfirmedStates() into these helpers.
 */

/** Nominal single-phase AC supply voltage used in demo mode (also when all OFF). */
export const DEMO_NOMINAL_VOLTAGE_V = 230;

/** Configured demo power-factor assumption. Not a measured value. */
export const DEMO_POWER_FACTOR = 0.9;

export const DEMO_MODE_LABEL = "DEMO MODE — SIMULATED READINGS";

/**
 * Demo mode is OPT-IN: it is enabled only when DEMO_MODE is explicitly set to a
 * true-like value. In demo mode the appliance buttons stop controlling real
 * relays, so it must never switch on by accident (for example in production).
 *
 * Keep in sync with the same check in lib/db/src/index.ts.
 */
export function parseDemoModeFlag(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  return ["true", "1", "on", "yes"].includes(value.trim().toLowerCase());
}

export interface SimulatedElectricalReadings {
  voltageV: number;
  powerFactor: number;
  /** Combined rated power of appliances currently ON, in watts. */
  currentPowerW: number;
  /** Full precision; round only for display (3 decimals). */
  currentA: number;
}

/**
 * currentA = currentPowerW / (voltageV * powerFactor)
 *
 * Returns null when the power total is unavailable (for example an incomplete
 * appliance-state set), so the UI can show "unavailable" rather than a guess.
 */
export function simulateElectricalReadings(
  currentPowerW: number | null | undefined,
): SimulatedElectricalReadings | null {
  if (
    typeof currentPowerW !== "number" ||
    !Number.isFinite(currentPowerW) ||
    currentPowerW < 0
  ) {
    return null;
  }
  return {
    voltageV: DEMO_NOMINAL_VOLTAGE_V,
    powerFactor: DEMO_POWER_FACTOR,
    currentPowerW,
    currentA: currentPowerW / (DEMO_NOMINAL_VOLTAGE_V * DEMO_POWER_FACTOR),
  };
}

export function formatSimulatedCurrentA(currentA: number): string {
  return currentA.toFixed(3);
}

// ─── Simulated energy ────────────────────────────────────────────────────────

/**
 * An interval longer than this is not credited. The sampler ticks every second,
 * so a larger gap means the process was not observing (suspended/restarted) and
 * the appliance states in between are unknown. Crediting it would invent energy.
 */
export const DEMO_MAX_CREDITED_GAP_MS = 5_000;

export interface SimulatedEnergyLedger {
  lastTickMs: number;
  /** Power that was in effect since lastTickMs (W). */
  lastPowerW: number;
  dayKey: string;
  monthKey: string;
  dayWh: number;
  monthWh: number;
}

export function createEnergyLedger(
  nowMs: number,
  powerW: number,
  dayKey: string,
  monthKey: string,
): SimulatedEnergyLedger {
  return {
    lastTickMs: nowMs,
    lastPowerW: powerW,
    dayKey,
    monthKey,
    dayWh: 0,
    monthWh: 0,
  };
}

/**
 * energyWh = powerW * elapsedHours, using the PREVIOUS power for the elapsed
 * interval, then switching to the new power for the next one. A repeated call
 * with the same timestamp adds nothing, so renders, polling and refetches
 * cannot double-count. Returns a new ledger; the input is not mutated.
 */
export function advanceEnergyLedger(
  ledger: SimulatedEnergyLedger,
  nowMs: number,
  newPowerW: number,
  dayKey: string,
  monthKey: string,
  maxGapMs: number = DEMO_MAX_CREDITED_GAP_MS,
): SimulatedEnergyLedger {
  // Never move time backwards (clock adjustments, out-of-order calls): a stale
  // sample is ignored. A repeat at the same instant adds no energy, but the
  // newest power applies from here on.
  if (nowMs < ledger.lastTickMs) return ledger;
  if (nowMs === ledger.lastTickMs) return { ...ledger, lastPowerW: newPowerW };

  const elapsedMs = nowMs - ledger.lastTickMs;
  const creditedWh =
    elapsedMs <= maxGapMs ? (ledger.lastPowerW * elapsedMs) / 3_600_000 : 0;

  // The interval belongs to the period it started in; then reset on rollover.
  let dayWh = ledger.dayWh + creditedWh;
  let monthWh = ledger.monthWh + creditedWh;
  if (dayKey !== ledger.dayKey) dayWh = 0;
  if (monthKey !== ledger.monthKey) monthWh = 0;

  return {
    lastTickMs: nowMs,
    lastPowerW: newPowerW,
    dayKey,
    monthKey,
    dayWh,
    monthWh,
  };
}

export function whToKwh(wh: number): number {
  return wh / 1000;
}

/** estimatedBill = simulatedEnergyKWh * existingTariffPerKWh */
export function estimateBillInr(
  energyKwh: number,
  tariffPerKwh: number,
): number {
  return energyKwh * tariffPerKwh;
}

// ─── In-memory demo appliances ───────────────────────────────────────────────

export interface DemoApplianceDefinition {
  id: string;
  name: string;
  location: string;
  iconType: string;
}

/**
 * The five demo appliances, in the same order as the project's relay seed.
 * The ids must be exactly the ids in APPLIANCE_POWER_RATINGS_W (a test enforces
 * this); wattage is never defined here.
 */
export const DEMO_APPLIANCES: readonly DemoApplianceDefinition[] = [
  { id: "light-living", name: "Living Room Light", location: "Living Room", iconType: "light" },
  { id: "light-bedroom", name: "Bedroom Light", location: "Bedroom", iconType: "light" },
  { id: "light-kitchen", name: "Kitchen Light", location: "Kitchen", iconType: "light" },
  { id: "light-study", name: "Sitting Area/Study Room Light", location: "Study Room", iconType: "light" },
  { id: "fan-living", name: "Mini Fan", location: "Living Room", iconType: "fan" },
];

export type DemoApplianceStates = Readonly<Record<string, boolean>>;

/** Everything OFF. */
export function createDemoApplianceStates(): DemoApplianceStates {
  return Object.fromEntries(DEMO_APPLIANCES.map((a) => [a.id, false]));
}

/** Returns a new state map, or null for an unknown appliance id. */
export function setDemoApplianceState(
  states: DemoApplianceStates,
  id: string,
  isOn: boolean,
): DemoApplianceStates | null {
  if (!Object.prototype.hasOwnProperty.call(states, id)) return null;
  return { ...states, [id]: isOn };
}

export function turnAllDemoAppliancesOff(
  states: DemoApplianceStates,
): DemoApplianceStates {
  return Object.fromEntries(Object.keys(states).map((id) => [id, false]));
}

/** The complete {id, isOn} set, in catalog order (what the power estimate expects). */
export function demoStatesToList(
  states: DemoApplianceStates,
): { id: string; isOn: boolean }[] {
  return DEMO_APPLIANCES.map((a) => ({ id: a.id, isOn: states[a.id] === true }));
}
