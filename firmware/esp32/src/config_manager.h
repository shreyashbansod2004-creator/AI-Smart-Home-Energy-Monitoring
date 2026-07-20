#pragma once

#include <Arduino.h>
#include <Preferences.h>

/**
 * ConfigManager — persists Wi-Fi credentials and backend URL in ESP32 NVS
 * (non-volatile storage) using the Arduino Preferences library.
 *
 * Typical usage:
 *   ConfigManager cfg;
 *   if (!cfg.load()) { portal.startAndBlock(); }   // first boot
 *   WiFi.begin(cfg.getSSID(), cfg.getPassword());
 *   api.begin(cfg.getApiUrl(), DEVICE_KEY);
 */
class ConfigManager {
public:
  /**
   * Load stored values from NVS.
   * @return true if all three keys (SSID, password, apiUrl) are present and
   *         non-empty; false on first boot or after clear().
   */
  bool load();

  /**
   * Persist new credentials to NVS.
   * Call this from the configuration portal before rebooting.
   */
  void save(const String& ssid,
            const String& password,
            const String& apiUrl);

  /**
   * Erase all stored keys from NVS.
   * Forces the portal to appear on the next boot.
   */
  void clear();

  /** @return true if load() succeeded and values are available. */
  bool hasConfig() const { return _valid; }

  String getSSID()     const { return _ssid;     }
  String getPassword() const { return _password; }
  String getApiUrl()   const { return _apiUrl;   }

private:
  String _ssid;
  String _password;
  String _apiUrl;
  bool   _valid = false;

  // NVS namespace and key names (max 15 chars each for Preferences)
  static constexpr const char* NVS_NS    = "smartenergy";
  static constexpr const char* KEY_SSID  = "wifi_ssid";
  static constexpr const char* KEY_PASS  = "wifi_pass";
  static constexpr const char* KEY_URL   = "api_url";
};
