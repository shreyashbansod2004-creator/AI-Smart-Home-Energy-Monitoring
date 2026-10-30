import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPLIANCE_POWER_RATINGS_W,
  CONFIRMED_APPLIANCE_IDS,
  estimatePowerFromConfirmedStates,
} from "./energy-estimate.ts";
import {
  DEMO_APPLIANCES,
  DEMO_NOMINAL_VOLTAGE_V,
  DEMO_POWER_FACTOR,
  advanceEnergyLedger,
  createDemoApplianceStates,
  createEnergyLedger,
  demoStatesToList,
  setDemoApplianceState,
  turnAllDemoAppliancesOff,
  estimateBillInr,
  formatSimulatedCurrentA,
  parseDemoModeFlag,
  simulateElectricalReadings,
  whToKwh,
} from "./demo-simulation.ts";

const LEDS = ["light-living", "light-bedroom", "light-kitchen", "light-study"];
const FAN = "fan-living";

/** Build the full appliance-state set, as the existing state source returns it. */
function states(onIds) {
  return CONFIRMED_APPLIANCE_IDS.map((id) => ({ id, isOn: onIds.includes(id) }));
}

function readingsFor(onIds) {
  return simulateElectricalReadings(estimatePowerFromConfirmedStates(states(onIds)));
}

describe("appliance ratings (single central config)", () => {
  it("has four 2.5 W LEDs and a 5.5 W fan totalling 15.5 W", () => {
    for (const id of LEDS) assert.equal(APPLIANCE_POWER_RATINGS_W[id], 2.5);
    assert.equal(APPLIANCE_POWER_RATINGS_W[FAN], 5.5);
    assert.equal(
      Object.values(APPLIANCE_POWER_RATINGS_W).reduce((a, b) => a + b, 0),
      15.5,
    );
  });
});

describe("simulated electrical readings", () => {
  const table = [
    ["All OFF", [], 0, "0.000"],
    ["One LED", LEDS.slice(0, 1), 2.5, "0.012"],
    ["Two LEDs", LEDS.slice(0, 2), 5, "0.024"],
    ["Three LEDs", LEDS.slice(0, 3), 7.5, "0.036"],
    ["Four LEDs", LEDS, 10, "0.048"],
    ["Mini Fan only", [FAN], 5.5, "0.027"],
    ["One LED + Mini Fan", [LEDS[0], FAN], 8, "0.039"],
    ["Two LEDs + Mini Fan", [...LEDS.slice(0, 2), FAN], 10.5, "0.051"],
    ["Three LEDs + Mini Fan", [...LEDS.slice(0, 3), FAN], 13, "0.063"],
    ["All five appliances", [...LEDS, FAN], 15.5, "0.075"],
  ];

  for (const [name, on, watts, amps] of table) {
    it(`${name} -> 230 V, PF 0.9, ${watts} W, ${amps} A`, () => {
      const r = readingsFor(on);
      assert.equal(r.voltageV, 230);
      assert.equal(r.powerFactor, 0.9);
      assert.equal(r.currentPowerW, watts);
      assert.equal(formatSimulatedCurrentA(r.currentA), amps);
    });
  }

  it("uses 230 V * 0.9 (not PF 1.0) and keeps full precision internally", () => {
    assert.equal(DEMO_NOMINAL_VOLTAGE_V, 230);
    assert.equal(DEMO_POWER_FACTOR, 0.9);
    const r = readingsFor([...LEDS, FAN]);
    assert.equal(r.currentA, 15.5 / (230 * 0.9));
    assert.notEqual(r.currentA, 15.5 / 230);
    assert.notEqual(r.currentA, Number(formatSimulatedCurrentA(r.currentA)));
  });

  it("keeps 230 V and 0.9 even when everything is OFF", () => {
    const r = readingsFor([]);
    assert.deepEqual(r, {
      voltageV: 230,
      powerFactor: 0.9,
      currentPowerW: 0,
      currentA: 0,
    });
  });

  it("returns null (unavailable) for an incomplete or duplicated state set", () => {
    assert.equal(simulateElectricalReadings(estimatePowerFromConfirmedStates(states([]).slice(1))), null);
    assert.equal(simulateElectricalReadings(null), null);
    assert.equal(simulateElectricalReadings(Number.NaN), null);
    assert.equal(simulateElectricalReadings(-1), null);
  });

  it("follows the required ON/OFF example sequence, recalculated from states each time", () => {
    const on = new Set();
    const steps = [
      ["on", "light-bedroom", 2.5, "0.012"],
      ["on", "light-living", 5, "0.024"],
      ["on", "light-kitchen", 7.5, "0.036"],
      ["on", "light-study", 10, "0.048"],
      ["on", FAN, 15.5, "0.075"],
      ["off", "light-bedroom", 13, "0.063"],
      ["off", "light-living", 10.5, "0.051"],
      ["off", "light-kitchen", 8, "0.039"],
      ["off", "light-study", 5.5, "0.027"],
      ["off", FAN, 0, "0.000"],
    ];
    for (const [action, id, watts, amps] of steps) {
      if (action === "on") on.add(id);
      else on.delete(id);
      const r = readingsFor([...on]);
      assert.equal(r.currentPowerW, watts, `${action} ${id}`);
      assert.equal(formatSimulatedCurrentA(r.currentA), amps, `${action} ${id}`);
    }
  });

  it("turning one appliance OFF subtracts only its own rating", () => {
    const all = readingsFor([...LEDS, FAN]).currentPowerW;
    assert.equal(all - readingsFor([...LEDS]).currentPowerW, 5.5);
    assert.equal(all - readingsFor([...LEDS.slice(1), FAN]).currentPowerW, 2.5);
  });

  it("is idempotent: recalculating the same states never accumulates", () => {
    const a = readingsFor([LEDS[0], FAN]);
    for (let i = 0; i < 100; i += 1) readingsFor([LEDS[0], FAN]);
    assert.deepEqual(readingsFor([LEDS[0], FAN]), a);
  });
});

