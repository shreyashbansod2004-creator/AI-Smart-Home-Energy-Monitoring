import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterEnergyChartData,
  formatCurrencyInr,
  formatEnergyKwh,
  safePercentage,
} from "./dashboard-metrics.ts";

describe("dashboard metric safety", () => {
  it("formats only finite numeric energy and bill values", () => {
    assert.equal(formatEnergyKwh(1.25, 2), "1.25 kWh");
    assert.equal(formatEnergyKwh(undefined, 2), "—");
    assert.equal(formatEnergyKwh(null, 2), "—");
    assert.equal(formatEnergyKwh("1.25", 2), "—");
    assert.equal(formatEnergyKwh(Number.NaN, 2), "—");
    assert.equal(formatEnergyKwh(Number.POSITIVE_INFINITY, 2), "—");
    assert.equal(formatCurrencyInr(1250), "₹1,250");
    assert.equal(formatCurrencyInr("1250"), "—");
    assert.equal(formatCurrencyInr(Number.NEGATIVE_INFINITY), "—");
  });

  it("uses finite fallback percentages", () => {
    assert.equal(safePercentage(-12.5), -12.5);
    assert.equal(safePercentage(undefined), 0);
    assert.equal(safePercentage("4"), 0);
    assert.equal(safePercentage(Number.NaN), 0);
  });

  it("filters malformed chart payloads without throwing", () => {
    assert.deepEqual(filterEnergyChartData([
      { label: "Mon", energyKwh: 1.2, extra: "kept" },
      { label: "Tue", energyKwh: null },
      { label: 3, energyKwh: 2 },
      null,
      "bad",
      { label: "Wed", energyKwh: Number.NaN },
      { label: "Thu", energyKwh: Number.POSITIVE_INFINITY },
    ]), [{ label: "Mon", energyKwh: 1.2, extra: "kept" }]);
    assert.deepEqual(filterEnergyChartData({ bad: true }), []);
    assert.deepEqual(filterEnergyChartData(null), []);
  });
});
