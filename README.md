# CowAgent-Puter

A controlled web workspace for integrating Puter.com authentication and Puter AI with a future CowAgent runtime.

## Run immediately

Requirements: Python 3.9+ and a browser.

```bash
python -m http.server 8080 --directory web
```

Open http://localhost:8080 and click **เข้าสู่ระบบด้วย Puter**.

> Do not open `web/index.html` directly with `file://`; browser popup/auth and SDK features require HTTP(S).

## Current scope

- Puter.com sign-in/sign-out in the browser
- Puter AI chat with a polished responsive UI
- Local browser chat history (no passwords or Puter tokens are stored by this app)
- Clear seam for adding our own gateway, memory, tools, and agent runtime

## Architecture

```text
web/                 Browser UI and Puter client integration
core/                Application contracts and local session model
models/              Model-provider contracts
memory/              Memory-store contract
 tools/              Tool permission policy
```

Puter authentication is intentionally kept in the browser. This repository must not receive or persist Puter passwords, cookies, or auth tokens.

## Next integration steps

1. Add the CowAgent source as an upstream-controlled import or adapter.
2. Route authenticated web messages through our gateway when tools/memory are enabled.
3. Keep direct Puter chat as the safe fallback until the server-side integration is explicitly designed.
