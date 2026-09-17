import { useEffect, useMemo, useState } from 'react';
import { AssistantRuntimeProvider, Thread, useLocalRuntime } from '@assistant-ui/react';
import './styles.css';

const DEFAULT_MODELS = ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet', 'gemini-2.0-flash', 'x-ai/grok-3-mini', 'ollama/llama3'];
const STORAGE_KEY = 'cowagent-assistant-ui-v1';

function readState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      model: value?.model || DEFAULT_MODELS[0],
      personality: value?.personality || 'ผู้ช่วยเขียนโค้ด',
      openFiles: Array.isArray(value?.openFiles) ? value.openFiles : [],
      activeFile: value?.activeFile || '',
      fileContents: value?.fileContents || {},
      sandboxCommand: value?.sandboxCommand || 'echo sandbox-ready && uname -a',
    };
  } catch {
    return { model: DEFAULT_MODELS[0], personality: 'ผู้ช่วยเขียนโค้ด', openFiles: [], activeFile: '', fileContents: {}, sandboxCommand: 'echo sandbox-ready && uname -a' };
  }
}

function createPuterModel(model, personality) {
  return {
    async *run({ messages, abortSignal }) {
      const puter = window.puter;
      if (!puter?.ai?.chat) {
        yield { content: [{ type: 'text', text: 'ไม่พบ Puter AI กรุณาโหลด SDK และเข้าสู่ระบบก่อนใช้งาน' }] };
        return;
      }
      const result = await puter.ai.chat(
        messages.map((message) => ({ role: message.role, content: message.content?.map?.((part) => part.text || '').join('') || String(message.content || '') })),
        { model, stream: true, signal: abortSignal },
      );
      let previous = '';
      if (result?.[Symbol.asyncIterator]) {
        for await (const chunk of result) {
          if (abortSignal?.aborted) return;
          const raw = chunk?.text ?? chunk?.delta ?? chunk?.message?.content ?? chunk?.content ?? '';
          const text = Array.isArray(raw) ? raw.map((part) => part?.text || '').join('') : String(raw || '');
          const delta = text.startsWith(previous) ? text.slice(previous.length) : (text === previous ? '' : text);
          if (!delta) continue;
          previous += delta;
          yield { content: [{ type: 'text', text: delta }] };
        }
        return;
      }
      const raw = result?.message?.content || result?.content || '';
      yield { content: [{ type: 'text', text: Array.isArray(raw) ? raw.map((part) => part?.text || '').join('') : String(raw) }] };
    },
  };
}