describe("faulty ESP32 values cannot reach the simulation", () => {
  it("the simulation takes no sensor input: output depends only on the power total", () => {
    // The only parameter is the confirmed-state power total. Zero, NaN, stale or
    // absurd sensor voltage/current have nowhere to enter.
    assert.equal(simulateElectricalReadings.length, 1);
    const r = simulateElectricalReadings(8);
    assert.equal(r.voltageV, 230);
    assert.equal(r.powerFactor, 0.9);
  });
});

describe("simulated energy ledger", () => {
  const DAY = "2026-10-30";
  const MONTH = "2026-10";
  const T0 = Date.UTC(2026, 9, 30, 4, 0, 0);

  /** Tick once per second, like the server sampler. */
  function run(ledger, seconds, powerW, startMs) {
    let l = ledger;
    for (let s = 1; s <= seconds; s += 1) {
      l = advanceEnergyLedger(l, startMs + s * 1000, powerW, DAY, MONTH);
    }
    return l;
  }

  it("10 W for one hour is 10 Wh = 0.01 kWh", () => {
    const l = run(createEnergyLedger(T0, 10, DAY, MONTH), 3600, 10, T0);
    assert.ok(Math.abs(l.dayWh - 10) < 1e-9);
    assert.ok(Math.abs(whToKwh(l.dayWh) - 0.01) < 1e-12);
    assert.ok(Math.abs(l.monthWh - 10) < 1e-9);
  });

  it("charges the elapsed interval at the PREVIOUS power, then switches", () => {
    // 10 W for 1800 s, then the load changes to 15.5 W for another 1800 s.
    let l = run(createEnergyLedger(T0, 10, DAY, MONTH), 1799, 10, T0);
    l = advanceEnergyLedger(l, T0 + 1800 * 1000, 15.5, DAY, MONTH); // change observed here
    assert.equal(l.lastPowerW, 15.5);
    l = run(l, 1800, 15.5, T0 + 1800 * 1000);
    const expectedWh = 10 * 0.5 + 15.5 * 0.5;
    assert.ok(Math.abs(l.dayWh - expectedWh) < 1e-9);
  });

  it("adds nothing while everything is OFF", () => {
    const l = run(createEnergyLedger(T0, 0, DAY, MONTH), 600, 0, T0);
    assert.equal(l.dayWh, 0);
    assert.equal(l.monthWh, 0);
  });

  it("does not double-count repeated calls at the same instant (renders/polls/refetches)", () => {
    let l = createEnergyLedger(T0, 10, DAY, MONTH);
    l = advanceEnergyLedger(l, T0 + 1000, 10, DAY, MONTH);
    const once = l.dayWh;
    for (let i = 0; i < 50; i += 1) {
      l = advanceEnergyLedger(l, T0 + 1000, 10, DAY, MONTH);
    }
    assert.equal(l.dayWh, once);
  });

  it("ignores stale (older) timestamps and does not mutate its input", () => {
    const start = createEnergyLedger(T0, 10, DAY, MONTH);
    const frozen = Object.freeze({ ...start });
    const advanced = advanceEnergyLedger(frozen, T0 + 2000, 10, DAY, MONTH);
    const stale = advanceEnergyLedger(advanced, T0 + 1000, 99, DAY, MONTH);
    assert.deepEqual(stale, advanced);
    assert.equal(frozen.dayWh, 0);
  });

  it("does not credit an unobserved gap (suspended or restarted server)", () => {
    let l = createEnergyLedger(T0, 15.5, DAY, MONTH);
    l = advanceEnergyLedger(l, T0 + 60 * 60 * 1000, 15.5, DAY, MONTH); // 1 h gap
    assert.equal(l.dayWh, 0);
    assert.equal(l.lastTickMs, T0 + 60 * 60 * 1000);
  });

  it("starts a new day/month bucket on rollover", () => {
    let l = run(createEnergyLedger(T0, 10, DAY, MONTH), 10, 10, T0);
    assert.ok(l.dayWh > 0);
    l = advanceEnergyLedger(l, T0 + 11 * 1000, 10, "2026-10-31", MONTH);
    assert.equal(l.dayWh, 0);
    assert.ok(l.monthWh > 0);
    l = advanceEnergyLedger(l, T0 + 12 * 1000, 10, "2026-11-01", "2026-11");
    assert.equal(l.monthWh, 0);
  });
});

