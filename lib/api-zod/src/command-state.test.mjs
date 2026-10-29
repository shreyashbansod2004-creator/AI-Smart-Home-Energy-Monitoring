import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPLIANCE_COMMAND_TTL_MS,
  getCurrentPendingCommands,
  getDeliverableApplianceCommands,
  getPendingApplianceCommandStatus,
  isFreshDuplicateCommand,
  shouldApplyAcknowledgement,
  toPendingApplianceCommand,
} from "./command-state.ts";
import { matchesCommandAcknowledgement } from "./energy-estimate.ts";

const now = Date.parse("2026-10-29T12:00:00.000Z");
const record = (overrides = {}) => ({
  id: 1,
  applianceId: "light-living",
  relayNumber: 1,
  command: "ON",
  acknowledged: false,
  createdAt: new Date(now),
  ...overrides,
});

describe("appliance command lifecycle", () => {
  it("reports queued versus timed-out status and stops delivering expired requests", () => {
    assert.equal(getPendingApplianceCommandStatus(new Date(now), now), "awaiting_ack");
    assert.equal(
      getPendingApplianceCommandStatus(new Date(now - APPLIANCE_COMMAND_TTL_MS), now),
      "timed_out",
    );

    const timedOut = getCurrentPendingCommands(
      [record({ createdAt: new Date(now - APPLIANCE_COMMAND_TTL_MS) })],
      now,
    ).get("light-living");
    assert.equal(timedOut?.status, "timed_out");
    assert.equal(toPendingApplianceCommand(timedOut).state, "ON");
    assert.deepEqual(
      getDeliverableApplianceCommands(
        [record({ createdAt: new Date(now - APPLIANCE_COMMAND_TTL_MS) })],
        now,
      ),
      [],
    );
  });

  it("delivers only the newest request for an appliance while retaining older receipts", () => {
    const commands = [
      record({ id: 11, command: "ON", createdAt: new Date(now - 1_000) }),
      record({ id: 12, command: "OFF", createdAt: new Date(now) }),
      record({ id: 13, applianceId: "light-bedroom", relayNumber: 2 }),
    ];

    const pending = getCurrentPendingCommands(commands, now);
    assert.equal(pending.get("light-living")?.id, 12);
    assert.equal(pending.get("light-living")?.command, "OFF");
    assert.deepEqual(
      getDeliverableApplianceCommands(commands, now).map(({ id }) => id),
      [12, 13],
    );
  });

  it("does not resurrect older requests after a newer command is acknowledged", () => {
    const commands = [
      record({ id: 20, command: "ON" }),
      record({ id: 21, command: "OFF", acknowledged: true }),
    ];
    assert.equal(getCurrentPendingCommands(commands, now).has("light-living"), false);
    assert.deepEqual(getDeliverableApplianceCommands(commands, now), []);
  });

  it("reuses a recent identical request but allows a fresh retry after timeout", () => {
    const active = record({ id: 25, createdAt: new Date(now - 1_000) });
    assert.equal(isFreshDuplicateCommand(active, "ON", now), true);
    assert.equal(isFreshDuplicateCommand(active, "OFF", now), false);
    assert.equal(
      isFreshDuplicateCommand(
        { ...active, createdAt: new Date(now - APPLIANCE_COMMAND_TTL_MS) },
        "ON",
        now,
      ),
      false,
    );
    assert.equal(isFreshDuplicateCommand({ ...active, acknowledged: true }, "ON", now), false);
  });

  it("accepts a matching late acknowledgement but never applies an older ack over a newer one", () => {
    const expiredCommand = record({
      id: 30,
      createdAt: new Date(now - APPLIANCE_COMMAND_TTL_MS - 1),
    });
    assert.equal(getPendingApplianceCommandStatus(expiredCommand.createdAt, now), "timed_out");
    assert.equal(
      matchesCommandAcknowledgement(expiredCommand, { relayNum: 1, state: "ON" }),
      true,
    );
    assert.equal(shouldApplyAcknowledgement(30, null), true);
    assert.equal(shouldApplyAcknowledgement(30, 31), false);
    assert.equal(shouldApplyAcknowledgement(31, 30), true);
  });
});
