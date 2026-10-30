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
  name?: string;
  isOn: boolean;
}

const APPLIANCE_ID_BY_NAME: Record<string, keyof typeof APPLIANCE_POWER_RATINGS_W> = {
  "living room light": "light-living",
  "bedroom light": "light-bedroom",
  "kitchen light": "light-kitchen",
  "study room light": "light-study",
  "mini fan": "fan-living",
};

export function getCanonicalApplianceId(id: string, name?: string): keyof typeof APPLIANCE_POWER_RATINGS_W | null {
  if (Object.prototype.hasOwnProperty.call(APPLIANCE_POWER_RATINGS_W, id)) return id as keyof typeof APPLIANCE_POWER_RATINGS_W;
  const normalizedName = name?.trim().toLowerCase().replace(/\s+/g, " ");
  return normalizedName ? APPLIANCE_ID_BY_NAME[normalizedName] ?? null : null;
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
    appliances.map((appliance) => [getCanonicalApplianceId(appliance.id, appliance.name) ?? appliance.id, appliance.isOn]),
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

export function getAppliancePowerRatingW(id: string, fallback: number, name?: string): number {
  const canonicalId = getCanonicalApplianceId(id, name);
  return canonicalId ? APPLIANCE_POWER_RATINGS_W[canonicalId] : fallback;
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
