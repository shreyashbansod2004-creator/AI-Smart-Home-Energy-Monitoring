#include "config_manager.h"

bool ConfigManager::load() {
  Preferences prefs;
  prefs.begin(NVS_NS, /*readOnly=*/true);

  _ssid     = prefs.getString(KEY_SSID, "");
  _password = prefs.getString(KEY_PASS, "");
  _apiUrl   = prefs.getString(KEY_URL,  "");

  prefs.end();

  _valid = _ssid.length() > 0 && _apiUrl.length() > 0;

  if (_valid) {
    Serial.printf("[Config] Loaded — SSID: %s  API: %s\n",
                  _ssid.c_str(), _apiUrl.c_str());
  } else {
    Serial.println("[Config] No valid config in NVS (first boot or cleared).");
  }

  return _valid;
}

void ConfigManager::save(const String& ssid,
                         const String& password,
                         const String& apiUrl) {
  Preferences prefs;
  prefs.begin(NVS_NS, /*readOnly=*/false);

  prefs.putString(KEY_SSID, ssid);
  prefs.putString(KEY_PASS, password);
  prefs.putString(KEY_URL,  apiUrl);

  prefs.end();

  // Update in-memory copies
  _ssid     = ssid;
  _password = password;
  _apiUrl   = apiUrl;
  _valid    = true;

  Serial.printf("[Config] Saved — SSID: %s  API: %s\n",
                ssid.c_str(), apiUrl.c_str());
}

void ConfigManager::clear() {
  Preferences prefs;
  prefs.begin(NVS_NS, /*readOnly=*/false);
  prefs.clear();
  prefs.end();

  _ssid.clear();
  _password.clear();
  _apiUrl.clear();
  _valid = false;

  Serial.println("[Config] NVS cleared.");
}
