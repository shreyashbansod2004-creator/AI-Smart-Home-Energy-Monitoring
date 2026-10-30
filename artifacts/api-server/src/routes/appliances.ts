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
  getAppliancePowerRatingW,
} from "@workspace/api-zod";

const router = Router();

// ESP32 device key — commands are dispatched to this device
const ESP32_DEVICE_KEY = "esp32_001";
const MIN_RELAY_NUMBER = 1;
const MAX_RELAY_NUMBER = 5;

// Derived usage data (not stored in DB — computed from powerW)
function deriveUsage(appliance: typeof appliancesTable.$inferSelect) {
  const hoursToday = 0; // Real running hours require tracking from actual readings
  const todayUsageKwh = parseFloat(((appliance.powerW / 1000) * hoursToday).toFixed(2));
  const monthlyCostInr = parseFloat((todayUsageKwh * 30 * 8.5).toFixed(0));
  const ratedPowerW = getAppliancePowerRatingW(appliance.id, appliance.powerW, appliance.name);
  return {
    id: appliance.id,
    name: appliance.name,
    location: appliance.location,
    isOn: appliance.isOn,
    powerW: appliance.isOn ? ratedPowerW : 0,
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

  const [existing] = await db
    .select({ relayNumber: appliancesTable.relayNumber })
    .from(appliancesTable)
    .where(eq(appliancesTable.id, params.data.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Appliance not found" });
    return;
  }

  if (
    existing.relayNumber !== null &&
    (existing.relayNumber < MIN_RELAY_NUMBER || existing.relayNumber > MAX_RELAY_NUMBER)
  ) {
    res.status(400).json({ error: "Appliance has an invalid relay assignment" });
    return;
  }

  if (existing.relayNumber === null || existing.relayNumber === undefined) {
    const [updated] = await db
      .update(appliancesTable)
      .set({ isOn: body.data.isOn, updatedAt: new Date() })
      .where(eq(appliancesTable.id, params.data.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Appliance not found" });
      return;
    }

    res.json(ToggleApplianceResponse.parse(deriveUsage(updated)));
    return;
  }

  try {
    // Keep the database state as the last acknowledged relay state. Pending
    // commands are replaced so delayed/retried requests cannot be counted twice.
    await db.delete(commandsTable).where(
      and(
        eq(commandsTable.deviceKey, ESP32_DEVICE_KEY),
        eq(commandsTable.applianceId, params.data.id),
        eq(commandsTable.acknowledged, false),
      ),
    );
    await db.insert(commandsTable).values({
      deviceKey:   ESP32_DEVICE_KEY,
      applianceId: params.data.id,
      relayNumber: existing.relayNumber,
      command:     body.data.isOn ? "ON" : "OFF",
      acknowledged: false,
      createdAt:   new Date(),
    });
  } catch (err) {
    console.error("Command dispatch error:", err);
    res.status(503).json({ error: "Failed to queue appliance command" });
    return;
  }

  // Return the current confirmed state. The row changes only after /commandAck.
  const [confirmed] = await db
    .select()
    .from(appliancesTable)
    .where(eq(appliancesTable.id, params.data.id))
    .limit(1);
  if (!confirmed) {
    res.status(404).json({ error: "Appliance not found" });
    return;
  }

  const result = ToggleApplianceResponse.parse(deriveUsage(confirmed));
  res.json(result);
});

router.post("/appliances/turn-all-off", async (req, res): Promise<void> => {
  // Fetch all appliances to dispatch individual commands
  const rows = await db.select().from(appliancesTable);

  // Dispatch OFF commands for every appliance that has a relay
  const commandValues = rows
    .filter(
      (a) =>
        a.relayNumber !== null &&
        a.relayNumber >= MIN_RELAY_NUMBER &&
        a.relayNumber <= MAX_RELAY_NUMBER,
    )
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
      res.status(503).json({ error: "Failed to queue appliance commands" });
      return;
    }
  }

  const result = TurnAllOffResponse.parse({
    success: true,
    message: "OFF commands queued; appliance states update after device acknowledgement",
  });
  res.json(result);
});

export default router;
