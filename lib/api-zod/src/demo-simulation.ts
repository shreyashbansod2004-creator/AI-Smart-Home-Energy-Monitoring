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
 * Demo mode is ON unless DEMO_MODE is explicitly set to a false-like value,
 * so the presentation build works with no extra configuration. Set
 * DEMO_MODE=false to restore hardware-sensor behaviour.
 */
export function parseDemoModeFlag(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return true;
  return !["false", "0", "off", "no", "disabled"].includes(
    value.trim().toLowerCase(),
  );
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
