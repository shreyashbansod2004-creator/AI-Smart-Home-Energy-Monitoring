export const APPLIANCE_POWER_RATINGS_W = {
  "light-living": 2.5,
  "light-bedroom": 2.5,
  "light-kitchen": 2.5,
  "light-study": 2.5,
  "fan-living": 5.5,
} as const;

export const CONFIRMED_APPLIANCE_IDS = Object.keys(
  APPLIANCE_POWER_RATINGS_W,
) as (keyof typeof APPLIANCE_POWER_RATINGS_W)[];

export interface ApplianceRelayState {
  id: string;
  isOn: boolean;
}

/**
 * Calculate from the complete, confirmed set rather than a toggle delta.
 * A partial or duplicate set cannot produce a trustworthy total.
 */
export function estimatePowerFromConfirmedStates(
  appliances: readonly ApplianceRelayState[],
): number | null {
  if (appliances.length !== CONFIRMED_APPLIANCE_IDS.length) return null;
  if (appliances.some((appliance) => typeof appliance.isOn !== "boolean")) return null;

  const byId = new Map(
    appliances.map((appliance) => [appliance.id, appliance.isOn]),
  );
  if (
    byId.size !== CONFIRMED_APPLIANCE_IDS.length ||
    CONFIRMED_APPLIANCE_IDS.some((id) => !byId.has(id))
  ) {
    return null;
  }

  return CONFIRMED_APPLIANCE_IDS.reduce(
    (total, id) => total + (byId.get(id) ? APPLIANCE_POWER_RATINGS_W[id] : 0),
    0,
  );
}

export function getAppliancePowerRatingW(id: string, fallback: number): number {
  return Object.prototype.hasOwnProperty.call(APPLIANCE_POWER_RATINGS_W, id)
    ? APPLIANCE_POWER_RATINGS_W[id as keyof typeof APPLIANCE_POWER_RATINGS_W]
    : fallback;
}

export function matchesCommandAcknowledgement(
  command: { relayNumber: number; command: string },
  acknowledgement: { relayNum: number; state: string },
): boolean {
  return (
    command.relayNumber === acknowledgement.relayNum &&
    command.command === acknowledgement.state
  );
}
