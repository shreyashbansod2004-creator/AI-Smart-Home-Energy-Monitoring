#pragma once

#include <Arduino.h>
#include "config_manager.h"

/**
 * PortalManager — Wi-Fi configuration captive portal.
 *
 * When called, the ESP32 switches to AP mode (SSID: "SmartEnergy-Setup"),
 * starts a DNS server that redirects all hostnames to 192.168.4.1, and
 * serves a web form where the user can enter:
 *   - Wi-Fi SSID
 *   - Wi-Fi Password
 *   - Backend URL  (e.g. https://my-app.onrender.com/api)
 *
 * On form submission the values are saved to NVS via ConfigManager and the
 * device restarts so it boots with the new credentials.
 *
 * startAndBlock() never returns — the device either restarts after saving
 * config or waits indefinitely for the user to submit the form.
 *
 * Usage:
 *   PortalManager portal(config);   // pass the shared ConfigManager ref
 *   portal.startAndBlock();         // blocks; ESP.restart() called inside
 */
class PortalManager {
public:
  /**
   * @param config Reference to the shared ConfigManager so that saved values
   *               can be pre-filled in the form on re-configuration.
   */
  explicit PortalManager(ConfigManager& config) : _config(config) {}

  /**
   * Start the AP + DNS + HTTP portal and block until the user submits the
   * form.  Calls ESP.restart() internally — this function never returns.
   *
   * @param apSsid  SSID of the setup access point (shown in the phone's
   *                Wi-Fi list).  Default: "SmartEnergy-Setup".
   */
  void startAndBlock(const char* apSsid = "SmartEnergy-Setup");

private:
  ConfigManager& _config;
};
