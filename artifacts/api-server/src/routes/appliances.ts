import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, appliancesTable } from "@workspace/db";
import {
  GetAppliancesResponse,
  GetAppliancesResponseItem,
  ToggleApplianceBody,
  ToggleApplianceParams,
  ToggleApplianceResponse,
  TurnAllOffResponse,
} from "@workspace/api-zod";

const router = Router();

// Derived usage data (not stored in DB — computed from powerW)
function deriveUsage(appliance: typeof appliancesTable.$inferSelect) {
  const hoursToday = appliance.isOn ? 3.5 + Math.random() * 2 : Math.random() * 1.5;
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
    runningHoursToday: parseFloat(hoursToday.toFixed(1)),
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
  const result = ToggleApplianceResponse.parse(deriveUsage(updated));
  res.json(result);
});

router.post("/appliances/turn-all-off", async (req, res): Promise<void> => {
  await db
    .update(appliancesTable)
    .set({ isOn: false, updatedAt: new Date() });
  const result = TurnAllOffResponse.parse({ success: true, message: "All appliances turned off" });
  res.json(result);
});

export default router;
