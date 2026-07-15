import { pgTable, text, real, boolean, timestamp, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
