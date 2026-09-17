from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from pathlib import Path
import os, subprocess, json, sqlite3, uuid, time
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).resolve().parents[1]
WORKSPACE_DIR = ROOT_DIR
DB_PATH = ROOT_DIR / "cowagent.db"

app = FastAPI(title="CowAgent API", version="0.2.0")

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
    conversation_id: Optional[str] = None
    messages: List[Dict[str, str]] = Field(default_factory=list)
    prompt: Optional[str] = None


class SearchRequest(BaseModel):
    query: str
    path: str = str(WORKSPACE_DIR)


class ApprovalRequest(BaseModel):
    action: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    conversation_id: Optional[str] = None


class ApprovalDecisionRequest(BaseModel):
    decision: str
    note: Optional[str] = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT,
            model TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(conversation_id) REFERENCES conversations(id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS approvals (
            id TEXT PRIMARY KEY,
            action TEXT NOT NULL,
            payload TEXT NOT NULL,
            conversation_id TEXT,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            resolved_at TEXT,
            note TEXT
        )
        """
    )
    conn.commit()
    conn.close()


init_db()


def create_conversation(model: str = "gpt-4o-mini", title: Optional[str] = None) -> str:
    cid = str(uuid.uuid4())
    ts = utc_now()
    conn = get_db()
    conn.execute(
        "INSERT INTO conversations (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (cid, title or "New chat", model, ts, ts),
    )
    conn.commit()
    conn.close()
    return cid


def get_conversation_list() -> List[Dict[str, Any]]:
    conn = get_db()
    rows = conn.execute(
        "SELECT id, title, model, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 30"
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def append_message(conversation_id: str, role: str, content: str) -> str:
    msg_id = str(uuid.uuid4())
    ts = utc_now()
    conn = get_db()
    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        (msg_id, conversation_id, role, content, ts),
    )
    conn.execute(
        "UPDATE conversations SET updated_at = ? WHERE id = ?",
        (ts, conversation_id),
    )
    conn.commit()
    conn.close()
    return msg_id


def get_messages(conversation_id: str) -> List[Dict[str, Any]]:
    conn = get_db()
    rows = conn.execute(
        "SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conversation_id,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def create_approval(action: str, payload: Dict[str, Any], conversation_id: Optional[str] = None) -> Dict[str, Any]:
    aid = str(uuid.uuid4())
    ts = utc_now()
    conn = get_db()
    conn.execute(
        "INSERT INTO approvals (id, action, payload, conversation_id, status, created_at, resolved_at, note) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)",
        (aid, action, json.dumps(payload, ensure_ascii=False), conversation_id, "pending", ts),
    )
    conn.commit()
    conn.close()
    return {"id": aid, "action": action, "payload": payload, "status": "pending", "conversation_id": conversation_id}


def resolve_approval(approval_id: str, decision: str, note: Optional[str] = None) -> Dict[str, Any]:
    conn = get_db()
    row = conn.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, detail="Approval not found")

    approved = decision.lower() == "approve"
    resolved = utc_now()
    if approved and row["action"] == "write_file":
        payload = json.loads(row["payload"])
        target = payload.get("path")
        content = payload.get("content", "")
        target_path = Path(target)
        if not target_path.is_absolute():
            target_path = (WORKSPACE_DIR / target_path).resolve()
        try:
            target_path.relative_to(WORKSPACE_DIR.resolve())
        except ValueError:
            conn.close()
            raise HTTPException(400, detail="Path is outside workspace")
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(content, encoding="utf-8")

    conn.execute(
        "UPDATE approvals SET status = ?, resolved_at = ?, note = ? WHERE id = ?",
        ("approved" if approved else "rejected", resolved, note, approval_id),
    )
    conn.commit()
    conn.close()
    return {"id": approval_id, "status": "approved" if approved else "rejected", "note": note}


@app.get("/api/health")
def health():
    return {"status": "ok", "repo": str(ROOT_DIR), "db": str(DB_PATH)}


@app.get("/api/models")
def models():
    return {"models": MODEL_OPTIONS}


@app.get("/api/conversations")
def conversations():
    return {"conversations": get_conversation_list()}


@app.post("/api/conversations")
def create_conversation_endpoint(payload: Dict[str, Any] = {}):
    title = payload.get("title") or "New chat"
    model = payload.get("model") or "gpt-4o-mini"
    cid = create_conversation(model=model, title=title)
    return {"conversation_id": cid, "title": title, "model": model}


@app.get("/api/conversations/{conversation_id}/messages")
def conversation_messages(conversation_id: str):
    return {"conversation_id": conversation_id, "messages": get_messages(conversation_id)}


@app.post("/api/chat")
def chat(request: ChatRequest):
    text = request.prompt or (request.messages[-1]["content"] if request.messages else "")
    if not text:
        raise HTTPException(400, detail="No prompt provided")

    cid = request.conversation_id or create_conversation(model=request.model, title=text[:40])
    append_message(cid, "user", text)

    reply = (
        f"[{request.model}] I received your request: \n\n{text}\n\n"
        "I can help with repo inspection, code search, Git status, and sandbox execution. "
        "If you want a file write or commit, I can create an approval step first."
    )
    append_message(cid, "assistant", reply)

    return {
        "reply": reply,
        "model": request.model,
        "provider": "backend_fallback",
        "conversation_id": cid,
    }


@app.get("/api/chat/stream")
def chat_stream():
    def event_stream():
        for i in range(3):
            payload = json.dumps({"chunk": f"stream-message-{i}", "index": i}, ensure_ascii=False)
            yield f"data: {payload}\n\n"
            time.sleep(0.2)
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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


@app.get("/api/workspace/read_file")
def read_file(path: str):
    target = Path(path)
    if not target.is_absolute():
        target = (WORKSPACE_DIR / target).resolve()
    try:
        target.relative_to(WORKSPACE_DIR.resolve())
    except ValueError:
        raise HTTPException(400, detail="Path is outside workspace")
    if not target.exists() or not target.is_file():
        raise HTTPException(404, detail="File not found")
    return {"path": str(target.relative_to(WORKSPACE_DIR)), "content": target.read_text(encoding="utf-8")}


@app.post("/api/workspace/write_file")
def write_file(payload: Dict[str, Any]):
    path = payload.get("path")
    content = payload.get("content", "")
    if not path:
        raise HTTPException(400, detail="Missing path")
    target = Path(path)
    if not target.is_absolute():
        target = (WORKSPACE_DIR / target).resolve()
    try:
        target.relative_to(WORKSPACE_DIR.resolve())
    except ValueError:
        raise HTTPException(400, detail="Path is outside workspace")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"ok": True, "path": str(target.relative_to(WORKSPACE_DIR)), "bytes": len(content.encode("utf-8"))}


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


@app.post("/api/approvals")
def create_approval_route(req: ApprovalRequest):
    return create_approval(req.action, req.payload, req.conversation_id)


@app.post("/api/approvals/{approval_id}/decision")
def approval_decision(approval_id: str, req: ApprovalDecisionRequest):
    return resolve_approval(approval_id, req.decision, req.note)


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

