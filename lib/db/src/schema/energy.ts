import {
  pgTable,
  text,
  real,
  boolean,
  timestamp,
  serial,
  integer,
  doublePrecision,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── App tables (existing) ───────────────────────────────────────────────────

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  userName: text("user_name").notNull().default("Shreyas"),
  homeDescription: text("home_description").notNull().default("4 Room Smart Home"),
  electricityProvider: text("electricity_provider").notNull().default("MSEDCL"),
  tariffRatePerKwh: real("tariff_rate_per_kwh").notNull().default(8.5),
  monthlyBudgetInr: real("monthly_budget_inr").notNull().default(1500),
  highPowerThresholdW: real("high_power_threshold_w").notNull().default(750),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  smsNotifications: boolean("sms_notifications").notNull().default(false),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;

export const appliancesTable = pgTable("appliances", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  isOn: boolean("is_on").notNull().default(false),
  powerW: real("power_w").notNull(),
  iconType: text("icon_type").notNull().default("plug"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertApplianceSchema = createInsertSchema(appliancesTable).omit({ updatedAt: true });
export type InsertAppliance = z.infer<typeof insertApplianceSchema>;
export type Appliance = typeof appliancesTable.$inferSelect;

export const alertsTable = pgTable("alerts", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  severity: text("severity").notNull().default("medium"),
  isDismissed: boolean("is_dismissed").notNull().default(false),
  applianceName: text("appliance_name"),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ timestamp: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;

// ─── IoT tables (from uploaded schema) ──────────────────────────────────────

/** One row per physical meter / ESP32 unit being tracked */
export const devicesTable = pgTable("devices", {
  id: serial("id").primaryKey(),
  deviceKey: text("device_key").notNull().unique(),
  name: text("name"),
  tariffRatePerKwh: doublePrecision("tariff_rate_per_kwh").notNull().default(8.0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Device = typeof devicesTable.$inferSelect;

/** Raw power readings — every 30-60 s from the ESP32 */
export const readingsTable = pgTable("readings", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id),
  powerWatts: doublePrecision("power_watts").notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export type Reading = typeof readingsTable.$inferSelect;

/** One row per device per day — aggregated from readings for fast queries */
export const dailyUsageTable = pgTable(
  "daily_usage",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id").notNull().references(() => devicesTable.id),
    usageDate: date("usage_date").notNull(),
    energyKwh: doublePrecision("energy_kwh").notNull(),
  },
  (t) => [uniqueIndex("daily_usage_device_date_idx").on(t.deviceId, t.usageDate)],
);

export type DailyUsage = typeof dailyUsageTable.$inferSelect;

/** Every bill prediction the model makes, logged for predicted-vs-actual comparison */
export const predictionsTable = pgTable("predictions", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id),
  predictionType: text("prediction_type").notNull(),
  predictedValue: doublePrecision("predicted_value").notNull(),
  actualValue: doublePrecision("actual_value"),
  modelVersion: text("model_version"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Prediction = typeof predictionsTable.$inferSelect;
