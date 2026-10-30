import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Demo mode (DEMO_MODE=true) is database-free: it never opens a connection, even
// when a database URL is present in the environment, so a demo can never read or
// write real data. Keep this check in sync with parseDemoModeFlag() in
// lib/api-zod/src/demo-simulation.ts.
const demoMode = ["true", "1", "on", "yes"].includes(
  (process.env.DEMO_MODE ?? "").trim().toLowerCase(),
);

// NEON_DATABASE_URL takes priority (production Neon DB).
// Falls back to DATABASE_URL (Replit-managed dev DB).
const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

function unavailable(): never {
  throw new Error(
    "Database access is disabled: the server is running with DEMO_MODE=true " +
      "(in-memory demo, no database). Unset DEMO_MODE to use the database.",
  );
}

// Demo mode: any attempted use fails loudly instead of silently touching a database.
const blocked = new Proxy({}, { get: unavailable, apply: unavailable });

if (!demoMode && !connectionString) {
  throw new Error(
    "No database URL found. Set NEON_DATABASE_URL (Neon) or DATABASE_URL.",
  );
}

export const pool: pg.Pool = demoMode
  ? (blocked as pg.Pool)
  : new Pool({ connectionString, ssl: connectionString!.includes("neon.tech") ? { rejectUnauthorized: false } : undefined });
export const db = demoMode
  ? (blocked as ReturnType<typeof drizzle<typeof schema>>)
  : drizzle(pool, { schema });

export * from "./schema";