function WorkspaceTools() {
  const stored = useMemo(readState, []);
  const [model, setModel] = useState(stored.model);
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [personality, setPersonality] = useState(stored.personality);
  const [files, setFiles] = useState([]);
  const [openFiles, setOpenFiles] = useState(stored.openFiles);
  const [activeFile, setActiveFile] = useState(stored.activeFile);
  const [fileContents, setFileContents] = useState(stored.fileContents);
  const [sandboxCommand, setSandboxCommand] = useState(stored.sandboxCommand);
  const [sandboxOutput, setSandboxOutput] = useState('');
  const [approval, setApproval] = useState(null);
  const [user, setUser] = useState(null);
  const runtime = useLocalRuntime(createPuterModel(model, personality));

  useEffect(() => {
    fetch('/api/models').then((response) => response.json()).then((data) => setModels(data.models || DEFAULT_MODELS)).catch(() => {});
    fetch('/api/workspace/files').then((response) => response.json()).then((data) => setFiles(data.items || [])).catch(() => {});
    if (window.puter?.auth?.isSignedIn?.()) window.puter.auth.getUser().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ model, personality, openFiles, activeFile, fileContents, sandboxCommand }));
  }, [model, personality, openFiles, activeFile, fileContents, sandboxCommand]);

  const login = async () => {
    if (!window.puter?.auth) return alert('Puter SDK ยังไม่พร้อม');
    if (!window.puter.auth.isSignedIn?.()) await window.puter.auth.signIn();
    setUser(await window.puter.auth.getUser());
  };

  const openFile = async (path) => {
    setActiveFile(path);
    setOpenFiles((current) => current.includes(path) ? current : [...current, path].slice(-12));
    if (Object.prototype.hasOwnProperty.call(fileContents, path)) return;
    const response = await fetch(`/api/workspace/read_file?path=${encodeURIComponent(path)}`);
    const data = await response.json();
    setFileContents((current) => ({ ...current, [path]: data.content || data.detail || '' }));
  };

  const requestWrite = async () => {
    if (!activeFile) return;
    const response = await fetch('/api/approvals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'write_file', payload: { path: activeFile, content: fileContents[activeFile] || '' } }) });
    setApproval(await response.json());
  };

  const decide = async (approved) => {
    await fetch(`/api/approvals/${approval.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: approved ? 'approve' : 'reject' }) });
    setApproval(null);
  };

  const runSandbox = async () => {
    const response = await fetch('/api/sandbox/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: sandboxCommand }) });
    const data = await response.json();
    setSandboxOutput(data.stdout || data.stderr || 'ไม่มีผลลัพธ์');
  };

  return <AssistantRuntimeProvider runtime={runtime}>
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark">C</div><div><div className="brand-name">CowAgent</div><div className="brand-sub">assistant-ui + Puter</div></div></div>
        <div className="account-box"><div className="status-pill">{user ? 'ออนไลน์' : 'ยังไม่ได้เข้าสู่ระบบ'}</div><button className="primary-btn" onClick={login}>{user ? `เชื่อมต่อ: ${user.username || user.email || 'Puter'}` : 'เข้าสู่ระบบ Puter'}</button></div>
        <label className="settings-label">โมเดล<select value={model} onChange={(event) => setModel(event.target.value)}>{models.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="settings-label">บุคลิกภาพ<input value={personality} onChange={(event) => setPersonality(event.target.value)} /></label>
        <div className="recent-files"><div className="section-title">ไฟล์ล่าสุด</div>{openFiles.length ? openFiles.slice().reverse().map((path) => <button className={`file-chip ${activeFile === path ? 'selected' : ''}`} key={path} onClick={() => openFile(path)}>📄 {path}</button>) : <span className="muted">ยังไม่มีไฟล์ที่เปิด</span>}</div>
      </aside>
      <main className="main-panel">
        <header className="topbar"><div><div className="eyebrow">AI WORKSPACE</div><h1>Chat + Repo + Sandbox</h1></div><span className="runtime-badge">assistant-ui จริง</span></header>
        <div className="content-grid">
          <section className="chat-panel"><div className="chat-header"><span>ผู้ช่วย CowAgent</span><span className="muted">Puter streaming</span></div><div className="assistant-thread"><Thread /></div></section>
          <aside className="tools-panel">
            <section className="tool-card"><div className="tool-title">ตัวแก้ไขไฟล์</div><select value={activeFile} onChange={(event) => event.target.value && openFile(event.target.value)}><option value="">เลือกไฟล์ใน repo</option>{files.map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}</select><textarea className="code-editor" value={activeFile ? fileContents[activeFile] || '' : ''} onChange={(event) => activeFile && setFileContents((current) => ({ ...current, [activeFile]: event.target.value }))} placeholder="เลือกไฟล์เพื่อดูเนื้อหา" /><button className="small-btn" disabled={!activeFile} onClick={requestWrite}>ขออนุมัติบันทึกไฟล์</button></section>
            <section className="tool-card"><div className="tool-title">Docker Sandbox</div><textarea value={sandboxCommand} onChange={(event) => setSandboxCommand(event.target.value)} /><button className="small-btn" onClick={runSandbox}>▶ รันแบบแยกส่วน</button><pre>{sandboxOutput || 'ผลลัพธ์จะแสดงตรงนี้'}</pre></section>
          </aside>
        </div>
      </main>
      {approval && <div className="modal-backdrop"><div className="approval-modal"><h2>ยืนยันการเขียนไฟล์</h2><p>{approval.payload?.path}</p><pre>{approval.payload?.content}</pre><div className="modal-actions"><button className="small-btn danger" onClick={() => decide(false)}>ปฏิเสธ</button><button className="small-btn accept" onClick={() => decide(true)}>อนุมัติ</button></div></div></div>}
    </div>
  </AssistantRuntimeProvider>;
}

export default function App() { return <WorkspaceTools />; }
