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
        ('ac-living',      'Air Conditioner',  'Living Room',  false, 1800, 'wind',    NOW()),
        ('fridge-kitchen', 'Refrigerator',     'Kitchen',      true,  120,  'box',     NOW()),
        ('fan-living',     'Ceiling Fan',      'Living Room',  true,  75,   'wind',    NOW()),
        ('light-living',   'Living Room Light','Living Room',  true,  18,   'zap',     NOW()),
        ('tv-living',      'Television',       'Living Room',  false, 150,  'tv',      NOW()),
        ('washer-utility', 'Washing Machine',  'Utility Area', false, 500,  'washing-machine', NOW()),
        ('heater-bedroom', 'Water Heater',     'Bedroom',      false, 2000, 'flame',   NOW())
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

    // ── 3. Seed readings — 20 per hour for the past 24 hours ─────────────────
    // Clear old readings first to avoid duplicate buildup on re-runs
    await client.query(`DELETE FROM readings WHERE device_id = $1 AND recorded_at < NOW() - INTERVAL '25 hours'`, [deviceId]);

    const hourlyBases: Record<number, number> = {
      0:300,1:270,2:260,3:250,4:260,5:300,
      6:700,7:800,8:850,9:800,
      10:950,11:1000,12:1050,13:1000,
      14:1150,15:1200,16:1100,17:1050,
      18:1300,19:1400,20:1350,21:1200,22:1000,23:700,
    };

    const readingValues: string[] = [];
    const readingParams: (number | Date)[] = [];
    let pi = 1;

    const now = new Date();
    for (let minutesAgo = 24 * 60 - 1; minutesAgo >= 0; minutesAgo -= 3) {
      const ts = new Date(now.getTime() - minutesAgo * 60 * 1000);
      const h = ts.getHours();
      const base = hourlyBases[h] ?? 500;
      const watts = Math.round(base + (Math.random() - 0.5) * 150);
      readingValues.push(`($${pi++}, $${pi++}, $${pi++})`);
      readingParams.push(deviceId, watts, ts);
    }

    await client.query(
      `INSERT INTO readings (device_id, power_watts, recorded_at) VALUES ${readingValues.join(", ")}
       ON CONFLICT DO NOTHING`,
      readingParams,
    );
    console.log(`✓ Readings seeded (${readingValues.length} rows)`);

    // ── 4. Seed daily_usage — 60 days back ──────────────────────────────────
    const dailyValues: string[] = [];
    const dailyParams: (number | string | number)[] = [];
    let dpi = 1;

    for (let daysAgo = 60; daysAgo >= 0; daysAgo--) {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      const dateStr = d.toISOString().slice(0, 10);

      // Seasonal + weekend variation
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const month = d.getMonth(); // 0=Jan … 11=Dec
      // Summer peak: Apr-Jul higher usage
      const seasonBoost = (month >= 3 && month <= 6) ? 3.5 : 0;
      const base = 8.5 + (isWeekend ? 1.5 : 0) + seasonBoost;
      const energyKwh = parseFloat((base + (Math.random() - 0.4) * 2).toFixed(3));

      dailyValues.push(`($${dpi++}, $${dpi++}, $${dpi++})`);
      dailyParams.push(deviceId, dateStr, energyKwh);
    }

    await client.query(
      `INSERT INTO daily_usage (device_id, usage_date, energy_kwh) VALUES ${dailyValues.join(", ")}
       ON CONFLICT (device_id, usage_date) DO UPDATE SET energy_kwh = EXCLUDED.energy_kwh`,
      dailyParams,
    );
    console.log(`✓ Daily usage seeded (${dailyValues.length} rows)`);

    console.log("\n🎉 Neon DB fully seeded!");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
