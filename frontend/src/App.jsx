import { useEffect, useState } from 'react';

const DEFAULT_MODELS = ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet', 'gemini-2.0-flash', 'x-ai/grok-3-mini', 'ollama/llama3'];
const PERSISTENCE_KEY = 'cowagent-workspace-state-v1';
const DEFAULT_MESSAGE = { role: 'assistant', content: 'สวัสดีครับ 👋\nเข้าสู่ระบบ Puter เลือกโมเดล แล้วคุยกับผมได้เลยครับ' };

function loadWorkspaceState() {
  try {
    const saved = JSON.parse(localStorage.getItem(PERSISTENCE_KEY));
    return {
      messages: Array.isArray(saved?.messages) && saved.messages.length ? saved.messages : [DEFAULT_MESSAGE],
      openFiles: Array.isArray(saved?.openFiles) ? saved.openFiles : [],
      selectedFile: typeof saved?.selectedFile === 'string' ? saved.selectedFile : '',
      fileContent: typeof saved?.fileContent === 'string' ? saved.fileContent : '',
      model: typeof saved?.model === 'string' ? saved.model : DEFAULT_MODELS[0],
      sandboxCommand: typeof saved?.sandboxCommand === 'string' ? saved.sandboxCommand : 'echo sandbox-ready && uname -a',
    };
  } catch (_) {
    return { messages: [DEFAULT_MESSAGE], openFiles: [], selectedFile: '', fileContent: '', model: DEFAULT_MODELS[0], sandboxCommand: 'echo sandbox-ready && uname -a' };
  }
}

