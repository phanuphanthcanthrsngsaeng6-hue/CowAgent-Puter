from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from pathlib import Path
import os, subprocess, json, shlex

ROOT_DIR = Path(__file__).resolve().parents[1]
WORKSPACE_DIR = ROOT_DIR

app = FastAPI(title="CowAgent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_OPTIONS = [
    "gpt-4o-mini",
    "gpt-4o",
    "claude-3-5-sonnet",
    "gemini-2.0-flash",
    "x-ai/grok-3-mini",
    "ollama/llama3",
]

class ChatRequest(BaseModel):
    model: str = "gpt-4o-mini"
    messages: List[Dict[str, str]] = Field(default_factory=list)
    prompt: Optional[str] = None

class SearchRequest(BaseModel):
    query: str
    path: str = str(WORKSPACE_DIR)

@app.get("/api/health")
def health():
    return {"status": "ok", "repo": str(ROOT_DIR)}

@app.get("/api/models")
def models():
    return {"models": MODEL_OPTIONS}

@app.post("/api/chat")
def chat(request: ChatRequest):
    text = request.prompt or (request.messages[-1]["content"] if request.messages else "")
    if not text:
        raise HTTPException(400, detail="No prompt provided")

    reply = (
        f"[{request.model}] I received your message: \n\n{text}\n\n"
        "I can help with repo inspection, code search, Git status, and sandbox execution."
    )

    return {
        "reply": reply,
        "model": request.model,
        "provider": "backend_fallback",
    }

@app.get("/api/workspace/files")
def workspace_files():
    items = []
    for path, dirs, files in os.walk(WORKSPACE_DIR):
        rel = os.path.relpath(path, WORKSPACE_DIR)
        if rel == ".":
            rel = ""
        dirs[:] = sorted(d for d in dirs if d not in {".git", "node_modules", ".venv", "dist", "build"})
        for fname in sorted(files):
            p = Path(path) / fname
            items.append({
                "path": str(p.relative_to(WORKSPACE_DIR)).replace("\\", "/"),
                "name": fname,
                "type": "file",
            })
        for d in sorted(dirs):
            dpath = Path(path) / d
            items.append({
                "path": str(dpath.relative_to(WORKSPACE_DIR)).replace("\\", "/"),
                "name": d,
                "type": "dir",
            })
    return {"items": items[:200]}

@app.post("/api/workspace/search")
def workspace_search(req: SearchRequest):
    query = req.query.strip()
    if not query:
        raise HTTPException(400, detail="Query is empty")
    target = req.path or str(WORKSPACE_DIR)
    try:
        result = subprocess.run(
            ["rg", "-n", "-i", query, target],
            capture_output=True,
            text=True,
            timeout=20,
            shell=False,
        )
        stdout = result.stdout.strip()
        return {
            "query": query,
            "path": target,
            "count": len(stdout.splitlines()) if stdout else 0,
            "results": stdout.splitlines()[:80],
            "returncode": result.returncode,
        }
    except FileNotFoundError:
        return {"query": query, "path": target, "count": 0, "results": ["rg is not installed on this machine."], "returncode": 127}
    except subprocess.TimeoutExpired:
        raise HTTPException(504, detail="Search timed out")

@app.get("/api/git/status")
def git_status():
    try:
        result = subprocess.run(["git", "-C", str(ROOT_DIR), "status", "--short"], capture_output=True, text=True, timeout=20)
        return {"status": result.stdout.strip().splitlines() if result.stdout.strip() else [], "returncode": result.returncode}
    except FileNotFoundError:
        raise HTTPException(500, detail="git is not installed")

@app.post("/api/git/commit")
def git_commit(payload: Dict[str, Any]):
    message = payload.get("message", "CowAgent update")
    try:
        subprocess.run(["git", "-C", str(ROOT_DIR), "add", "."], check=True, capture_output=True, text=True, timeout=30)
        result = subprocess.run(["git", "-C", str(ROOT_DIR), "commit", "-m", message], capture_output=True, text=True, timeout=30)
        return {
            "ok": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }
    except subprocess.CalledProcessError as exc:
        return {
            "ok": False,
            "stdout": exc.stdout,
            "stderr": exc.stderr,
            "returncode": exc.returncode,
        }
    except FileNotFoundError:
        raise HTTPException(500, detail="git is not installed")

@app.post("/api/sandbox/run")
def sandbox_run(payload: Dict[str, Any]):
    command = payload.get("command", "echo sandbox-ready")
    if not command:
        raise HTTPException(400, detail="No command provided")
    try:
        result = subprocess.run(["docker", "run", "--rm", "alpine:3.20", "sh", "-lc", command], capture_output=True, text=True, timeout=30)
        return {
            "ok": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }
    except FileNotFoundError:
        return {"ok": False, "stdout": "", "stderr": "Docker is not installed or not available on this machine.", "returncode": 127}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