describe("estimated bill", () => {
  it("is simulated kWh multiplied by the existing tariff (no invented rate)", () => {
    assert.equal(estimateBillInr(0.01, 8.5), 0.01 * 8.5);
    assert.equal(estimateBillInr(2, 8.5), 17);
    assert.equal(estimateBillInr(0, 8.5), 0);
    // Whatever the settings tariff is, the function just applies it.
    assert.equal(estimateBillInr(2, 7), 14);
  });
});

describe("DEMO_MODE flag (opt-in)", () => {
  it("is OFF unless explicitly enabled, so real relay control is the default", () => {
    assert.equal(parseDemoModeFlag(undefined), false);
    assert.equal(parseDemoModeFlag(null), false);
    assert.equal(parseDemoModeFlag(""), false);
    assert.equal(parseDemoModeFlag("false"), false);
    assert.equal(parseDemoModeFlag("0"), false);
    assert.equal(parseDemoModeFlag("maybe"), false);
    for (const v of ["true", "TRUE", "1", "on", "yes", " true "]) {
      assert.equal(parseDemoModeFlag(v), true, v);
    }
  });
});

describe("in-memory demo appliances", () => {
  it("uses exactly the central rating ids, in order, with unchanged display names", () => {
    assert.deepEqual(
      DEMO_APPLIANCES.map((a) => a.id).sort(),
      [...CONFIRMED_APPLIANCE_IDS].sort(),
    );
    assert.deepEqual(DEMO_APPLIANCES.map((a) => a.name), [
      "Living Room Light",
      "Bedroom Light",
      "Kitchen Light",
      "Sitting Area/Study Room Light",
      "Mini Fan",
    ]);
    assert.equal(new Set(DEMO_APPLIANCES.map((a) => a.id)).size, 5);
  });

  it("starts all OFF and always yields a complete set the power estimate accepts", () => {
    const list = demoStatesToList(createDemoApplianceStates());
    assert.equal(list.length, 5);
    assert.ok(list.every((a) => a.isOn === false));
    assert.equal(estimatePowerFromConfirmedStates(list), 0);
  });

  it("toggle returns a new map, leaves the old one untouched, and is idempotent", () => {
    const off = createDemoApplianceStates();
    const on1 = setDemoApplianceState(off, "light-bedroom", true);
    const on2 = setDemoApplianceState(on1, "light-bedroom", true);
    assert.equal(off["light-bedroom"], false);
    assert.equal(on1["light-bedroom"], true);
    assert.deepEqual(on1, on2);
    assert.equal(estimatePowerFromConfirmedStates(demoStatesToList(on2)), 2.5);
  });

  it("rejects unknown ids (including prototype keys) without changing state", () => {
    const s0 = createDemoApplianceStates();
    for (const bad of ["nope", "", "__proto__", "constructor", "toString"]) {
      assert.equal(setDemoApplianceState(s0, bad, true), null, bad);
    }
    assert.equal(Object.keys(s0).length, 5);
  });

  it("follows the example sequence and turn-all-off returns to 0 W / 0.000 A", () => {
    let s = createDemoApplianceStates();
    const power = () => estimatePowerFromConfirmedStates(demoStatesToList(s));
    for (const [id, w] of [["light-bedroom", 2.5], ["light-living", 5], ["light-kitchen", 7.5], ["light-study", 10], ["fan-living", 15.5]]) {
      s = setDemoApplianceState(s, id, true);
      assert.equal(power(), w, id);
    }
    s = setDemoApplianceState(s, "light-bedroom", false);
    assert.equal(power(), 13);
    s = turnAllDemoAppliancesOff(s);
    assert.equal(power(), 0);
    assert.equal(formatSimulatedCurrentA(simulateElectricalReadings(power()).currentA), "0.000");
    assert.equal(Object.keys(s).length, 5);
  });
});
