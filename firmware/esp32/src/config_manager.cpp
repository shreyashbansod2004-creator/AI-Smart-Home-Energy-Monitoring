#include "config_manager.h"
#include "config.h"

namespace {
const char* const WRONG_API_HOST = "https://ai-smart-home-energy-monitoring-2.onrender.com";

String normalizeApiUrl(String url) {
  url.trim();
  while (url.endsWith("/")) url.remove(url.length() - 1);

  // Migrate the known inactive Render host to the active API without
  // changing any other user-configured backend URL.
  if (url == WRONG_API_HOST || url == String(WRONG_API_HOST) + "/api") {
    return DEFAULT_API_URL;
  }

  return url;
}
}  // namespace

bool ConfigManager::load() {
  Preferences prefs;
  prefs.begin(NVS_NS, /*readOnly=*/true);

  _ssid     = prefs.getString(KEY_SSID, "");
  _password = prefs.getString(KEY_PASS, "");
  const String storedApiUrl = prefs.getString(KEY_URL, DEFAULT_API_URL);

  prefs.end();

  _apiUrl = normalizeApiUrl(storedApiUrl);
  if (_apiUrl.isEmpty()) _apiUrl = DEFAULT_API_URL;

  // Keep NVS aligned with the URL actually used by the API client. This
  // migrates an old -2 Render URL once and persists the canonical value.
  if (_apiUrl != storedApiUrl) {
    Preferences writePrefs;
    writePrefs.begin(NVS_NS, /*readOnly=*/false);
    writePrefs.putString(KEY_URL, _apiUrl);
    writePrefs.end();
  }

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
  const String normalizedApiUrl = normalizeApiUrl(apiUrl);
  Preferences prefs;
  prefs.begin(NVS_NS, /*readOnly=*/false);

  prefs.putString(KEY_SSID, ssid);
  prefs.putString(KEY_PASS, password);
  prefs.putString(KEY_URL,  normalizedApiUrl);

  prefs.end();

  // Update in-memory copies
  _ssid     = ssid;
  _password = password;
  _apiUrl   = normalizedApiUrl;
  _valid    = true;

  Serial.printf("[Config] Saved — SSID: %s  API: %s\n",
                ssid.c_str(), _apiUrl.c_str());
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
