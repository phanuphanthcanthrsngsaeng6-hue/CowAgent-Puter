from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import json
import os
import shlex
import sqlite3
import subprocess
import time
import uuid

ROOT_DIR = Path(__file__).resolve().parents[1]
DB_PATH = ROOT_DIR / "cowagent.db"
EXCLUDED = {".git", "node_modules", ".venv", "dist", "build", "__pycache__"}
MODEL_OPTIONS = ["gpt-4o-mini", "gpt-4o", "claude-3-5-sonnet", "gemini-2.0-flash", "x-ai/grok-3-mini", "ollama/llama3"]

app = FastAPI(title="CowAgent API", version="0.3.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class ChatRequest(BaseModel):
    model: str = "gpt-4o-mini"
    conversation_id: Optional[str] = None
    messages: List[Dict[str, str]] = Field(default_factory=list)
    prompt: Optional[str] = None

class SearchRequest(BaseModel):
    query: str
    path: str = "."

class ApprovalRequest(BaseModel):
    action: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    conversation_id: Optional[str] = None

class ApprovalDecisionRequest(BaseModel):
    decision: str
    note: Optional[str] = None

def now(): return datetime.now(timezone.utc).isoformat()
def db():
    c = sqlite3.connect(DB_PATH); c.row_factory = sqlite3.Row; return c

def init_db():
    c = db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,title TEXT,model TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT,role TEXT,content TEXT,created_at TEXT);
    CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,action TEXT,payload TEXT,conversation_id TEXT,status TEXT,created_at TEXT,resolved_at TEXT,note TEXT);
    """)
    c.commit(); c.close()
init_db()

def safe_path(value: str) -> Path:
    p = Path(value)
    p = p if p.is_absolute() else ROOT_DIR / p
    p = p.resolve()
    try: p.relative_to(ROOT_DIR.resolve())
    except ValueError: raise HTTPException(400, detail="Path is outside workspace")
    return p

def new_conversation(model="gpt-4o-mini", title="New chat"):
    cid, ts = str(uuid.uuid4()), now(); c = db()
    c.execute("INSERT INTO conversations VALUES(?,?,?,?,?)", (cid,title,model,ts,ts)); c.commit(); c.close(); return cid

def add_message(cid, role, content):
    c = db(); c.execute("INSERT INTO messages VALUES(?,?,?,?,?)", (str(uuid.uuid4()),cid,role,content,now())); c.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now(),cid)); c.commit(); c.close()

def fallback_reply(text, model):
    return f"[{model}] รับข้อความแล้วครับ\n\n{text}\n\nผมช่วยค้นไฟล์ อ่านโค้ด ตรวจ Git และรัน Docker Sandbox ได้ครับ การเขียนไฟล์ต้องกดยืนยันก่อนเสมอ"

@app.get("/api/health")
def health(): return {"status":"ok","version":"0.3.0"}
@app.get("/api/models")
def models(): return {"models": MODEL_OPTIONS}

@app.get("/api/conversations")
def conversations():
    c=db(); rows=c.execute("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 50").fetchall(); c.close(); return {"conversations":[dict(r) for r in rows]}
@app.post("/api/conversations")
def create_conversation(payload: Dict[str,Any]= {}):
    cid=new_conversation(payload.get("model","gpt-4o-mini"),payload.get("title","New chat")); return {"conversation_id":cid}
@app.get("/api/conversations/{cid}/messages")
def messages(cid: str):
    c=db(); rows=c.execute("SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at",(cid,)).fetchall(); c.close(); return {"messages":[dict(r) for r in rows]}

@app.post("/api/chat")
def chat(req: ChatRequest):
    text=req.prompt or (req.messages[-1].get("content","") if req.messages else "")
    if not text: raise HTTPException(400,"No prompt provided")
    cid=req.conversation_id or new_conversation(req.model,text[:40]); add_message(cid,"user",text)
    reply=fallback_reply(text,req.model); add_message(cid,"assistant",reply)
    return {"reply":reply,"model":req.model,"conversation_id":cid}

@app.post("/api/chat/stream")
def chat_stream(req: ChatRequest):
    text=req.prompt or (req.messages[-1].get("content","") if req.messages else "")
    if not text: raise HTTPException(400,"No prompt provided")
    cid=req.conversation_id or new_conversation(req.model,text[:40]); add_message(cid,"user",text)
    reply=fallback_reply(text,req.model)
    def events():
        built=""
        for word in reply.split(" "):
            built += (" " if built else "") + word
            yield f"data: {json.dumps({'delta': word + ' ', 'conversation_id': cid}, ensure_ascii=False)}\n\n"; time.sleep(.025)
        add_message(cid,"assistant",reply)
        yield f"event: done\ndata: {json.dumps({'conversation_id':cid})}\n\n"
    return StreamingResponse(events(),media_type="text/event-stream",headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@app.get("/api/workspace/files")
def files():
    out=[]
    for base, dirs, names in os.walk(ROOT_DIR):
        dirs[:]=[d for d in dirs if d not in EXCLUDED]
        for name in sorted(names):
            p=Path(base)/name
            try: out.append({"path":str(p.relative_to(ROOT_DIR)).replace("\\","/")})
            except ValueError: pass
            if len(out)>=500: return {"items":out}
    return {"items":out}

@app.get("/api/workspace/read_file")
def read_file(path: str):
    p=safe_path(path)
    if not p.is_file(): raise HTTPException(404,"File not found")
    try: content=p.read_text(encoding="utf-8")
    except UnicodeDecodeError: raise HTTPException(415,"Binary file")
    return {"path":str(p.relative_to(ROOT_DIR)).replace("\\","/"),"content":content}

@app.post("/api/workspace/search")
def search(req: SearchRequest):
    target=safe_path(req.path or ".")
    try:
        r=subprocess.run(["rg","-n","-i","--glob","!.git/**",req.query,str(target)],capture_output=True,text=True,timeout=20)
        return {"results":r.stdout.splitlines()[:100],"count":len(r.stdout.splitlines())}
    except FileNotFoundError: return {"results":["Install ripgrep (rg) to enable search."],"count":0}

@app.get("/api/git/status")
def git_status():
    r=subprocess.run(["git","-C",str(ROOT_DIR),"status","--short"],capture_output=True,text=True); return {"status":r.stdout.splitlines()}

@app.post("/api/approvals")
def approval(req: ApprovalRequest):
    if req.action not in {"write_file","git_commit"}: raise HTTPException(400,"Unsupported approval action")
    aid=str(uuid.uuid4()); c=db(); c.execute("INSERT INTO approvals VALUES(?,?,?,?,?,?,?,?)",(aid,req.action,json.dumps(req.payload),req.conversation_id,"pending",now(),None,None)); c.commit(); c.close(); return {"id":aid,"status":"pending","action":req.action,"payload":req.payload}

@app.post("/api/approvals/{aid}/decision")
def decision(aid: str, req: ApprovalDecisionRequest):
    c=db(); row=c.execute("SELECT * FROM approvals WHERE id=?",(aid,)).fetchone()
    if not row: c.close(); raise HTTPException(404,"Approval not found")
    approved=req.decision.lower() in {"approve","approved","yes"}
    if approved and row["action"]=="write_file":
        payload=json.loads(row["payload"]); p=safe_path(payload.get("path","")); p.parent.mkdir(parents=True,exist_ok=True); p.write_text(payload.get("content",""),encoding="utf-8")
    if approved and row["action"]=="git_commit":
        msg=json.loads(row["payload"]).get("message","CowAgent update")
        subprocess.run(["git","-C",str(ROOT_DIR),"add","."],check=True); subprocess.run(["git","-C",str(ROOT_DIR),"commit","-m",msg],check=True,capture_output=True,text=True)
    status="approved" if approved else "rejected"; c.execute("UPDATE approvals SET status=?,resolved_at=?,note=? WHERE id=?",(status,now(),req.note,aid)); c.commit(); c.close(); return {"id":aid,"status":status}

@app.post("/api/sandbox/run")
def sandbox(payload: Dict[str,Any]):
    command=str(payload.get("command","echo sandbox-ready")).strip()
    if not command: raise HTTPException(400,"No command")
    args=["docker","run","--rm","--network","none","--cpus","1","--memory","512m","--pids-limit","128","--read-only","--tmpfs","/tmp:rw,noexec,nosuid,size=64m","--cap-drop","ALL","--security-opt","no-new-privileges","alpine:3.20","/bin/sh","-lc",command]
    try:
        r=subprocess.run(args,capture_output=True,text=True,timeout=min(int(payload.get("timeout",30)),120)); return {"ok":r.returncode==0,"stdout":r.stdout,"stderr":r.stderr,"returncode":r.returncode}
    except FileNotFoundError: return {"ok":False,"stdout":"","stderr":"Docker is not installed or unavailable.","returncode":127}
    except subprocess.TimeoutExpired: return {"ok":False,"stdout":"","stderr":"Sandbox timeout","returncode":124}

if __name__=="__main__":
    import uvicorn; uvicorn.run("main:app",host="0.0.0.0",port=8000,reload=True)
