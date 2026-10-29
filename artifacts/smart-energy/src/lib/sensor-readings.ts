const MAX_LIVE_READING_AGE_MS = 15_000;

export function isFreshSensorTimestamp(
  timestamp: string | undefined,
  now = Date.now(),
): boolean {
  if (!timestamp) return false;

  const recordedAt = Date.parse(timestamp);
  if (!Number.isFinite(recordedAt)) return false;

  const ageMs = now - recordedAt;
  return ageMs >= 0 && ageMs <= MAX_LIVE_READING_AGE_MS;
}

export function isValidVoltageV(value: number | undefined): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 50 &&
    value <= 300
  );
}

export function isValidCurrentA(value: number | undefined): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}
