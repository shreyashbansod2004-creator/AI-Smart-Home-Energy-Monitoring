export const APPLIANCE_COMMAND_TTL_MS = 30_000;

export type ApplianceCommandState = "ON" | "OFF";
export type ApplianceCommandLifecycleStatus = "awaiting_ack" | "timed_out";

export interface CommandLifecycleRecord {
  id: number;
  applianceId: string;
  relayNumber: number;
  command: string;
  acknowledged: boolean;
  createdAt: Date | string;
}

export interface CurrentPendingCommand extends CommandLifecycleRecord {
  command: ApplianceCommandState;
  status: ApplianceCommandLifecycleStatus;
}

export interface ApplianceCommandSummary {
  commandId: number;
  state: ApplianceCommandState;
  status: ApplianceCommandLifecycleStatus;
  createdAt: string;
}

function timestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

export function getPendingApplianceCommandStatus(
  createdAt: Date | string,
  now = Date.now(),
): ApplianceCommandLifecycleStatus {
  const createdAtMs = timestampMs(createdAt);
  return Number.isFinite(createdAtMs) && now - createdAtMs < APPLIANCE_COMMAND_TTL_MS
    ? "awaiting_ack"
    : "timed_out";
}

export function isFreshDuplicateCommand(
  command: CommandLifecycleRecord | null | undefined,
  requestedState: ApplianceCommandState,
  now = Date.now(),
): command is CommandLifecycleRecord {
  return Boolean(
    command &&
      !command.acknowledged &&
      command.command === requestedState &&
      getPendingApplianceCommandStatus(command.createdAt, now) === "awaiting_ack",
  );
}

/**
 * Keep command rows as acknowledgement receipts. A newer confirmed command
 * supersedes older unacknowledged rows; otherwise the newest request remains
 * visible even after its delivery window expires.
 */
export function getCurrentPendingCommands(
  commands: readonly CommandLifecycleRecord[],
  now = Date.now(),
): Map<string, CurrentPendingCommand> {
  const latestAcknowledgedId = new Map<string, number>();
  for (const command of commands) {
    if (!command.acknowledged) continue;
    latestAcknowledgedId.set(
      command.applianceId,
      Math.max(latestAcknowledgedId.get(command.applianceId) ?? 0, command.id),
    );
  }

  const latestUnacknowledged = new Map<string, CommandLifecycleRecord>();
  for (const command of commands) {
    if (
      command.acknowledged ||
      command.id <= (latestAcknowledgedId.get(command.applianceId) ?? 0)
    ) {
      continue;
    }
    const current = latestUnacknowledged.get(command.applianceId);
    if (!current || command.id > current.id) {
      latestUnacknowledged.set(command.applianceId, command);
    }
  }

  const pending = new Map<string, CurrentPendingCommand>();
  for (const [applianceId, command] of latestUnacknowledged) {
    if (
      command.relayNumber < 1 ||
      command.relayNumber > 5 ||
      (command.command !== "ON" && command.command !== "OFF")
    ) {
      continue;
    }
    pending.set(applianceId, {
      ...command,
      command: command.command,
      status: getPendingApplianceCommandStatus(command.createdAt, now),
    });
  }
  return pending;
}

export function getDeliverableApplianceCommands(
  commands: readonly CommandLifecycleRecord[],
  now = Date.now(),
): CurrentPendingCommand[] {
  return [...getCurrentPendingCommands(commands, now).values()]
    .filter((command) => command.status === "awaiting_ack")
    .sort((a, b) => a.id - b.id);
}

export function toPendingApplianceCommand(
  command: CurrentPendingCommand,
): ApplianceCommandSummary {
  return {
    commandId: command.id,
    state: command.command,
    status: command.status,
    createdAt: new Date(timestampMs(command.createdAt)).toISOString(),
  };
}

export function shouldApplyAcknowledgement(
  commandId: number,
  newerAcknowledgedCommandId: number | null,
): boolean {
  return newerAcknowledgedCommandId === null || newerAcknowledgedCommandId <= commandId;
}
