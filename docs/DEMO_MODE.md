# Demo mode: simulated electrical readings, no hardware or database

> **DEMO MODE — SIMULATED READINGS.** In demo mode the dashboard's voltage, current,
> power, energy and estimated bill are *calculated from appliance ON/OFF states held in
> server memory*. They are **not** measurements from the ESP32 sensors, and nothing is
> stored as a sensor reading.

## Run the demo locally (no database, no ESP32)

Run these from the repository root, in two terminals.

Terminal 1, the API server:

```
DEMO_MODE=true PORT=5000 pnpm --filter @workspace/api-server run dev
```

Terminal 2, the dashboard (`VITE_API_URL` is the existing setting that points the
frontend at the API; the API allows cross-origin requests by default):

```
VITE_API_URL=http://127.0.0.1:5000 PORT=5173 pnpm --filter @workspace/smart-energy run dev
```

Open http://localhost:5173. No `DATABASE_URL` / `NEON_DATABASE_URL` is needed.

## Turning it on and off

`DEMO_MODE` is **opt-in**: demo mode is active only when `DEMO_MODE` is `true` (or `1`,
`on`, `yes`) on the API server. Unset, or any other value, means normal behaviour.

Because demo buttons do **not** drive real relays, never set `DEMO_MODE` on the
production (Render) service.

| | Normal mode (default) | `DEMO_MODE=true` |
| --- | --- | --- |
| Database | Required (fails at startup without a URL, as before) | **Never opened**, even if a URL is set |
| Appliance buttons | Queue ESP32 commands; state changes only after the ESP32 acknowledges | Change in-memory state immediately; no command is created |
| Voltage / current / power | ESP32 readings and acknowledged states | Simulated from the in-memory states |
| `POST /readings`, `/commandAck`, `GET /commands/:key` | Unchanged | Acknowledged but ignored (nothing stored, no command ever returned) |

Code: `artifacts/api-server/src/lib/demo-mode.ts` (state, energy ledger),
`artifacts/api-server/src/routes/demo.ts` (routes, mounted first only in demo mode),
`lib/api-zod/src/demo-simulation.ts` (calculations), `lib/db/src/index.ts` (refuses
connections in demo mode).

## What is simulated

| Quantity | Source |
| --- | --- |
| Appliance ratings | `APPLIANCE_POWER_RATINGS_W` in `lib/api-zod/src/energy-estimate.ts` (the only definition): four LEDs at 2.5 W, Mini Fan at 5.5 W, 15.5 W maximum |
| Which appliances are ON | In-memory demo state, all OFF at server start |
| Current Power (W) | `estimatePowerFromConfirmedStates()`: sum of the ratings of appliances currently ON, recalculated from the full state every time |
| Voltage | 230 V nominal, also when everything is OFF |
| Power factor | 0.9 (configured assumption, not measured) |
| Current (A) | `currentPowerW / (230 * 0.9)`, full precision internally, shown to 3 decimals |
| Energy | `energyWh = powerW * elapsedHours`, sampled every second; a toggle first charges the elapsed interval at the previous power |
| Estimated bill | simulated kWh x ₹8.5/kWh (the project's default tariff); demo monthly budget ₹1500 |

| Appliances ON | Power | Current |
| --- | --- | --- |
| none | 0 W | 0.000 A |
| 1 LED | 2.5 W | 0.012 A |
| 4 LEDs | 10 W | 0.048 A |
| Mini Fan | 5.5 W | 0.027 A |
| 4 LEDs + Mini Fan | 15.5 W | 0.075 A |

Displayed appliance names are Living Room Light, Bedroom Light, Kitchen Light,
Sitting Area/Study Room Light and Mini Fan.

## Limitations

- **All demo state is in server memory.** Appliances return to OFF and simulated energy
  to 0 whenever the API server restarts (including Render free-plan sleep). Keep the
  server running during a presentation. An interval of more than 5 s with no sample is
  not credited, so no energy is invented for unobserved time.
- **Features that need real history are unavailable in demo mode** and return
  HTTP 503 with a clear message: Energy analytics, appliance breakdown, bill prediction
  and the ML endpoints, saving settings and dismissing alerts. The Energy Consumption
  chart and the alerts list are empty rather than invented. These pages work in normal
  mode with a database.
- At 15.5 W maximum the numbers are small (about 0.0155 kWh per hour), so energy is
  shown to 5 decimals and the bill to 4 decimals.
- "Today" and "this month" roll over on UTC dates, like the rest of the dashboard route.
- Real appliances have their own power factors; 0.9 is a simplification for a
  single-phase demonstration.
- In normal mode, `POST /api/readings` can still raise alerts from faulty sensor values.
