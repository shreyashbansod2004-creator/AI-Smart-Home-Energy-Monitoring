#include "oled_manager.h"
#include "config.h"

bool OledManager::begin() {
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!_display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    Serial.println("[OLED] Display not found on I2C bus!");
    _initialized = false;
    return false;
  }
  _display.clearDisplay();
  _display.setTextColor(SSD1306_WHITE);
  _initialized = true;
  Serial.println("[OLED] Display initialized.");
  return true;
}

void OledManager::showSplash() {
  if (!_initialized) return;
  _display.clearDisplay();
  _display.setTextSize(1);
  _display.setCursor(20, 10);
  _display.println("Smart Energy");
  _display.setTextSize(1);
  _display.setCursor(25, 28);
  _display.println("ESP32 Monitor");
  _display.setCursor(10, 48);
  _display.println("Initializing...");
  _display.display();
  delay(2000);
}

void OledManager::showConnecting(int dots) {
  if (!_initialized) return;
  _display.clearDisplay();
  _display.setTextSize(1);
  _display.setCursor(0, 0);
  _display.println("Connecting WiFi");
  _display.setCursor(0, 20);
  for (int i = 0; i < dots; i++) _display.print(".");
  _display.display();
}

void OledManager::showError(const String& msg) {
  if (!_initialized) return;
  _display.clearDisplay();
  _display.setTextSize(1);
  _display.setCursor(0, 0);
  _display.println("!! ERROR !!");
  _display.setCursor(0, 20);
  _display.println(msg);
  _display.display();
}

void OledManager::update(const SensorData& data, bool wifiConnected, int relayCount) {
  if (!_initialized) return;
  unsigned long now = millis();
  if (now - _lastRefreshMs < OLED_REFRESH_INTERVAL) return;
  _lastRefreshMs = now;
  drawMainScreen(data, wifiConnected, relayCount);
}

void OledManager::drawMainScreen(const SensorData& data, bool wifiConnected, int relayCount) {
  _display.clearDisplay();
  _display.setTextSize(1);

  // ── Header ────────────────────────────────────────────────────────────────
  _display.setCursor(0, 0);
  _display.print("SmartEnergy ");
  _display.print(wifiConnected ? "[OK]" : "[!!]");

  _display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  // ── Voltage ───────────────────────────────────────────────────────────────
  _display.setCursor(0, 14);
  _display.printf("V: %.1f V", data.voltageV);

  // ── Current ───────────────────────────────────────────────────────────────
  _display.setCursor(70, 14);
  _display.printf("I: %.2f A", data.currentA);

  // ── Power ─────────────────────────────────────────────────────────────────
  _display.setCursor(0, 28);
  _display.printf("P: %.1f W", data.powerW);

  // ── Energy ────────────────────────────────────────────────────────────────
  _display.setCursor(70, 28);
  _display.printf("E:%.3fkWh", data.energyKwh);

  // ── Relay count ───────────────────────────────────────────────────────────
  _display.setCursor(0, 42);
  _display.printf("Appliances ON: %d", relayCount);

  // ── Status bar ────────────────────────────────────────────────────────────
  _display.drawLine(0, 53, 127, 53, SSD1306_WHITE);
  _display.setCursor(0, 56);
  _display.print(wifiConnected ? "WiFi: Connected" : "WiFi: Offline");

  _display.display();
}
