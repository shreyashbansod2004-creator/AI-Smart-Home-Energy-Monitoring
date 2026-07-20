#include <Arduino.h>
#include "config.h"
#include "wifi_manager.h"
#include "sensor_manager.h"
#include "relay_manager.h"
#include "oled_manager.h"
#include "api_client.h"

// ─── Module instances ─────────────────────────────────────────────────────────
WiFiManager  wifi;
SensorManager sensors;
RelayManager  relays;
OledManager   oled;
ApiClient     api;

// ─── Appliance → relay mapping (relay numbers 1–5 active) ────────────────────
// Index 0 = relay 1 (Living Room Light), etc.
const char* APPLIANCE_NAMES[RELAY_COUNT] = {
  "Living Room Light",  // Relay 1 — GPIO13
  "Bedroom Light",      // Relay 2 — GPIO12
  "Kitchen Light",      // Relay 3 — GPIO14
  "Study Room Light",   // Relay 4 — GPIO27
  "Mini Fan"            // Relay 5 — GPIO26
};

// ─── Setup ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n========== Smart Energy ESP32 Boot ==========");

  // 1. OLED — splash while connecting
  oled.begin();
  oled.showSplash();

  // 2. Relays — all OFF before WiFi (safety)
  relays.begin();

  // 3. Sensors — initialize ADC
  sensors.begin();

  // 4. WiFi — connect with visual feedback on OLED
  oled.showConnecting(1);
  if (!wifi.connect(WIFI_RECONNECT_TIMEOUT)) {
    oled.showError("WiFi failed");
    Serial.println("[Main] WiFi failed. Continuing in offline mode.");
  }

  // 5. NTP time sync (for ISO timestamps in readings)
  configTime(19800, 0, "pool.ntp.org", "time.nist.gov"); // UTC+5:30 (IST)
  Serial.println("[Main] NTP syncing...");
  delay(1000);

  // 6. API client — pass base URL and device key
  api.begin(API_BASE_URL, DEVICE_KEY);

  Serial.println("[Main] Boot complete. Entering main loop.");
}

// ─── Main Loop ───────────────────────────────────────────────────────────────
void loop() {
  // 1. Keep WiFi alive
  wifi.update();

  // 2. Read sensors (non-blocking — respects SENSOR_READ_INTERVAL)
  sensors.update();
  SensorData data = sensors.getData();

  // 3. API: post readings + poll for commands (non-blocking — own timers)
  RelayCommand cmd = api.update(data);

  // 4. Execute any received command
  if (cmd.valid && cmd.relayNum >= 1 && cmd.relayNum <= RELAY_COUNT) {
    relays.set(cmd.relayNum, cmd.turnOn);

    // Acknowledge execution back to backend
    bool executed = api.acknowledgeCommand(cmd.id, cmd.relayNum, cmd.turnOn);
    if (!executed) {
      Serial.printf("[Main] Ack failed for cmd %d — will retry next poll.\n", cmd.id);
    }
  }

  // 5. Count active relays for OLED display
  int activeRelays = 0;
  for (int i = 1; i <= RELAY_COUNT; i++) {
    if (relays.getState(i)) activeRelays++;
  }

  // 6. Refresh OLED (non-blocking — respects OLED_REFRESH_INTERVAL)
  oled.update(data, wifi.isConnected(), activeRelays);

  // 7. Periodic debug output to Serial
  static unsigned long lastDebugMs = 0;
  if (millis() - lastDebugMs >= 5000) {
    lastDebugMs = millis();
    Serial.printf("[Main] V=%.1fV I=%.2fA P=%.1fW E=%.4fkWh WiFi=%s\n",
                  data.voltageV, data.currentA, data.powerW, data.energyKwh,
                  wifi.isConnected() ? "OK" : "FAIL");
    relays.printStates();
  }
}
