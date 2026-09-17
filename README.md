# CowAgent full-stack scaffold

## New features

- Puter login and user-selected model
- Streaming chat via Puter, with FastAPI SSE fallback
- Persistent SQLite conversations/messages
- Repository file list and file viewer
- Write-file approval modal; writes are only performed after approval
- Docker sandbox with no network, read-only root filesystem, dropped capabilities, memory/CPU/PID limits, and a timeout

## Run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. Docker must be installed and running for the isolated sandbox button. The Puter SDK is loaded by the frontend and login/model selection happen in the browser.

## Important security notes

- Review file changes in the approval modal before approving.
- The sandbox uses an isolated Alpine container with network disabled and resource limits. Do not expose the backend publicly without adding authentication and an origin allowlist.
- The backend is a local development scaffold, not a production-hosted security boundary.
