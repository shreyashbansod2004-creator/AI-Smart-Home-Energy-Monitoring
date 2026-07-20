import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, commandsTable } from "@workspace/db";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/commands/:deviceKey
// ESP32 polls this every second to receive pending relay commands.
// Returns the oldest unacknowledged command, or 204 if nothing pending.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/commands/:deviceKey", async (req, res): Promise<void> => {
  const { deviceKey } = req.params;
  try {
    const [cmd] = await db
      .select()
      .from(commandsTable)
      .where(
        and(
          eq(commandsTable.deviceKey, deviceKey),
          eq(commandsTable.acknowledged, false),
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

  const { commandId } = parsed.data;
  try {
    const [updated] = await db
      .update(commandsTable)
      .set({ acknowledged: true, executedAt: new Date() })
      .where(eq(commandsTable.id, commandId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Command not found" });
      return;
    }

    res.json({ success: true, commandId: updated.id });
  } catch (err) {
    console.error("POST /commandAck error:", err);
    res.status(500).json({ error: "Failed to acknowledge command" });
  }
});

export default router;
