import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, appliancesTable, commandsTable } from "@workspace/db";
import {
  GetAppliancesResponse,
  GetAppliancesResponseItem,
  ToggleApplianceBody,
  ToggleApplianceParams,
  ToggleApplianceResponse,
  TurnAllOffResponse,
} from "@workspace/api-zod";

const router = Router();

// ESP32 device key — commands are dispatched to this device
const ESP32_DEVICE_KEY = "esp32_001";

// Derived usage data (not stored in DB — computed from powerW)
function deriveUsage(appliance: typeof appliancesTable.$inferSelect) {
  const hoursToday = 0; // Real running hours require tracking from actual readings
  const todayUsageKwh = parseFloat(((appliance.powerW / 1000) * hoursToday).toFixed(2));
  const monthlyCostInr = parseFloat((todayUsageKwh * 30 * 8.5).toFixed(0));
  return {
    id: appliance.id,
    name: appliance.name,
    location: appliance.location,
    isOn: appliance.isOn,
    powerW: appliance.isOn ? appliance.powerW : 0,
    todayUsageKwh,
    monthlyCostInr,
    iconType: appliance.iconType,
    runningHoursToday: hoursToday,
  };
}

router.get("/appliances", async (req, res): Promise<void> => {
  const rows = await db.select().from(appliancesTable);
  const result = GetAppliancesResponse.parse(rows.map(deriveUsage));
  res.json(result);
});

router.patch("/appliances/:id/toggle", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ToggleApplianceParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: "Invalid appliance id" });
    return;
  }
  const body = ToggleApplianceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [updated] = await db
    .update(appliancesTable)
    .set({ isOn: body.data.isOn, updatedAt: new Date() })
    .where(eq(appliancesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Appliance not found" });
    return;
  }

  // Dispatch a relay command to the ESP32 if this appliance has a relay assigned
  if (updated.relayNumber !== null && updated.relayNumber !== undefined) {
    try {
      // "Latest-wins" queue: cancel any pending commands for this appliance
      // before inserting the new one. Prevents stale backlog from blocking
      // newer intents when the ESP32 is offline or slow to acknowledge.
      await db.delete(commandsTable).where(
        and(
          eq(commandsTable.deviceKey, ESP32_DEVICE_KEY),
          eq(commandsTable.applianceId, updated.id),
          eq(commandsTable.acknowledged, false),
        ),
      );
      await db.insert(commandsTable).values({
        deviceKey:   ESP32_DEVICE_KEY,
        applianceId: updated.id,
        relayNumber: updated.relayNumber,
        command:     body.data.isOn ? "ON" : "OFF",
        acknowledged: false,
        createdAt:   new Date(),
      });
    } catch (err) {
      // Non-fatal: command dispatch failure shouldn't break the UI response
      console.error("Command dispatch error:", err);
    }
  }

  const result = ToggleApplianceResponse.parse(deriveUsage(updated));
  res.json(result);
});

router.post("/appliances/turn-all-off", async (req, res): Promise<void> => {
  // Fetch all appliances to dispatch individual commands
  const rows = await db.select().from(appliancesTable);

  await db
    .update(appliancesTable)
    .set({ isOn: false, updatedAt: new Date() });

  // Dispatch OFF commands for every appliance that has a relay
  const commandValues = rows
    .filter((a) => a.relayNumber !== null)
    .map((a) => ({
      deviceKey:    ESP32_DEVICE_KEY,
      applianceId:  a.id,
      relayNumber:  a.relayNumber as number,
      command:      "OFF" as const,
      acknowledged: false,
      createdAt:    new Date(),
    }));

  if (commandValues.length > 0) {
    try {
      // Cancel all pending commands before issuing a bulk OFF sweep
      await db.delete(commandsTable).where(
        and(
          eq(commandsTable.deviceKey, ESP32_DEVICE_KEY),
          eq(commandsTable.acknowledged, false),
        ),
      );
      await db.insert(commandsTable).values(commandValues);
    } catch (err) {
      console.error("Bulk command dispatch error:", err);
    }
  }

  const result = TurnAllOffResponse.parse({ success: true, message: "All appliances turned off" });
  res.json(result);
});

export default router;
