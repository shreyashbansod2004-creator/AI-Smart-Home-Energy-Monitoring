#include "portal_manager.h"

#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>

// ─── Captive-portal HTML (stored in flash via PROGMEM) ────────────────────────
static const char PORTAL_HTML[] PROGMEM = R"rawhtml(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SmartEnergy Setup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       color:#e2e8f0;padding:16px}
  .card{background:#1e293b;border:1px solid #334155;border-radius:16px;
        padding:32px;width:100%;max-width:420px;box-shadow:0 25px 50px rgba(0,0,0,.5)}
  .logo{display:flex;align-items:center;gap:10px;margin-bottom:24px}
  .logo-icon{width:40px;height:40px;background:linear-gradient(135deg,#22c55e,#16a34a);
             border-radius:10px;display:flex;align-items:center;justify-content:center;
             font-size:22px}
  .logo-text{font-size:20px;font-weight:700;color:#f1f5f9}
  .logo-sub{font-size:12px;color:#64748b;margin-top:1px}
  h2{font-size:18px;font-weight:600;color:#f1f5f9;margin-bottom:6px}
  .subtitle{font-size:13px;color:#64748b;margin-bottom:24px;line-height:1.5}
  .field{margin-bottom:16px}
  label{display:block;font-size:13px;font-weight:500;color:#94a3b8;margin-bottom:6px}
  input{width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;
        padding:10px 14px;font-size:14px;color:#f1f5f9;outline:none;transition:border .2s}
  input:focus{border-color:#22c55e}
  input::placeholder{color:#475569}
  .hint{font-size:11px;color:#475569;margin-top:4px}
  .divider{height:1px;background:#334155;margin:20px 0}
  button{width:100%;background:linear-gradient(135deg,#22c55e,#16a34a);border:none;
         border-radius:8px;padding:12px;font-size:15px;font-weight:600;color:#fff;
         cursor:pointer;transition:opacity .2s}
  button:hover{opacity:.9}
  button:active{opacity:.8}
  .status{text-align:center;font-size:13px;color:#64748b;margin-top:16px}
  .ap-note{background:#0f172a;border:1px solid #334155;border-radius:8px;
           padding:12px;font-size:12px;color:#64748b;margin-top:20px;line-height:1.6}
  .ap-note strong{color:#94a3b8}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-icon">⚡</div>
    <div>
      <div class="logo-text">SmartEnergy</div>
      <div class="logo-sub">Device Setup</div>
    </div>
  </div>

  <h2>Wi-Fi Configuration</h2>
  <p class="subtitle">Enter your Wi-Fi credentials and backend URL to connect this device to your smart home system.</p>

  <form method="POST" action="/save" id="setupForm">
    <div class="field">
      <label for="ssid">Wi-Fi Network (SSID)</label>
      <input type="text" id="ssid" name="ssid"
             placeholder="MyHomeNetwork"
             value="{{SSID}}" required maxlength="63" autocomplete="off">
    </div>

    <div class="field">
      <label for="pass">Wi-Fi Password</label>
      <input type="password" id="pass" name="pass"
             placeholder="Leave blank for open networks"
             maxlength="63" autocomplete="off">
      <div class="hint">Leave empty if your network has no password.</div>
    </div>

    <div class="divider"></div>

    <div class="field">
      <label for="url">Backend API URL</label>
      <input type="url" id="url" name="url"
             placeholder="https://my-app.onrender.com/api"
             value="{{API_URL}}" required maxlength="255" autocomplete="off">
      <div class="hint">Include the <code>/api</code> path. No trailing slash.</div>
    </div>

    <button type="submit">Save &amp; Connect</button>
  </form>

  <p class="status" id="statusMsg"></p>

  <div class="ap-note">
    <strong>How to connect:</strong><br>
    1. Join the <strong>SmartEnergy-Setup</strong> Wi-Fi on your phone.<br>
    2. Fill in the form above and tap <em>Save &amp; Connect</em>.<br>
    3. The device will reboot and connect to your home network.
  </div>
</div>
<script>
document.getElementById('setupForm').addEventListener('submit', function(){
  document.getElementById('statusMsg').textContent = 'Saving… device will reboot shortly.';
});
</script>
</body>
</html>
)rawhtml";

// ─── Saved confirmation page ───────────────────────────────────────────────────
static const char SAVED_HTML[] PROGMEM = R"rawhtml(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="5">
<title>SmartEnergy — Saved</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       color:#e2e8f0;padding:16px}
  .card{background:#1e293b;border:1px solid #22c55e;border-radius:16px;
        padding:40px 32px;width:100%;max-width:420px;text-align:center;
        box-shadow:0 25px 50px rgba(0,0,0,.5)}
  .icon{font-size:48px;margin-bottom:16px}
  h2{font-size:22px;font-weight:700;color:#22c55e;margin-bottom:8px}
  p{font-size:14px;color:#94a3b8;line-height:1.6}
</style>
</head>
<body>
<div class="card">
  <div class="icon">✅</div>
  <h2>Configuration Saved!</h2>
  <p>The device is rebooting and will connect to your Wi-Fi network.<br><br>
     You can close this page and reconnect your phone to your home network.<br><br>
     <em>Rebooting in a moment…</em></p>
</div>
</body>
</html>
)rawhtml";

// ─── PortalManager::startAndBlock() ───────────────────────────────────────────

void PortalManager::startAndBlock(const char* apSsid) {
  Serial.printf("\n[Portal] Starting configuration portal. AP SSID: %s\n", apSsid);

  // ── 1. Switch to AP mode ──────────────────────────────────────────────────
  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSsid);          // open AP — no password needed for setup
  delay(500);

  IPAddress apIP(192, 168, 4, 1);
  Serial.printf("[Portal] AP IP: %s\n", WiFi.softAPIP().toString().c_str());

  // ── 2. DNS server — redirect every hostname to the portal IP ─────────────
  DNSServer dns;
  dns.start(53, "*", apIP);

  // ── 3. HTTP server ────────────────────────────────────────────────────────
  WebServer server(80);

  // Pre-fill form with whatever is already stored (for re-configuration)
  String currentSsid   = _config.getSSID();
  String currentApiUrl = _config.getApiUrl();

  // Helper: build the portal page with current values substituted
  auto buildPage = [&]() -> String {
    String page = FPSTR(PORTAL_HTML);
    page.replace("{{SSID}}",    currentSsid);
    page.replace("{{API_URL}}", currentApiUrl);
    return page;
  };

  // Flag set inside POST handler, read in the loop below
  volatile bool configSaved = false;

  // GET / — serve the form
  server.on("/", HTTP_GET, [&]() {
    server.send(200, "text/html", buildPage());
  });

  // Captive-portal redirect targets used by Android/iOS/Windows
  auto redirectToPortal = [&]() {
    server.sendHeader("Location", "http://192.168.4.1/", true);
    server.send(302, "text/plain", "");
  };
  server.on("/generate_204",          HTTP_GET, redirectToPortal); // Android
  server.on("/fwlink",                HTTP_GET, redirectToPortal); // Windows
  server.on("/hotspot-detect.html",   HTTP_GET, redirectToPortal); // Apple
  server.on("/library/test/success.html", HTTP_GET, redirectToPortal); // Apple 2
  server.on("/connecttest.txt",       HTTP_GET, redirectToPortal); // Windows 11

  // POST /save — validate and persist credentials
  server.on("/save", HTTP_POST, [&]() {
    String ssid = server.arg("ssid");
    String pass = server.arg("pass");
    String url  = server.arg("url");

    ssid.trim();
    pass.trim();
    url.trim();

    // Remove trailing slash from URL if present
    if (url.endsWith("/")) url.remove(url.length() - 1);

    if (ssid.isEmpty() || url.isEmpty()) {
      // Return to form with an error note
      String page = buildPage();
      page.replace("</form>",
        "<p style='color:#f87171;margin-top:10px;font-size:13px'>"
        "⚠ SSID and Backend URL are required.</p></form>");
      server.send(400, "text/html", page);
      return;
    }

    // Save to NVS
    _config.save(ssid, pass, url);

    // Serve confirmation page; the device restarts after sending
    server.send(200, "text/html", FPSTR(SAVED_HTML));
    configSaved = true;
  });

  // 404 catch-all → redirect to portal (handles any missed captive checks)
  server.onNotFound([&]() {
    server.sendHeader("Location", "http://192.168.4.1/", true);
    server.send(302, "text/plain", "");
  });

  server.begin();
  Serial.println("[Portal] HTTP server started. Waiting for configuration…");

  // ── 4. Block until form is submitted ─────────────────────────────────────
  while (!configSaved) {
    dns.processNextRequest();
    server.handleClient();
    yield(); // Keep the watchdog timer happy
  }

  // Give the browser time to receive the confirmation page
  unsigned long waitStart = millis();
  while (millis() - waitStart < 2000) {
    dns.processNextRequest();
    server.handleClient();
    yield();
  }

  server.stop();
  dns.stop();

  // ── 5. Reboot with new credentials ───────────────────────────────────────
  Serial.println("[Portal] Configuration saved. Rebooting…");
  delay(500);
  ESP.restart();
  // Never reached
}
