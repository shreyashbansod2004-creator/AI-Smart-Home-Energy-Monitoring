import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import {
  GetSettingsResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";

const router = Router();

async function getOrCreateSettings() {
  const [existing] = await db.select().from(settingsTable).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(settingsTable)
    .values({
      userName: "Shreyas",
      homeDescription: "4 Room Smart Home",
      electricityProvider: "MSEDCL",
      tariffRatePerKwh: 8.5,
      monthlyBudgetInr: 1500,
      highPowerThresholdW: 750,
      notificationsEnabled: true,
      emailNotifications: true,
      smsNotifications: false,
      timezone: "Asia/Kolkata",
    })
    .returning();
  return created;
}

router.get("/settings", async (req, res): Promise<void> => {
  const s = await getOrCreateSettings();
  res.json(GetSettingsResponse.parse(s));
});

router.put("/settings", async (req, res): Promise<void> => {
  const body = UpdateSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const existing = await getOrCreateSettings();
  const [updated] = await db
    .update(settingsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .returning();
  res.json(UpdateSettingsResponse.parse(updated ?? existing));
});

export default router;
