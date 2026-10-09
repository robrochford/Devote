# Devote Licensing Architecture & Testing Guide

## 1. Overview
Devote is distributed as a paid subscription service sold via Stripe Payment Links on [https://devote.electrodedigital.co.uk](https://devote.electrodedigital.co.uk).

Upon purchase completion:
- A license key is generated in Crockford/Base32 format: `DVT-XXXX-XXXX-XXXX-XXXX` (excluding confusing characters `0`, `O`, `1`, `I`).
- The license key allows activation on up to **3 concurrent devices**.
- The 14-day free trial is handled entirely at checkout by Stripe. During the trial period, Stripe marks the subscription as `trialing`, which the WordPress REST API treats as `active`. No special local trial countdown logic exists in the app.

---

## 2. API Specification

Base URL: `https://devote.electrodedigital.co.uk/wp-json/devote/v1` (configurable via `DEVOTE_LICENSE_API` environment variable).

### 2.1 Activate Device: `POST /license/activate`
**Request:**
```json
{
  "license_key": "DVT-XXXX-XXXX-XXXX-XXXX",
  "device_id": "<sha256-hashed-id>",
  "device_name": "Rob's PC",
  "platform": "windows"
}
```
**Responses:**
- `200 OK`: Device activated or was already activated (`{ success: true, status: "active", customer, devices_used, max_devices }`).
- `400 Bad Request`: Missing `license_key` or `device_id`.
- `403 Forbidden`: Subscription not active, or device limit reached (3 devices max).
- `404 Not Found`: License key does not exist.

### 2.2 Heartbeat / Verify: `POST /license/check`
**Request:**
```json
{
  "license_key": "DVT-XXXX-XXXX-XXXX-XXXX",
  "device_id": "<sha256-hashed-id>"
}
```
**Responses:**
- `200 OK`: `{ success: true, status: "active"|"past_due"|"inactive"|"cancelled", customer }`
- `404 Not Found`: `{ success: false, status: "not_found" }`

### 2.3 Deactivate Device: `POST /license/deactivate`
**Request:**
```json
{
  "license_key": "DVT-XXXX-XXXX-XXXX-XXXX",
  "device_id": "<sha256-hashed-id>"
}
```
**Responses:**
- `200 OK`: `{ success: true, message: "Device deactivated." }`

---

## 3. App Architecture & Storage

- **Core Module**: `src/main/licenseService.js` (wrapped by IPC handlers in `src/main/index.js`).
- **Device ID**:
  - Deterministically generated from machine-specific hardware identifiers (Windows registry MachineGuid / macOS IOPlatformUUID) hashed with SHA-256 (`devote-device-seed:<raw_id>`).
  - Stored in `electron-store` under `deviceId`. Raw machine identifiers or serial numbers are **never** transmitted or logged.
- **Secure Storage**:
  - License records (license key, status, customer details, timestamps) are encrypted using Electron's OS-backed `safeStorage` API before writing to `electron-store` (`licenseRecord`).
  - Keys are masked (`DVT-••••-••••-••••-XXXX`) for display in logs and UI.
- **Offline Tolerance**:
  - Devote allows full offline operation for up to **14 days** from the last successful check.
  - Network timeouts (10 seconds) or server 5xx errors do not lock out the user.
- **Past Due Grace Period**:
  - If Stripe reports `past_due`, Devote allows a **7-day grace period** with a non-blocking warning banner. If billing is not resolved within 7 days, access is locked until updated.
- **Background Checks**:
  - Non-blocking check on app startup (after UI renders).
  - Periodic check every 24 hours while running.
  - Automatic check upon wake from system sleep/hibernation.

---

## 4. UI Screens & Panels

1. **Activation Screen (`LicenseScreen.jsx`)**:
   - Displayed on initial launch when no license is configured, or if an existing license expires / exceeds limits.
   - Auto-formats input as `DVT-XXXX-XXXX-XXXX-XXXX` and auto-uppercases. Accepts keys pasted with or without dashes/spaces.
   - Provides direct links to **Buy a license** (`/#pricing`) and **Need help?** (`support@electrodedigital.co.uk`).
2. **Settings → Subscription Panel (`App.jsx`)**:
   - Displays masked license key, account email, status badge, and last verified date.
   - Includes **Deactivate this device**, **Change key**, and **Manage subscription** actions.

---

## 5. How to Test Against the Live API

### 5.1 Run Automated Unit Tests
```bash
npm test
```
Runs 14 test scenarios validating normalization, masking, activation response codes, 3-device limit, past_due grace windows, offline tolerance timeouts, and deactivation.

### 5.2 Manual Testing in Dev Mode
```bash
npm run dev
```
1. **Fresh Activation**:
   - Launch Devote. The activation screen will present automatically.
   - Enter your test key: `DVT-XXXX-XXXX-XXXX-XXXX`.
   - Click **Activate Devote**. The app transitions smoothly to the onboarding or devotion screen.
2. **Verify Settings Panel**:
   - Click the gear icon to open Settings.
   - Check the Devote Subscription card: confirm masked key and "Active" status badge.
   - Click **Deactivate this device** to test freeing up the device slot. Devote immediately reverts to the activation screen.
3. **Environment Override**:
   - To point to a local or staging environment:
   ```bash
   $env:DEVOTE_LICENSE_API="https://staging.electrodedigital.co.uk/wp-json/devote/v1"
   npm run dev
   ```
