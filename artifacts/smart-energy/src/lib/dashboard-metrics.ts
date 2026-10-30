export function isFiniteMetric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatEnergyKwh(value: unknown, fractionDigits: number): string {
  return isFiniteMetric(value) ? `${value.toFixed(fractionDigits)} kWh` : "—";
}

export function formatCurrencyInr(value: unknown): string {
  return isFiniteMetric(value) ? `₹${value.toLocaleString("en-IN")}` : "—";
}

export function safePercentage(value: unknown): number {
  return isFiniteMetric(value) ? value : 0;
}

export interface SafeEnergyChartPoint {
  label: string;
  energyKwh: number;
  [key: string]: unknown;
}

export function filterEnergyChartData(data: unknown): SafeEnergyChartPoint[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (point): point is SafeEnergyChartPoint =>
      point !== null &&
      typeof point === "object" &&
      typeof point.label === "string" &&
      isFiniteMetric(point.energyKwh),
  );
}
