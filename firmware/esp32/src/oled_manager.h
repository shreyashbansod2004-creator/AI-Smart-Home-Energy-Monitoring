#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "sensor_manager.h"

/**
 * OledManager — drives a 128x64 SSD1306 OLED over I2C.
 * Displays voltage, current, power, energy, and WiFi status.
 * Call update() in every loop; it respects OLED_REFRESH_INTERVAL.
 */
class OledManager {
public:
  /**
   * Initialize the OLED display.
   * Call once in setup() AFTER Wire.begin().
   * @return true if display found, false if not detected on I2C bus.
   */
  bool begin();

  /**
   * Refresh the display if OLED_REFRESH_INTERVAL has elapsed.
   * Non-blocking.
   */
  void update(const SensorData& data, bool wifiConnected, int relayCount);

  /** Show a startup splash screen. */
  void showSplash();

  /** Show a WiFi-connecting animation frame. */
  void showConnecting(int dots);

  /** Show an error message on screen. */
  void showError(const String& msg);

private:
  Adafruit_SSD1306 _display{ 128, 64, &Wire, -1 };
  unsigned long _lastRefreshMs = 0;
  bool _initialized = false;

  void drawMainScreen(const SensorData& data, bool wifiConnected, int relayCount);
};
