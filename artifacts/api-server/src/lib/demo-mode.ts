import {
  estimatePowerFromConfirmedStates,
  getCanonicalApplianceId,
  type ApplianceRelayState,
} from "@workspace/api-zod";

export const DEMO_NOMINAL_VOLTAGE_V = 230;
export const DEMO_POWER_FACTOR = 0.9;

/** Small deterministic fluctuation around nominal mains voltage (227–233 V). */
export function getDemoVoltageV(nowMs: number): number {
  return DEMO_NOMINAL_VOLTAGE_V + Math.sin(nowMs / 30_000) * 3;
}
export const DEMO_MAX_SAMPLE_GAP_MS = 5_000;

/** Demo mode is deliberately opt-in. Only the exact string "true" enables it. */
export function isDemoModeEnabled(value: string | undefined): boolean {
  return value === "true";
}

export interface SimulatedElectricalReadings {
  powerW: number;
  voltageV: number;
  currentA: number;
  energyKwh: number;
  sampledAt: string;
}

/**
 * In-memory demo energy ledger. It integrates the previous confirmed power
 * only across short observed intervals. Restarting the API resets this ledger.
 * Invalid appliance state snapshots never mutate the ledger.
 */
export class DemoEnergyLedger {
  private previousPowerW: number | null = null;
  private previousAtMs: number | null = null;
  private energyWh = 0;

  sample(
    appliances: readonly ApplianceRelayState[],
    nowMs = Date.now(),
  ): SimulatedElectricalReadings | null {
    const powerW = estimatePowerFromConfirmedStates(appliances);
    if (
      powerW === null ||
      !Number.isFinite(nowMs) ||
      !Number.isFinite(new Date(nowMs).getTime())
    ) return null;

    if (this.previousPowerW !== null && this.previousAtMs !== null) {
      const elapsedMs = nowMs - this.previousAtMs;
      if (elapsedMs >= 0 && elapsedMs <= DEMO_MAX_SAMPLE_GAP_MS) {
        this.energyWh += this.previousPowerW * (elapsedMs / 3_600_000);
      }
    }

    this.previousPowerW = powerW;
    this.previousAtMs = nowMs;

    const voltageV = getDemoVoltageV(nowMs);

    return {
      powerW,
      voltageV,
      currentA: powerW === 0 ? 0 : powerW / (voltageV * DEMO_POWER_FACTOR),
      energyKwh: this.energyWh / 1_000,
      sampledAt: new Date(nowMs).toISOString(),
    };
  }

  getEnergyKwh(): number {
    return this.energyWh / 1_000;
  }
}

export function getConfirmedApplianceStates(
  rows: readonly { id: string; name?: string; isOn: boolean }[],
): ApplianceRelayState[] | null {
  if (rows.some((row) => typeof row.isOn !== "boolean")) return null;
  const states = rows.map(({ id, name, isOn }) => ({
    id: getCanonicalApplianceId(id, name) ?? id,
    name,
    isOn,
  }));
  return estimatePowerFromConfirmedStates(states) === null ? null : states;
}
