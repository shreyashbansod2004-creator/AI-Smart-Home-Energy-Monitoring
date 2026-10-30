import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPLIANCE_POWER_RATINGS_W,
  calculateEnergyBillInr,
  CONFIRMED_APPLIANCE_IDS,
  estimatePowerFromConfirmedStates,
  matchesCommandAcknowledgement,
} from "./energy-estimate.ts";

describe("appliance power ratings", () => {
  it("assigns each requested appliance its exact rated wattage", () => {
    assert.deepEqual(APPLIANCE_POWER_RATINGS_W, {
      "light-living": 2.5,
      "light-bedroom": 2.5,
      "light-kitchen": 2.5,
      "light-study": 2.5,
      "fan-living": 5.5,
    });
  });
});

describe("estimatePowerFromConfirmedStates", () => {
  it("matches the rated-power formula for every appliance combination", () => {
    for (let mask = 0; mask < 2 ** CONFIRMED_APPLIANCE_IDS.length; mask += 1) {
      const states = CONFIRMED_APPLIANCE_IDS.map((id, index) => ({
        id,
        isOn: Boolean(mask & (1 << index)),
      }));
      const expected = states.reduce(
        (total, appliance) =>
          total +
          (appliance.isOn ? APPLIANCE_POWER_RATINGS_W[appliance.id] : 0),
        0,
      );
      assert.equal(estimatePowerFromConfirmedStates(states), expected);
    }
  });

  it("covers the requested ON/OFF totals", () => {
    const allOn = CONFIRMED_APPLIANCE_IDS.map((id) => ({ id, isOn: true }));
    const statesFor = (enabled) =>
      CONFIRMED_APPLIANCE_IDS.map((id) => ({ id, isOn: enabled.includes(id) }));
    assert.equal(estimatePowerFromConfirmedStates(statesFor([])), 0);
    assert.equal(estimatePowerFromConfirmedStates(statesFor(["light-living"])), 2.5);
    assert.equal(estimatePowerFromConfirmedStates(statesFor(["light-living", "light-bedroom"])), 5);
    assert.equal(estimatePowerFromConfirmedStates(statesFor(["light-living", "light-bedroom", "light-kitchen", "light-study"])), 10);
    assert.equal(estimatePowerFromConfirmedStates(statesFor(["fan-living"])), 5.5);
    assert.equal(estimatePowerFromConfirmedStates(statesFor(["fan-living", "light-living", "light-bedroom", "light-kitchen"])), 13);
    assert.equal(estimatePowerFromConfirmedStates(allOn), 15.5);
  });

  it("is idempotent and rejects incomplete, duplicated or non-boolean states", () => {
    const states = CONFIRMED_APPLIANCE_IDS.map((id) => ({ id, isOn: id === "light-living" }));
    assert.equal(estimatePowerFromConfirmedStates(states), 2.5);
    assert.equal(estimatePowerFromConfirmedStates(states), 2.5);
    assert.equal(estimatePowerFromConfirmedStates(states.slice(1)), null);
    assert.equal(estimatePowerFromConfirmedStates(states.map((state, index) => index === 0 ? { ...state, isOn: "false" } : state)), null);
    assert.equal(estimatePowerFromConfirmedStates([...states.slice(1), states[1]]), null);
  });
});

describe("matchesCommandAcknowledgement", () => {
  const command = { relayNumber: 4, command: "ON" };
  it("accepts only an acknowledgement for the queued relay and state", () => {
    assert.equal(matchesCommandAcknowledgement(command, { relayNum: 4, state: "ON" }), true);
    assert.equal(matchesCommandAcknowledgement(command, { relayNum: 3, state: "ON" }), false);
    assert.equal(matchesCommandAcknowledgement(command, { relayNum: 4, state: "OFF" }), false);
  });
});

describe("calculateEnergyBillInr", () => {
  it("uses accumulated kWh and the configured rupees-per-kWh tariff", () => {
    assert.equal(calculateEnergyBillInr(2, 8.5), 17);
    assert.equal(calculateEnergyBillInr(0, 8.5), 0);
    assert.equal(calculateEnergyBillInr(1.5, 10), 15);
  });
  it("rejects invalid energy and tariff values", () => {
    assert.equal(calculateEnergyBillInr(Number.NaN, 8.5), null);
    assert.equal(calculateEnergyBillInr(1, Number.POSITIVE_INFINITY), null);
    assert.equal(calculateEnergyBillInr(-1, 8.5), null);
    assert.equal(calculateEnergyBillInr(1, -1), null);
  });
});
