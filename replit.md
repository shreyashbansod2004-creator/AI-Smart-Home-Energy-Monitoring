# AI Smart Home Energy Monitor

A full-stack smart home energy monitoring dashboard. Tracks real-time power consumption from ESP32 IoT devices, manages appliances, shows energy analytics, and predicts monthly bills.

## Run & Operate

- `pnpm --filter @workspace/smart-energy run dev` — frontend (port 5173, served at `/`)
- `pnpm --filter @workspace/api-server run dev` — API server (port 8080, served at `/api`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Replit-managed Postgres (auto-set); or `NEON_DATABASE_URL` for an external Neon DB

## Stack

- pnpm workspaces, Node.js, TypeScript 5.9
- Frontend: React 19 + Vite 7 + Tailwind CSS 4 + shadcn/ui (artifacts/smart-energy)
- API: Express 5 (artifacts/api-server)
- DB: PostgreSQL + Drizzle ORM (lib/db)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in lib/api-spec)
- Build: esbuild (CJS bundle for API server)

## Where things live

- `artifacts/smart-energy/src/` — React frontend (pages, components, hooks)
- `artifacts/api-server/src/` — Express routes, middleware
- `lib/db/src/schema/energy.ts` — Drizzle schema (source of truth)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `lib/api-client-react/` — generated React Query hooks
- `lib/api-zod/` — generated Zod schemas
- `firmware/` — ESP32 firmware code

## Architecture decisions

- `NEON_DATABASE_URL` takes priority over `DATABASE_URL`; falls back to Replit-managed Postgres in dev.
- API server is path-routed at `/api`; frontend is at `/`. In dev, the frontend calls relative `/api` paths — no `VITE_API_URL` needed.
- API server rebuilds with esbuild on each `dev` start (no hot reload); restart the workflow to pick up changes.
- Originally deployed to Render (backend) + Vercel (frontend); now runs fully on Replit.

## Product

- Dashboard: live power/energy metrics from ESP32 IoT devices
- Appliances: manage smart home appliances, toggle relay control
- Energy Usage: historical consumption charts (day/week/month/year)
- Bill Prediction: AI-powered monthly bill forecast
- Alerts: high-power and offline-device notifications
- Settings: tariff rates, budget, notification preferences
- Device Status: ESP32 connectivity monitoring

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- API server has no hot reload — code changes require restarting the `artifacts/api-server: API Server` workflow.
- `pnpm --filter @workspace/db run push --force` is needed if schema diverges.
- Port 23293 (original frontend port) is not supported by Replit workflows; changed to 5173.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