export default function App() {
  const initial = loadWorkspaceState();
  const [messages, setMessages] = useState(initial.messages);
  const [model, setModel] = useState(initial.model);
  const [input, setInput] = useState('');
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [openFiles, setOpenFiles] = useState(initial.openFiles);
  const [selectedFile, setSelectedFile] = useState(initial.selectedFile);
  const [fileContent, setFileContent] = useState(initial.fileContent);
  const [sandboxCommand, setSandboxCommand] = useState(initial.sandboxCommand);
  const [sandboxOutput, setSandboxOutput] = useState('');
  const [approval, setApproval] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/models').then((r) => r.json()).then((x) => setModels(x.models || DEFAULT_MODELS)).catch(() => {});
    loadFiles();
    try {
      if (window.puter?.auth?.isSignedIn?.()) window.puter.auth.getUser().then(setUser).catch(() => {});
    } catch (_) {}
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(PERSISTENCE_KEY, JSON.stringify({ messages, model, openFiles, selectedFile, fileContent, sandboxCommand }));
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1400);
      } catch (_) {}
    }, 250);
    return () => window.clearTimeout(timer);
  }, [messages, model, openFiles, selectedFile, fileContent, sandboxCommand]);

  const loadFiles = () => fetch('/api/workspace/files').then((r) => r.json()).then((x) => setFiles(x.items || [])).catch(() => {});

  const login = async () => {
    try {
      if (!window.puter?.auth) return alert('Puter SDK ยังไม่พร้อม');
      if (!puter.auth.isSignedIn?.()) await puter.auth.signIn();
      setUser(await puter.auth.getUser());
    } catch (e) { alert(`เข้าสู่ระบบไม่สำเร็จ: ${e.message}`); }
  };

  const readFile = async (path) => {
    setSelectedFile(path);
    setOpenFiles((current) => current.includes(path) ? current : [...current, path].slice(-8));
    const r = await fetch(`/api/workspace/read_file?path=${encodeURIComponent(path)}`);
    const x = await r.json();
    setFileContent(x.content || x.detail || '');
  };

  const streamPuter = async (text) => {
    if (!window.puter?.ai?.chat) return null;
    const history = messages.filter((m) => !m.streaming).slice(-12).concat({ role: 'user', content: text });
    const result = await puter.ai.chat(history, { model, stream: true });
    let answer = '';
    if (result?.[Symbol.asyncIterator]) {
      for await (const chunk of result) {
        const part = chunk?.text || chunk?.message?.content || chunk?.content || '';
        answer += Array.isArray(part) ? part.map((x) => x.text || '').join('') : part;
        setMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && last.streaming) next[next.length - 1] = { ...last, content: answer };
          else next.push({ role: 'assistant', content: answer, streaming: true });
          return next;
        });
      }
      return answer;
    }
    const part = result?.message?.content || result?.content || '';
    return Array.isArray(part) ? part.map((x) => x.text || '').join('') : part;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((current) => [...current.filter((m) => !m.streaming), { role: 'user', content: text }]);
    setLoading(true);
    try {
      const puterReply = await streamPuter(text);
      if (puterReply) setMessages((current) => [...current.filter((m) => !m.streaming), { role: 'assistant', content: puterReply }]);
      else {
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt: text }) });
        const data = await response.json();
        setMessages((current) => [...current, { role: 'assistant', content: data.reply || data.detail || 'ไม่มีคำตอบจากระบบ' }]);
      }
    } catch (e) {
      setMessages((current) => [...current.filter((m) => !m.streaming), { role: 'assistant', content: `เกิดข้อผิดพลาด: ${e.message}` }]);
    } finally { setLoading(false); }
  };

  const requestWrite = async () => {
    if (!selectedFile) return alert('เลือกไฟล์ก่อน');
    const response = await fetch('/api/approvals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'write_file', payload: { path: selectedFile, content: fileContent } }) });
    setApproval(await response.json());
  };

  const decide = async (approved) => {
    await fetch(`/api/approvals/${approval.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: approved ? 'approve' : 'reject', note: approved ? 'Approved in UI' : 'Rejected in UI' }) });
    setApproval(null);
    if (approved) loadFiles();
  };

  const runSandbox = async () => {
    const response = await fetch('/api/sandbox/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: sandboxCommand }) });
    const data = await response.json();
    setSandboxOutput(data.stdout || data.stderr || 'ไม่มีผลลัพธ์');
  };

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand-row"><div className="brand-mark">C</div><div><div className="brand-name">CowAgent</div><div className="brand-sub">Workspace</div></div></div><nav className="nav"><button className="nav-item active">💬 Chat</button><button className="nav-item">🧪 Sandbox</button><button className="nav-item">📋 Tasks</button></nav><div className="account-box"><div className="status-pill">{user ? 'Online' : 'Not signed in'}</div><button className="primary-btn" onClick={login}>{user ? `Connected: ${user.username || user.email || 'Puter'}` : 'Login with Puter'}</button></div><div className="open-files"><div className="tool-title">เปิดล่าสุด</div>{openFiles.length ? openFiles.map((path) => <button className={`open-file ${selectedFile === path ? 'selected' : ''}`} key={path} onClick={() => readFile(path)}>{path}</button>) : <span className="muted">ยังไม่มีไฟล์</span>}</div></aside>
    <main className="main-panel"><header className="topbar"><div><div className="eyebrow">AI WORKSPACE</div><h1>Chat + Repo + Sandbox</h1></div><label className="model-picker">Model <select value={model} onChange={(e) => setModel(e.target.value)}>{models.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></header><div className="content-grid"><section className="chat-panel"><div className="chat-header"><span>My Assistant</span><span className="muted">{loading ? 'Streaming…' : 'Ready'}</span></div><div className="messages">{messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}><div className="avatar">{message.role === 'user' ? 'U' : 'AI'}</div><div className="bubble">{message.content}{message.streaming ? '▌' : ''}</div></div>)}</div><div className="composer"><textarea value={input} placeholder="พิมพ์ข้อความคุยกับบอท..." onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} /><button className="send-btn" onClick={send} disabled={loading}>Send</button></div></section><aside className="tools-panel"><section className="tool-card"><div className="tool-title">Repo files</div><select value={selectedFile} onChange={(e) => e.target.value && readFile(e.target.value)}><option value="">เลือกไฟล์</option>{files.map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}</select><textarea className="file-editor" value={fileContent} onChange={(e) => setFileContent(e.target.value)} placeholder="เนื้อหาไฟล์จะแสดงตรงนี้"/><button className="small-btn" onClick={requestWrite} disabled={!selectedFile}>ขออนุมัติบันทึกไฟล์</button></section><section className="tool-card"><div className="tool-title">Docker Sandbox</div><textarea value={sandboxCommand} onChange={(e) => setSandboxCommand(e.target.value)} /><button className="small-btn" onClick={runSandbox}>▶ Run isolated</button><pre className="sandbox-output">{sandboxOutput}</pre></section></aside></div>{saved && <div className="workspace-status visible">Workspace saved</div>}</main>{approval && <div className="modal-backdrop"><div className="approval-modal"><h2>ยืนยันการเขียนไฟล์</h2><p>{approval.payload?.path}</p><pre>{approval.payload?.content}</pre><button className="small-btn" onClick={() => decide(true)}>อนุมัติ</button><button className="small-btn danger" onClick={() => decide(false)}>ปฏิเสธ</button></div></div>}
  </div>;
}
