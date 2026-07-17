import { defineConfig } from "drizzle-kit";
import path from "path";

// NEON_DATABASE_URL takes priority; falls back to Replit-managed DATABASE_URL
const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL or NEON_DATABASE_URL must be set.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url },
});
