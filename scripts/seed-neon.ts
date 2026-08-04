/**
 * Seed script for Neon PostgreSQL.
 * Run: DATABASE_URL=<url> pnpm tsx scripts/seed-neon.ts
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    // ── 1. Ensure existing app tables have data ──────────────────────────────
    await client.query(`
      INSERT INTO appliances (id, name, location, is_on, power_w, icon_type, updated_at)
      VALUES
        ('light-living',  'Living Room Light', 'Living Room',  false, 10, 'light', NOW()),
        ('light-bedroom', 'Bedroom Light',      'Bedroom',      false, 10, 'light', NOW()),
        ('light-kitchen', 'Kitchen Light',      'Kitchen',      false, 10, 'light', NOW()),
        ('light-sitting', 'Sitting Area Light', 'Sitting Area', false, 10, 'light', NOW()),
        ('fan-living',    'Mini Fan',           'Living Room',  false, 35, 'fan',   NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    console.log("✓ Appliances seeded");

    await client.query(`
      INSERT INTO alerts (id, type, title, message, timestamp, severity, is_dismissed, appliance_name)
      VALUES
        ('alert-1','high_power',     'High Power Usage',         'Power usage crossed 750 W. Current: 782 W',                          NOW() - INTERVAL '30 minutes', 'critical',false, NULL),
        ('alert-2','unusual_usage',  'Unusual Usage Detected',   'More than usual usage in Kitchen. Duration: 45 mins',                 NOW() - INTERVAL '14 hours',   'high',    false, 'Refrigerator'),
        ('alert-3','bill_alert',     'Bill Prediction Alert',    'Estimated bill is higher than last month. Est. Bill: ₹1,620',         NOW() - INTERVAL '16 hours',   'medium',  false, NULL),
        ('alert-4','appliance_alert','AC Running Long',          'Air Conditioner has been running continuously for 6 hours',           NOW() - INTERVAL '2 hours',    'high',    false, 'Air Conditioner'),
        ('alert-5','info',           'System Update',            'Energy monitoring system updated successfully. All sensors online.',  NOW() - INTERVAL '1 day',      'low',     false, NULL)
      ON CONFLICT (id) DO NOTHING
    `);
    console.log("✓ Alerts seeded");

    await client.query(`
      INSERT INTO settings (user_name, home_description, electricity_provider, tariff_rate_per_kwh, monthly_budget_inr, high_power_threshold_w, notifications_enabled, email_notifications, sms_notifications, timezone)
      VALUES ('Shreyas','4 Room Smart Home','MSEDCL',8.5,1500,750,true,true,false,'Asia/Kolkata')
      ON CONFLICT DO NOTHING
    `);
    console.log("✓ Settings seeded");

    // ── 2. Insert device ─────────────────────────────────────────────────────
    const devRes = await client.query(`
      INSERT INTO devices (device_key, name, tariff_rate_per_kwh)
      VALUES ('home-meter-001', 'Home Meter', 8.5)
      ON CONFLICT (device_key) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `);
    const deviceId: number = devRes.rows[0].id;
    console.log(`✓ Device seeded (id=${deviceId})`);

    // NOTE: readings and daily_usage are intentionally NOT seeded here.
    // The only valid source of sensor data is the ESP32 via POST /api/readings.
    // Seeding fake readings would misrepresent real energy consumption.

    console.log("\n🎉 Neon DB fully seeded!");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
