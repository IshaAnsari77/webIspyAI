# iSpyAI — Network Intelligence SDK

> A real-time web dashboard that simulates how an iOS SDK intercepts, analyzes, and visualizes API traffic — live in the browser.

![iSpyAI Dashboard](https://img.shields.io/badge/iSpyAI-SDK%20v2.1.0-4d9de0?style=for-the-badge)
![Pure JS](https://img.shields.io/badge/Built%20With-Pure%20JS%20%2B%20CSS-22c55e?style=for-the-badge)
![No Framework](https://img.shields.io/badge/Framework-None-ef4444?style=for-the-badge)
![Open in Browser](https://img.shields.io/badge/Run-Open%20index.html-f59e0b?style=for-the-badge)

---

## What Is This?

**iSpyAI** is a browser-based simulation of a mobile network intelligence SDK — the kind of tool iOS developers use to monitor, debug, and analyze API calls in production apps.

When a mobile app makes an API call (login, fetch user data, upload a file), the iSpyAI SDK sits in between and:
- **Intercepts** the request before it leaves the device
- **Captures** headers, body, endpoint, method
- **Measures** exact response time
- **Masks** all sensitive data (tokens, passwords)
- **Analyzes** the response using an AI engine
- **Displays** everything in a live real-time dashboard

This web app is the **dashboard layer** — built to show exactly how the full SDK system would behave in production.

---

## Live Demo

> Open `index.html` directly in any browser — no server, no install, no build step required.

```
Just double-click index.html
```

---

## Features

### 1. API Simulation Engine
Simulates real API calls across 7 production-style endpoints with weighted random outcomes:

| Endpoint | Possible Outcomes |
|---|---|
| `GET /api/v1/users/me` | 200 OK, 401 Unauthorized, 500 Error, Slow response |
| `POST /api/v1/auth/login` | 200 OK, 401 Invalid credentials, 403 Account locked, 500 Error |
| `GET /api/v1/products` | 200 OK, Slow response, 500 Database error |
| `GET /api/v1/admin/analytics` | 403 Forbidden, 200 OK, 401 Unauthorized |
| `GET /api/v1/orders/:id` | 404 Not Found, 200 OK, 500 Error |
| `POST /api/v1/uploads/profile-image` | 200 OK, Slow upload, 500 Storage error |
| `GET /api/v1/notifications` | 200 OK, 401 Unauthorized, 500 Error |

Each scenario has a **realistic delay** (100ms – 3000ms) and a **real JSON response body**.

---

### 2. NetworkInterceptor (interceptor.js)
Simulates the iOS SDK's network hook layer.

```
You click button
      ↓
interceptor.intercept()
      ↓
  Emits "request-captured"   ← before network (interceptor dot pulses)
      ↓
  Picks weighted random scenario
      ↓
  Waits simulated network delay
      ↓
  Emits "response-received"  ← passes to LogManager
```

In a real iOS SDK, this module wraps `URLSession` / `Alamofire` and hooks into every outbound network call automatically.

---

### 3. LogManager — Privacy Masking + AI Analysis (logManager.js)

**Privacy Masking** — strips sensitive values before storing or displaying:

| Field | Masked To |
|---|---|
| `Authorization: Bearer eyJ...` | `Authorization: *****` |
| `password: "mySecret"` | `password: *****` |
| `access_token: "abc123"` | `access_token: *****` |
| `refresh_token: "ref_xyz"` | `refresh_token: *****` |
| `device_token: "FCM_..."` | `device_token: *****` |
| `x-api-key`, `cookie`, `x-auth-token` | `*****` |

**AI Analysis Engine** — maps every response to a human-readable insight:

| Condition | Severity | Insight |
|---|---|---|
| `status === 401` | ⚠️ Warning | Authentication Issue — token expired |
| `status === 403` | ⚠️ Warning | Authorization Failure — insufficient permissions |
| `status === 404` | ℹ️ Info | Resource Not Found — check endpoint/ID |
| `status === 429` | ⚠️ Warning | Rate Limit Exceeded — implement back-off |
| `status >= 500` | 🔥 Critical | Server Error Detected — check backend logs |
| `responseTime > 1500ms` | ⚡ Warning | Performance Issue — exceeds threshold |
| `status 2xx + fast` | ✅ Success | Request Successful — all systems nominal |

---

### 4. Live Dashboard UI (ui.js)

- **Real-time log table** — rows slide in with animation as requests complete
- **Stats row** — Total Requests, Success Rate, Errors, Avg Response Time (all live-updating)
- **Status color coding** — Green (2xx), Yellow (4xx), Red (5xx)
- **Response time bar** — visual bar + color (green/yellow/red by speed)
- **Error badge** — bell icon counter increments on every non-2xx response
- **Live clock** — real-time timestamp in topbar
- **Interceptor pulse** — SDK status dot flashes blue when a request is captured

---

### 5. Detail Panel
Click any log row → panel slides in from the right showing:

1. **AI Analysis** — colored card with icon, title, severity, full diagnosis text
2. **Request Lifecycle Timeline** — 4 stages with timestamps:
   - `+0ms` Request Captured (NetworkInterceptor hook)
   - `+Xms` Network Transit (TLS + transfer)
   - `+Xms` Response Received (HTTP status + body decoded)
   - `+Xms` AI Analysis Complete (LogManager processed)
3. **Request Details** — method, endpoint, request ID, timestamp, headers (masked), body (masked)
4. **Response Details** — status badge, response time, response headers, JSON body
5. **Syntax-highlighted JSON** — blue keys, green strings, pink numbers, purple booleans, amber masked values

---

### 6. Controls

| Control | Action |
|---|---|
| **Simulate API Call** | Fire 1 random request with loading state |
| **Burst Mode (5×)** | Fire 5 requests staggered 300ms apart |
| **Clear Logs** | Wipe all logs and reset stats |
| **Filter pills** (All / 2xx / 4xx / 5xx / Slow) | Filter table by response category |
| **Search box** | Search across endpoint, method, status, name |
| **Click any row** | Open detail panel |
| **Escape key** | Close detail panel |

---

## File Structure

```
webIspyAI/
├── index.html          ← App shell, layout, SDK bootstrap
├── css/
│   └── styles.css      ← Dark professional theme, animations
└── js/
    ├── interceptor.js  ← NetworkInterceptor — captures & simulates calls
    ├── logManager.js   ← Privacy masking + AI analysis + log storage
    └── ui.js           ← Live rendering, detail panel, filters, stats
```

---

## Architecture

### Module Communication (Event-Driven)

```
index.html (bootstrap)
    │
    ├── new NetworkInterceptor()
    ├── new LogManager()
    └── new UI()
         │
         interceptor.on('response-received') → logManager.addLog()
         logManager.on('log-added')          → ui._onLogAdded()
         logManager.on('error-count-changed')→ ui._updateErrorBadge()
         interceptor.on('request-captured')  → ui._onRequestCaptured()
```

Each module is **completely decoupled** — they communicate only through events. This mirrors real production SDK architecture where components can be swapped independently.

---

## How It Would Work in Real Production

This web app is the **dashboard / viewer** layer. In a real production deployment:

```
┌─────────────────────────────┐
│   iOS App (Swift)           │
│   + iSpyAI Swift SDK        │
│     └── URLSession hook     │  ← intercepts real HTTP calls
│         captures real calls │
└────────────┬────────────────┘
             │ HTTPS / WebSocket
             ▼
┌─────────────────────────────┐
│   Backend Server            │
│   (Node.js / Python)        │  ← receives logs, stores to DB
│   Receives + broadcasts logs│
└────────────┬────────────────┘
             │ WebSocket push
             ▼
┌─────────────────────────────┐
│   This Web Dashboard        │  ← what this repo is
│   LogManager + UI           │
│   Shows real live traffic   │
└─────────────────────────────┘
```

To connect real data, replace the simulated `interceptor.intercept()` call with a WebSocket listener:

```javascript
const socket = new WebSocket('wss://your-server.com/logs');
socket.onmessage = (event) => {
  const entry = JSON.parse(event.data);  // Real log from real iOS device
  logManager.addLog(entry);              // LogManager + UI work unchanged
};
```

`logManager.js` and `ui.js` require **zero changes** for real data — they work on any log entry regardless of source.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 (semantic) |
| Styling | CSS3 (custom properties, animations, flexbox/grid) |
| Logic | Vanilla JavaScript ES6+ (classes, async/await, IIFE modules) |
| Fonts | System font stack (SF Pro / Segoe UI / Inter) |
| Icons | Inline SVG |
| Dependencies | **None** |

---

## Design Decisions

- **No framework** — SDKs must be lightweight and portable. Zero dependency risk.
- **IIFE module pattern** — Each JS file exports one class via IIFE, mimicking SDK module isolation.
- **Event-driven architecture** — Components decoupled via `.on()` / `_emit()` — same pattern as real iOS NotificationCenter.
- **Weighted random scenarios** — More realistic than round-robin; mimics real-world traffic distributions.
- **Privacy-first** — Sensitive data is masked at the LogManager layer, never stored raw.

---

## Author

**Isha Ansari** — [@IshaAnsari77](https://github.com/IshaAnsari77)

---

## License

MIT — free to use, modify, and distribute.
