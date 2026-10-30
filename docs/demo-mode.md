# Demo Mode – Simulated Electrical Readings

Demo Mode is intended only for a supervised project presentation when the voltage/current sensors are unavailable. It does not replace or modify ESP32 relay control.

## Enable / disable

Set the backend environment variable:

\`\`\`env
DEMO_MODE=true
\`\`\`

Only the exact lowercase value \`true\` enables simulation. An unset variable, blank value, \`false\`, \`TRUE\`, \`1\`, or any other value keeps the API in real-sensor mode. Restart the backend after changing the setting. The checked-in \`.env.example\` deliberately defaults to \`false\`.

## Calculation

The simulation reads the five appliance rows from the database. Those rows represent the last acknowledged relay states; a requested toggle is not counted until the ESP32 acknowledges it.

| Appliance | Rated power |
|---|---:|
| Living Room Light | 2.5 W |
| Bedroom Light | 2.5 W |
| Kitchen Light | 2.5 W |
| Study Room Light | 2.5 W |
| Mini Fan | 5.5 W |

- Voltage: small deterministic fluctuations around 230 V, constrained to the 220–240 V range
- Assumed power factor: 0.90
- Active power: sum of the rated power of appliances whose confirmed state is ON
- Current: `powerW / (voltageV × 0.90)` (zero when all appliances are OFF)
- Energy: elapsed-time integration of the previous sampled power, converted from Wh to kWh
- Demo bill estimate: session energy in kWh multiplied by the configured tariff in ₹/kWh; it never uses or writes production usage history

With all five appliances ON, simulated power is 15.5 W and current is approximately 0.075 A. With all appliances OFF, both are zero.

## Safety and data boundaries

- The API requires exactly one valid boolean state for each of the five known appliance IDs. Missing, duplicate, extra, or invalid states cause HTTP 503 with \`APPLIANCE_STATES_UNAVAILABLE\` in Demo Mode. The dashboard must show unavailable values rather than substituting zero or stale readings.
- Invalid snapshots do not advance the energy ledger.
- Energy integration uses only short observed intervals (up to five seconds); longer gaps are skipped to avoid inventing consumption while the API was not observing the device.
- The demo energy ledger is in memory and resets when the backend restarts. In Demo Mode the Dashboard's energy and bill estimates use this session ledger, not persisted daily/monthly production totals.
- Simulated readings are returned by the dashboard summary/live endpoints only. They are not inserted into the sensor \`readings\` table or \`daily_usage\` table.
- The Dashboard energy chart returns bounded samples from the same in-memory session ledger while Demo Mode is enabled; it does not query persisted readings or daily usage. The analytics pages and ML predictions continue to use persisted history only, and Demo energy is not fed into model training or prediction inputs.
- Relay command dispatch, acknowledgements, active-LOW firmware logic, device authentication, and real sensor ingestion remain unchanged.

The dashboard labels simulated readings explicitly. Do not describe simulated voltage/current/power as physical sensor measurements during the presentation.
