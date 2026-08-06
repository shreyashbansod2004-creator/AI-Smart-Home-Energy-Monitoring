#include <Arduino.h>
#include "config.h"
#include "config_manager.h"
#include "portal_manager.h"
#include "wifi_manager.h"
#include "sensor_manager.h"
#include "relay_manager.h"
#include "oled_manager.h"
#include "api_client.h"

// ─── Module instances ─────────────────────────────────────────────────────────
ConfigManager config;
PortalManager portal(config);   // shares the same ConfigManager instance
WiFiManager   wifi;
SensorManager sensors;
RelayManager  relays;
OledManager   oled;
ApiClient     api;

// APPLIANCE_NAMES is defined in config.h (indexed by relay, 0-based)

// ─── Setup ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n========== Smart Energy ESP32 Boot ==========");

  // 1. OLED — splash while we get everything ready
  oled.begin();
  oled.showSplash();

  // 2. Relays — all OFF immediately (safety first)
  relays.begin();

  // 3. Sensors — initialise ADC
  sensors.begin();

  // ── 4. Load configuration from NVS ────────────────────────────────────────
  bool hasConfig = config.load();

  if (!hasConfig) {
    // ── First boot or config was cleared ─────────────────────────────────────
    // Show the portal screen on the OLED so the user knows what is happening
    oled.showError("Setup Portal");
    Serial.println("[Main] No config — starting Wi-Fi portal…");

    // startAndBlock() never returns; it saves to NVS and calls ESP.restart()
    portal.startAndBlock("SmartEnergy-Setup");
    // ─ execution resumes after reboot ─
  }

  // ── 5. Wi-Fi — connect with credentials loaded from NVS ───────────────────
  wifi.begin(config.getSSID(), config.getPassword());
  oled.showConnecting(1);

  if (!wifi.connect(WIFI_CONNECT_TIMEOUT)) {
    // Initial connect failed — open portal so user can correct credentials
    oled.showError("WiFi failed");
    Serial.println("[Main] Initial WiFi connect failed — starting portal…");
    portal.startAndBlock("SmartEnergy-Setup");
    // ─ execution resumes after reboot ─
  }

  // ── 6. NTP time sync (for ISO timestamps in readings) ─────────────────────
  configTime(19800, 0, "pool.ntp.org", "time.nist.gov"); // UTC+5:30 (IST)
  Serial.println("[Main] NTP syncing…");
  delay(1000);

  // ── 7. API client — backend URL comes from NVS, not config.h ──────────────
  api.begin(config.getApiUrl(), DEVICE_KEY);

  Serial.println("[Main] Boot complete. Entering main loop.");
}

// ─── Main Loop ───────────────────────────────────────────────────────────────
void loop() {
  // 1. Keep Wi-Fi alive (non-blocking reconnection with failure counting)
  wifi.update();

  // 2. If the reconnect failure threshold is reached, re-open the portal so
  //    the user can enter working credentials without reflashing the firmware.
  if (wifi.shouldRestartPortal()) {
    Serial.println("[Main] Too many Wi-Fi failures — restarting config portal…");
    oled.showError("WiFi lost");
    delay(1000);
    portal.startAndBlock("SmartEnergy-Setup");
    // ─ never reached — portal calls ESP.restart() ─
  }

  // 3. Read sensors (non-blocking — respects SENSOR_READ_INTERVAL)
  sensors.update();
  SensorData data = sensors.getData();

  // 4. API: post readings + poll for commands (non-blocking — own timers)
  RelayCommand cmd = api.update(data);

  // 5. Execute any received command
  if (cmd.valid) {
    if (cmd.relayNum >= 1 && cmd.relayNum <= RELAY_COUNT) {
      relays.set(cmd.relayNum, cmd.turnOn);
    } else {
      Serial.printf("[Main] Relay %d out of range (max %d) — acknowledging without executing.\n",
                    cmd.relayNum, RELAY_COUNT);
    }
    // Always acknowledge so the command is not repeated on the next poll
    bool acked = api.acknowledgeCommand(cmd.id, cmd.relayNum, cmd.turnOn);
    if (!acked) {
      Serial.printf("[Main] Ack failed for cmd %d — will retry next poll.\n", cmd.id);
    }
  }

  // 6. Count active relays for OLED display
  int activeRelays = 0;
  for (int i = 1; i <= RELAY_COUNT; i++) {
    if (relays.getState(i)) activeRelays++;
  }

  // 7. Refresh OLED (non-blocking — respects OLED_REFRESH_INTERVAL)
  oled.update(data, wifi.isConnected(), activeRelays);

  // 8. Periodic status output to Serial (every 5 s)
  static unsigned long lastDebugMs = 0;
  if (millis() - lastDebugMs >= 5000) {
    lastDebugMs = millis();
    Serial.println("====================================================");
    Serial.println("ESP32 SMART HOME STATUS");
    Serial.println("====================================================");
    relays.printStates();
    Serial.println("----------------------------------------------------");
    Serial.printf("Voltage : %.1f V\n",    data.voltageV);
    Serial.printf("Current : %.3f A\n",    data.currentA);
    Serial.printf("Power   : %.1f W\n",    data.powerW);
    Serial.printf("Energy  : %.4f kWh\n",  data.energyKwh);
    Serial.printf("WiFi    : %s\n",        wifi.isConnected() ? "Connected" : "Disconnected");
    Serial.printf("Device  : %s\n",        DEVICE_KEY);
    Serial.println("====================================================");
  }
}
