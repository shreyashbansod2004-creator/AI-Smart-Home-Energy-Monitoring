import { Router } from "express";
import { z } from "zod";
import { eq, and, lt, gt, or, gte, lte } from "drizzle-orm";
import { db, commandsTable, appliancesTable } from "@workspace/db";
import { matchesCommandAcknowledgement } from "@workspace/api-zod";

const router = Router();
const MIN_RELAY_NUMBER = 1;
const MAX_RELAY_NUMBER = 5;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/commands/:deviceKey
// ESP32 polls this every second to receive pending relay commands.
// Returns the oldest unacknowledged command, or 204 if nothing pending.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/commands/:deviceKey", async (req, res): Promise<void> => {
  const { deviceKey } = req.params;
  try {
    // Prune commands older than 30 s that were never acknowledged.
    // These are stale (ESP32 was offline or missed the window); fresh toggles
    // take priority once the expired entries are cleared.
    const ttlCutoff = new Date(Date.now() - 30_000);
    await db
      .delete(commandsTable)
      .where(
        and(
          eq(commandsTable.deviceKey, deviceKey),
          eq(commandsTable.acknowledged, false),
          lt(commandsTable.createdAt, ttlCutoff),
        ),
      );

    // Invalid relay assignments are never executable by the ESP32.
    await db
      .delete(commandsTable)
      .where(
        and(
          eq(commandsTable.deviceKey, deviceKey),
          eq(commandsTable.acknowledged, false),
          or(
            lt(commandsTable.relayNumber, MIN_RELAY_NUMBER),
            gt(commandsTable.relayNumber, MAX_RELAY_NUMBER),
          ),
        ),
      );

    const [cmd] = await db
      .select()
      .from(commandsTable)
      .where(
        and(
          eq(commandsTable.deviceKey, deviceKey),
          eq(commandsTable.acknowledged, false),
          gte(commandsTable.relayNumber, MIN_RELAY_NUMBER),
          lte(commandsTable.relayNumber, MAX_RELAY_NUMBER),
        ),
      )
      .orderBy(commandsTable.createdAt)
      .limit(1);

    if (!cmd) {
      res.status(204).send(); // No pending command
      return;
    }

    res.json({
      id:          cmd.id,
      relayNum:    cmd.relayNumber,
      command:     cmd.command,
      applianceId: cmd.applianceId,
    });
  } catch (err) {
    console.error("GET /commands error:", err);
    res.status(500).json({ error: "Failed to fetch commands" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/commandAck
// ESP32 calls this after executing a command.
// Body: { commandId: number, relayNum: number, state: "ON" | "OFF" }
// ─────────────────────────────────────────────────────────────────────────────
const AckBody = z.object({
  commandId: z.number().int(),
  relayNum:  z.number().int(),
  state:     z.enum(["ON", "OFF"]),
});

router.post("/commandAck", async (req, res): Promise<void> => {
  const parsed = AckBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ack payload" });
    return;
  }

  const { commandId, relayNum, state } = parsed.data;
  try {
    const result = await db.transaction(async (tx) => {
      const [command] = await tx
        .select()
        .from(commandsTable)
        .where(eq(commandsTable.id, commandId))
        .limit(1);

      if (!command) return "missing" as const;
      if (!matchesCommandAcknowledgement(command, { relayNum, state })) {
        return "mismatch" as const;
      }
      // Duplicate acknowledgements are harmless and must not replay an older
      // state over a newer command.
      if (command.acknowledged) return "already-acknowledged" as const;

      const [updated] = await tx
        .update(commandsTable)
        .set({ acknowledged: true, executedAt: new Date() })
        .where(
          and(
            eq(commandsTable.id, commandId),
            eq(commandsTable.acknowledged, false),
          ),
        )
        .returning();

      if (!updated) return "missing" as const;

      await tx
        .update(appliancesTable)
        .set({ isOn: state === "ON", updatedAt: new Date() })
        .where(eq(appliancesTable.id, command.applianceId));

      return "acknowledged" as const;
    });

    if (result === "missing") {
      res.status(404).json({ error: "Command not found" });
      return;
    }
    if (result === "mismatch") {
      res.status(409).json({ error: "Acknowledgement does not match the pending command" });
      return;
    }

    res.json({ success: true, commandId });
  } catch (err) {
    console.error("POST /commandAck error:", err);
    res.status(500).json({ error: "Failed to acknowledge command" });
  }
});

export default router;
