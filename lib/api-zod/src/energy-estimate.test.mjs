import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPLIANCE_POWER_RATINGS_W,
  CONFIRMED_APPLIANCE_IDS,
  estimatePowerFromConfirmedStates,
  matchesCommandAcknowledgement,
} from "./energy-estimate.ts";

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

  it("keeps the requested decimal ratings and recomputes after an appliance turns off", () => {
    const allOn = CONFIRMED_APPLIANCE_IDS.map((id) => ({ id, isOn: true }));
    assert.equal(estimatePowerFromConfirmedStates(allOn), 15.5);

    const oneLightOn = allOn.map((state) => ({ ...state, isOn: state.id === "light-living" }));
    const twoLightsOn = allOn.map((state) => ({ ...state, isOn: ["light-living", "light-bedroom"].includes(state.id) }));
    const fourLightsOn = allOn.map((state) => ({ ...state, isOn: state.id !== "fan-living" }));
    const fanOnly = allOn.map((state) => ({ ...state, isOn: state.id === "fan-living" }));
    assert.equal(estimatePowerFromConfirmedStates(oneLightOn), 2.5);
    assert.equal(estimatePowerFromConfirmedStates(twoLightsOn), 5);
    assert.equal(estimatePowerFromConfirmedStates(fourLightsOn), 10);
    assert.equal(estimatePowerFromConfirmedStates(fanOnly), 5.5);

    const oneLightOff = allOn.map((state) =>
      state.id === "light-study" ? { ...state, isOn: false } : state,
    );
    const fanOff = allOn.map((state) =>
      state.id === "fan-living" ? { ...state, isOn: false } : state,
    );
    assert.equal(estimatePowerFromConfirmedStates(oneLightOff), 13);
    assert.equal(estimatePowerFromConfirmedStates(fanOff), 10);
  });

  it("is idempotent for repeated states and rejects incomplete or duplicated states", () => {
    const oneLightOn = CONFIRMED_APPLIANCE_IDS.map((id) => ({
      id,
      isOn: id === "light-living",
    }));
    assert.equal(estimatePowerFromConfirmedStates(oneLightOn), 2.5);
    assert.equal(estimatePowerFromConfirmedStates(oneLightOn), 2.5);
    assert.equal(estimatePowerFromConfirmedStates(oneLightOn.slice(1)), null);
    assert.equal(
      estimatePowerFromConfirmedStates(oneLightOn.map((state, index) => index === 0 ? { ...state, isOn: "false" } : state)),
      null,
    );
    assert.equal(
      estimatePowerFromConfirmedStates([...oneLightOn.slice(1), oneLightOn[1]]),
      null,
    );
  });
});

describe("matchesCommandAcknowledgement", () => {
  const command = { relayNumber: 4, command: "ON" };

  it("accepts only an acknowledgement for the queued relay and state", () => {
    assert.equal(
      matchesCommandAcknowledgement(command, { relayNum: 4, state: "ON" }),
      true,
    );
    assert.equal(
      matchesCommandAcknowledgement(command, { relayNum: 3, state: "ON" }),
      false,
    );
    assert.equal(
      matchesCommandAcknowledgement(command, { relayNum: 4, state: "OFF" }),
      false,
    );
  });
});
