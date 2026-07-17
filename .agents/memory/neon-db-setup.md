---
name: Neon + Replit DB coexistence
description: How DATABASE_URL and NEON_DATABASE_URL interact in this project; why we can't override DATABASE_URL.
---

`DATABASE_URL` is a Replit runtime-managed key — the platform always injects it pointing to the Replit-managed PostgreSQL. User-set secrets named `DATABASE_URL` are silently overridden.

**Solution adopted:** `lib/db/src/index.ts` prefers `NEON_DATABASE_URL` when set, falls back to `DATABASE_URL` (Replit dev DB). `lib/db/drizzle.config.ts` does the same for migrations.

**Schema state:**
- Both the Replit-managed DB and the Neon DB have all 7 tables: `settings`, `appliances`, `alerts`, `devices`, `readings`, `daily_usage`, `predictions`.
- Replit dev DB is seeded with 1 device (id=1, key=home-meter-001), 480 readings, 61 days of daily_usage, 7 appliances, 5 alerts, 1 settings row.
- Neon DB is also seeded identically via `scripts/seed-neon.ts` (run with explicit `NEON_DATABASE_URL` on CLI).

**To activate Neon:** Add `NEON_DATABASE_URL` as a Replit Secret with the Neon connection string. The DB client auto-switches.

**Why:** Replit's managed DB is the dev DB; Neon is the production DB. This dual-DB setup lets development work without Neon credentials while production (deployed) always hits Neon.
