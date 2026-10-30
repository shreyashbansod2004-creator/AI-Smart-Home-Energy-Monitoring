# Demo mode: simulated electrical readings

> **DEMO MODE — SIMULATED READINGS.** In demo mode the dashboard's voltage, current,
> power, energy and estimated bill are *calculated from appliance ON/OFF states*.
> They are **not** measurements from the ESP32 voltage/current sensors, and they are
> never stored as sensor readings.

## Turning it on and off

| Setting | Where | Effect |
| --- | --- | --- |
| `DEMO_MODE` (API server env var) | `artifacts/api-server/src/lib/demo-mode.ts` | Enabled unless set to `false`, `0`, `off`, `no` or `disabled`. |

Set `DEMO_MODE=false` and restart the API server to restore hardware-sensor behaviour.
The frontend learns the mode from the API (`demoMode` in `GET /api/dashboard/summary`),
so there is a single switch and no extra UI control.

## What is simulated

| Quantity | Source |
| --- | --- |
| Appliance ratings | `APPLIANCE_POWER_RATINGS_W` in `lib/api-zod/src/energy-estimate.ts` (the only definition): four LEDs at 2.5 W, Mini Fan at 5.5 W, 15.5 W maximum |
| Which appliances are ON | Existing `appliances.is_on`, which only changes after the ESP32 acknowledges a command |
| Current Power (W) | `estimatePowerFromConfirmedStates()`: sum of the ratings of appliances currently ON, recalculated from the full state set every time |
| Voltage | 230 V nominal, also when everything is OFF |
| Power factor | 0.9 (configured assumption, not measured) |
| Current (A) | `currentPowerW / (230 * 0.9)`, full precision internally, shown to 3 decimals |
| Energy | `energyWh = powerW * elapsedHours`, accumulated by a 1 s sampler; the elapsed interval is charged at the *previous* power before switching to the new one |
| Estimated bill | `simulated kWh * settings.tariffRatePerKwh` (the existing tariff, 8.5 fallback as before) |

The calculations are in `lib/api-zod/src/demo-simulation.ts`. The server side is
`artifacts/api-server/src/lib/demo-mode.ts` and the demo branches in
`artifacts/api-server/src/routes/dashboard.ts`. The dashboard page derives the same
values from the same appliance states, so they update without a reload.

| Appliances ON | Power | Current |
| --- | --- | --- |
| none | 0 W | 0.000 A |
| 1 LED | 2.5 W | 0.012 A |
| 4 LEDs | 10 W | 0.048 A |
| Mini Fan | 5.5 W | 0.027 A |
| 4 LEDs + Mini Fan | 15.5 W | 0.075 A |

## What demo mode does not touch

- Appliance ON/OFF buttons, the toggle/command/acknowledge endpoints, ESP32 command
  polling and relay logic are unchanged.
- `POST /api/readings` still stores whatever the ESP32 sends. Demo mode simply never
  reads those rows (or `daily_usage`) while enabled, so bad sensor data cannot reach
  the simulated values, and nothing simulated is written to the database.
- No schema change, no migration, no change to the ML model or its training data.

## Limitations

- **Simulated energy is kept in server memory.** The existing schema cannot hold it
  without mixing it into real sensor history, so totals restart from 0 when the API
  server restarts. "Today" and "this month" roll over on UTC dates, like the rest of
  the dashboard route.
- An interval longer than 5 s with no sample (server suspended or restarted) is not
  credited, so no energy is invented for time nobody observed.
- At 15.5 W maximum the numbers are small (about 0.0155 kWh per hour), so energy is
  shown to 5 decimals and the bill to 4 decimals in demo mode.
- The Energy Consumption chart (day/week/month/year), the Energy Usage page and the
  bill-prediction page still read stored sensor history. They are not populated with
  simulated data, and predictions are not based on it. Treat them as real-history
  views, which may be unreliable while the sensors are faulty.
- The appliance-breakdown percentages use the central ratings with the existing
  "8 hours a day" assumption; they are an estimate, not usage.
- The alert generator in `POST /api/readings` can still raise alerts from faulty
  sensor values; demo mode does not change alerting.
- Real appliances have their own power factors; 0.9 is a simplification for a
  single-phase demonstration.
