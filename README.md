# CowAgent Full-Stack Scaffold

This repository now includes a minimal working scaffold for a full-stack AI workspace using:

- Frontend: React + Vite
- Backend: Python + FastAPI
- LLM access: Puter AI via browser SDK
- Repo tools: workspace search and git status
- Sandbox: Docker placeholder endpoint
- Storage: SQLite-ready backend structure

## Run it locally

### 1) Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Backend runs on:

- http://localhost:8000

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

- http://localhost:3000

## Key endpoints

- GET /api/health
- GET /api/models
- POST /api/chat
- GET /api/workspace/files
- POST /api/workspace/search
- GET /api/git/status
- POST /api/git/commit
- POST /api/sandbox/run

## Notes

- Puter login is handled directly in the browser from the frontend.
- The backend acts as the repo and sandbox control layer.
- Docker sandbox is a ready placeholder; it will return a graceful message if Docker is unavailable.
- This scaffold is intentionally minimal so it is safe to extend into a real multi-agent coding workspace.
