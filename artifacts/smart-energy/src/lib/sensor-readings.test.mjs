import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFreshSensorTimestamp,
  isValidCurrentA,
  isValidVoltageV,
} from "./sensor-readings.ts";

describe("live sensor validation", () => {
  const now = Date.parse("2026-10-29T12:00:00.000Z");

  it("rejects missing, stale, invalid, and future timestamps", () => {
    assert.equal(isFreshSensorTimestamp(undefined, now), false);
    assert.equal(isFreshSensorTimestamp("not-a-date", now), false);
    assert.equal(isFreshSensorTimestamp("2026-10-29T11:59:00.000Z", now), false);
    assert.equal(isFreshSensorTimestamp("2026-10-29T12:00:01.000Z", now), false);
    assert.equal(isFreshSensorTimestamp("2026-10-29T11:59:55.000Z", now), true);
  });

  it("rejects invalid sensor values without treating them as zero readings", () => {
    assert.equal(isValidVoltageV(0), false);
    assert.equal(isValidVoltageV(Number.NaN), false);
    assert.equal(isValidVoltageV(230), true);
    assert.equal(isValidVoltageV(301), false);

    assert.equal(isValidCurrentA(-1), false);
    assert.equal(isValidCurrentA(Number.NaN), false);
    assert.equal(isValidCurrentA(0), true);
    assert.equal(isValidCurrentA(1.25), true);
    assert.equal(isValidCurrentA(101), false);
  });
});
