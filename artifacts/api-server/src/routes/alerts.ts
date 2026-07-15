import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, alertsTable } from "@workspace/db";
import {
  GetAlertsResponse,
  DismissAlertParams,
  DismissAlertResponse,
} from "@workspace/api-zod";

const router = Router();

router.get("/alerts", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(alertsTable)
    .orderBy(alertsTable.timestamp);

  const alerts = rows.map((a) => ({
    ...a,
    timestamp: a.timestamp.toISOString(),
    applianceName: a.applianceName ?? null,
  }));
  res.json(GetAlertsResponse.parse(alerts));
});

router.patch("/alerts/:id/dismiss", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DismissAlertParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: "Invalid alert id" });
    return;
  }
  const [updated] = await db
    .update(alertsTable)
    .set({ isDismissed: true })
    .where(eq(alertsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  res.json(DismissAlertResponse.parse({
    ...updated,
    timestamp: updated.timestamp.toISOString(),
    applianceName: updated.applianceName ?? null,
  }));
});

export default router;
