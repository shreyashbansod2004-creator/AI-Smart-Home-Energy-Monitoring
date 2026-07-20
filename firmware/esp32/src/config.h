#pragma once

// ─── Wi-Fi & Backend URL ──────────────────────────────────────────────────────
// These are NO LONGER hardcoded here.
// On first boot (or after config is cleared) the device starts a Wi-Fi
// configuration portal (AP SSID: "SmartEnergy-Setup") where the user enters:
//   • Wi-Fi SSID
//   • Wi-Fi Password
//   • Backend API URL  (e.g. https://my-app.onrender.com/api)
// Values are stored in ESP32 NVS (non-volatile storage) via ConfigManager
// and reloaded automatically on every subsequent boot.

// ─── Device Identity ──────────────────────────────────────────────────────────
// Unique key sent with every reading; must match the device row in the DB.
#define DEVICE_KEY       "esp32_001"

// ─── GPIO Pin Mapping ─────────────────────────────────────────────────────────
// OLED (I2C)
#define OLED_SDA         21
#define OLED_SCL         22

// Relay Module (active-LOW relays — HIGH = OFF, LOW = ON)
#define RELAY_PIN_1      13   // Living Room Light
#define RELAY_PIN_2      12   // Bedroom Light
#define RELAY_PIN_3      14   // Kitchen Light
#define RELAY_PIN_4      27   // Study Room Light
#define RELAY_PIN_5      26   // Mini Fan
#define RELAY_PIN_6      25   // Reserved
#define RELAY_PIN_7      33   // Reserved
#define RELAY_PIN_8      32   // Reserved

// Number of active relays (appliances)
#define RELAY_COUNT      5

// Voltage & Current Sensors (ADC)
#define VOLTAGE_PIN      34   // ZMPT101B voltage sensor output
#define CURRENT_PIN      35   // ACS712 current sensor output

// ─── Sensor Calibration ───────────────────────────────────────────────────────
#define VOLTAGE_CALIBRATION   0.5f   // Adjust based on your ZMPT101B calibration
#define CURRENT_CALIBRATION   0.185f // ACS712 5A: 185mV/A, 20A: 100mV/A, 30A: 66mV/A
#define CURRENT_ZERO_OFFSET   1.65f  // Half of 3.3V reference (zero current point)
#define ADC_REF_VOLTAGE       3.3f
#define ADC_RESOLUTION        4096.0f

// ─── Timing (milliseconds) ────────────────────────────────────────────────────
#define SENSOR_READ_INTERVAL    500    // Read sensors every 500 ms
#define API_POST_INTERVAL       5000   // POST readings every 5 seconds
#define COMMAND_POLL_INTERVAL   1000   // Poll for commands every 1 second
#define OLED_REFRESH_INTERVAL   2000   // Refresh OLED every 2 seconds
#define WIFI_CONNECT_TIMEOUT    30000  // Initial connect timeout (ms)

// ─── OLED Display ─────────────────────────────────────────────────────────────
#define OLED_WIDTH       128
#define OLED_HEIGHT      64
#define OLED_I2C_ADDR    0x3C
