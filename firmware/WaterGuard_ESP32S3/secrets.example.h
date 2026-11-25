// Copy this file to secrets.h in the same folder and fill in real values locally.
// secrets.h is listed in .gitignore. Never commit it, paste it in chat, or print it.
#pragma once

// 2.4 GHz Wi-Fi only (ESP32-S3 has no 5 GHz radio).
#define WIFI_SSID     "your-2.4GHz-ssid"
#define WIFI_PASSWORD "your-wifi-password"

// ThingsBoard Cloud host without https:// (thingsboard.cloud or eu.thingsboard.cloud).
#define THINGSBOARD_HOST "thingsboard.cloud"

// Access Token of the REAL device "ESP32-S3-Water-Level" (NOT the -SIM device).
// ThingsBoard -> Entities -> Devices -> ESP32-S3-Water-Level -> Copy access token.
#define THINGSBOARD_DEVICE_TOKEN "paste-live-device-access-token"
