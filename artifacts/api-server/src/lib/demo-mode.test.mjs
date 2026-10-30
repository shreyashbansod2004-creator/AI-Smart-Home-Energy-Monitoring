import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DemoEnergyLedger,
  getConfirmedApplianceStates,
  getDemoVoltageV,
  isDemoModeEnabled,
} from "./demo-mode.ts";
import { CONFIRMED_APPLIANCE_IDS } from "@workspace/api-zod";

const allOff = CONFIRMED_APPLIANCE_IDS.map((id) => ({ id, isOn: false }));
const allOn = CONFIRMED_APPLIANCE_IDS.map((id) => ({ id, isOn: true }));

describe("demo mode safety", () => {
  it("is opt-in only for the exact true value", () => {
    for (const value of [undefined, "", "false", "TRUE", "1", "yes", "on"]) {
      assert.equal(isDemoModeEnabled(value), false);
    }
    assert.equal(isDemoModeEnabled("true"), true);
  });

  it("requires all five unique appliance states and boolean values", () => {
    assert.equal(getConfirmedApplianceStates(allOff)?.length, 5);
    assert.equal(getConfirmedApplianceStates(allOff.slice(1)), null);
    assert.equal(getConfirmedApplianceStates([...allOff.slice(1), allOff[1]]), null);
    assert.equal(getConfirmedApplianceStates(allOff.map((a, i) => i ? a : { ...a, isOn: "false" })), null);
  });

  it("simulates rated power, voltage and current from confirmed relay states", () => {
    const ledger = new DemoEnergyLedger();
    const reading = ledger.sample(allOn, 1_000_000);
    assert.equal(reading.powerW, 15.5);
    assert.ok(reading.voltageV >= 220 && reading.voltageV <= 240);
    assert.ok(Math.abs(reading.currentA - 15.5 / (reading.voltageV * 0.9)) < 1e-12);
    assert.equal(getDemoVoltageV(1_000_000), reading.voltageV);
    assert.notEqual(getDemoVoltageV(1_000_000), getDemoVoltageV(1_030_000));
    assert.equal(ledger.sample(allOff, 1_001_000)?.powerW, 0);
  });

  it("integrates previous power over observed intervals and ignores long gaps", () => {
    const ledger = new DemoEnergyLedger();
    ledger.sample(allOn, 1_000_000);
    ledger.sample(allOff, 1_003_600);
    assert.ok(Math.abs(ledger.getEnergyKwh() - (15.5 / 1000 / 1000)) < 1e-12);
    ledger.sample(allOn, 1_020_000);
    assert.ok(Math.abs(ledger.getEnergyKwh() - (15.5 / 1000 / 1000)) < 1e-12);
  });

  it("does not advance the energy ledger for invalid appliance snapshots", () => {
    const ledger = new DemoEnergyLedger();
    ledger.sample(allOn, 1_000_000);
    assert.equal(ledger.sample(allOn.slice(1), 1_003_000), null);
    assert.equal(ledger.getEnergyKwh(), 0);
    ledger.sample(allOff, 1_004_000);
    assert.ok(Math.abs(ledger.getEnergyKwh() - (15.5 * 4_000 / 3_600_000_000)) < 1e-12);
  });

  it("starts with zero power and energy when all appliances are off", () => {
    const ledger = new DemoEnergyLedger();
    const reading = ledger.sample(allOff, 1_000_000);
    assert.equal(reading.powerW, 0);
    assert.equal(reading.currentA, 0);
    assert.equal(reading.energyKwh, 0);
  });
});
