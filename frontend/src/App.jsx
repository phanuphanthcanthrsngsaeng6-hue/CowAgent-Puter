import { useEffect, useMemo, useState } from 'react';

const DEFAULT_MODELS = ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet', 'gemini-2.0-flash', 'x-ai/grok-3-mini', 'ollama/llama3'];
const PERSISTENCE_KEY = 'cowagent-workspace-state-v2';
const DEFAULT_MESSAGE = { role: 'assistant', content: 'สวัสดีครับ 👋\nเข้าสู่ระบบ Puter เลือกโมเดล แล้วคุยกับผมได้เลยครับ' };

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(PERSISTENCE_KEY));
    return {
      messages: Array.isArray(saved?.messages) && saved.messages.length ? saved.messages : [DEFAULT_MESSAGE],
      openFiles: Array.isArray(saved?.openFiles) ? saved.openFiles : [],
      selectedFile: saved?.selectedFile || '',
      fileContents: saved?.fileContents && typeof saved.fileContents === 'object' ? saved.fileContents : {},
      model: saved?.model || DEFAULT_MODELS[0],
      personality: saved?.personality || 'ผู้ช่วยเขียนโค้ด',
      lastCommands: Array.isArray(saved?.lastCommands) ? saved.lastCommands : [],
      sandboxCommand: saved?.sandboxCommand || 'echo sandbox-ready && uname -a',
    };
  } catch (_) {
    return { messages: [DEFAULT_MESSAGE], openFiles: [], selectedFile: '', fileContents: {}, model: DEFAULT_MODELS[0], personality: 'ผู้ช่วยเขียนโค้ด', lastCommands: [], sandboxCommand: 'echo sandbox-ready && uname -a' };
  }
}

export default function App() {
  const initial = useMemo(loadState, []);
  const [messages, setMessages] = useState(initial.messages);
  const [model, setModel] = useState(initial.model);
  const [personality, setPersonality] = useState(initial.personality);
  const [lastCommands, setLastCommands] = useState(initial.lastCommands);
  const [input, setInput] = useState('');
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [openFiles, setOpenFiles] = useState(initial.openFiles);
  const [selectedFile, setSelectedFile] = useState(initial.selectedFile);
  const [fileContents, setFileContents] = useState(initial.fileContents);
  const [sandboxCommand, setSandboxCommand] = useState(initial.sandboxCommand);
  const [sandboxOutput, setSandboxOutput] = useState('');
  const [approval, setApproval] = useState(null);
  const [saved, setSaved] = useState(false);

  const fileContent = selectedFile ? fileContents[selectedFile] || '' : '';

  useEffect(() => {
    fetch('/api/models').then((r) => r.json()).then((x) => setModels(x.models || DEFAULT_MODELS)).catch(() => {});
    loadFiles();
    try { if (window.puter?.auth?.isSignedIn?.()) window.puter.auth.getUser().then(setUser).catch(() => {}); } catch (_) {}
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(PERSISTENCE_KEY, JSON.stringify({ messages, model, personality, lastCommands, openFiles, selectedFile, fileContents, sandboxCommand }));
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1600);
      } catch (_) {}
    }, 500);
    return () => window.clearTimeout(timer);
  }, [messages, model, personality, lastCommands, openFiles, selectedFile, fileContents, sandboxCommand]);

  useEffect(() => {
    if (openFiles.length && !selectedFile) setSelectedFile(openFiles[openFiles.length - 1]);
  }, [openFiles, selectedFile]);

  const loadFiles = () => fetch('/api/workspace/files').then((r) => r.json()).then((x) => setFiles(x.items || [])).catch(() => {});

  const addCommand = (command) => setLastCommands((items) => [...items.filter((item) => item !== command), command].slice(-10));
  const addMessage = (message) => setMessages((items) => [...items.filter((item) => !item.streaming), message]);

  const login = async () => {
    try {
      if (!window.puter?.auth) return alert('Puter SDK ยังไม่พร้อม');
      if (!puter.auth.isSignedIn?.()) await puter.auth.signIn();
      setUser(await puter.auth.getUser());
    } catch (e) { alert(`เข้าสู่ระบบไม่สำเร็จ: ${e.message}`); }
  };

  const openFile = async (path) => {
    setSelectedFile(path);
    setOpenFiles((items) => items.includes(path) ? items : [...items, path].slice(-12));
    if (Object.prototype.hasOwnProperty.call(fileContents, path)) return;
    const response = await fetch(`/api/workspace/read_file?path=${encodeURIComponent(path)}`);
    const data = await response.json();
    setFileContents((items) => ({ ...items, [path]: data.content || data.detail || '' }));
  };

  const closeFile = (path) => {
    setOpenFiles((items) => {
      const next = items.filter((item) => item !== path);
      if (selectedFile === path) setSelectedFile(next[next.length - 1] || '');
      return next;
    });
  };

  const updateFile = (content) => {
    if (selectedFile) setFileContents((items) => ({ ...items, [selectedFile]: content }));
  };

  const streamPuter = async (text) => {
    if (!window.puter?.ai?.chat) return null;
    const history = messages.filter((m) => !m.streaming).slice(-12).concat({ role: 'user', content: `${personality}\n\n${text}` });
    const result = await puter.ai.chat(history, { model, stream: true });
    let answer = '';
    if (result?.[Symbol.asyncIterator]) {
      for await (const chunk of result) {
        const part = chunk?.text || chunk?.message?.content || chunk?.content || '';
        answer += Array.isArray(part) ? part.map((x) => x.text || '').join('') : part;
        setMessages((items) => [...items.filter((item) => !item.streaming), { role: 'assistant', content: answer, streaming: true }]);
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
    if (text.startsWith('!')) addCommand(text.slice(1));
    setMessages((items) => [...items.filter((item) => !item.streaming), { role: 'user', content: text, time: new Date().toISOString() }]);
    setLoading(true);
    try {
      const puterReply = await streamPuter(text);
      if (puterReply) addMessage({ role: 'assistant', content: puterReply, time: new Date().toISOString() });
      else {
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt: text }) });
        const data = await response.json();
        addMessage({ role: 'assistant', content: data.reply || data.detail || 'ไม่มีคำตอบจากระบบ', time: new Date().toISOString() });
      }
    } catch (e) { addMessage({ role: 'assistant', content: `เกิดข้อผิดพลาด: ${e.message}` }); }
    finally { setLoading(false); }
  };

  const requestWrite = async () => {
    if (!selectedFile) return alert('เลือกไฟล์ก่อน');
    const response = await fetch('/api/approvals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'write_file', payload: { path: selectedFile, content: fileContent } }) });
    setApproval(await response.json());
  };

  const decide = async (approved) => {
    await fetch(`/api/approvals/${approval.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: approved ? 'approve' : 'reject', note: approved ? 'อนุมัติจากหน้าเว็บ' : 'ปฏิเสธจากหน้าเว็บ' }) });
    setApproval(null);
    if (approved) loadFiles();
  };

  const runSandbox = async (command = sandboxCommand) => {
    addCommand(command);
    const response = await fetch('/api/sandbox/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }) });
    const data = await response.json();
    setSandboxOutput(data.stdout || data.stderr || 'ไม่มีผลลัพธ์');
  };

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand-row"><div className="brand-mark">C</div><div><div className="brand-name">CowAgent</div><div className="brand-sub">Workspace</div></div></div><nav className="nav"><button className="nav-item active">💬 แชท</button><button className="nav-item">🧪 Sandbox</button><button className="nav-item">📋 งาน</button></nav><div className="account-box"><div className="status-pill">{user ? 'ออนไลน์' : 'ยังไม่ได้เข้าสู่ระบบ'}</div><button className="primary-btn" onClick={login}>{user ? `เชื่อมต่อ: ${user.username || user.email || 'Puter'}` : 'เข้าสู่ระบบ Puter'}</button></div><section className="open-files"><div className="tool-title">ไฟล์ล่าสุด</div>{openFiles.length ? openFiles.slice().reverse().map((path) => <button className={`open-file ${selectedFile === path ? 'selected' : ''}`} key={path} onClick={() => openFile(path)}>📄 {path}</button>) : <span className="muted">ยังไม่มีไฟล์ที่เปิด</span>}</section><section className="settings-section"><div className="tool-title">การตั้งค่า</div><label>บุคลิกภาพ<input value={personality} onChange={(e) => setPersonality(e.target.value)} placeholder="ผู้ช่วยเขียนโค้ด" /></label><label>คำสั่งล่าสุด<select onChange={(e) => e.target.value && runSandbox(e.target.value)} defaultValue=""><option value="">เลือกคำสั่ง</option>{lastCommands.slice().reverse().map((command) => <option key={command} value={command}>{command}</option>)}</select></label></section></aside>
    <main className="main-panel"><header className="topbar"><div><div className="eyebrow">AI WORKSPACE</div><h1>Chat + Repo + Sandbox</h1></div><label className="model-picker">โมเดล <select value={model} onChange={(e) => setModel(e.target.value)}>{models.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></header><div className="content-grid"><section className="chat-panel"><div className="chat-header"><span>ห้องแชทของฉัน</span><span className="muted">{loading ? 'กำลังตอบแบบต่อเนื่อง…' : 'พร้อมใช้งาน'}</span></div><div className="messages">{messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}><div className="avatar">{message.role === 'user' ? 'คุณ' : 'AI'}</div><div className="bubble">{message.content}{message.streaming ? '▌' : ''}</div></div>)}</div><div className="composer"><textarea value={input} placeholder="พิมพ์ข้อความหรือคำสั่ง เช่น !ls -la" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} /><button className="send-btn" onClick={send} disabled={loading}>ส่ง</button></div></section><section className="editor-panel"><div className="tabs-container">{openFiles.map((path) => <button className={`tab ${selectedFile === path ? 'active' : ''}`} key={path} onClick={() => openFile(path)}><span>{path}</span><span className="tab-close" onClick={(e) => { e.stopPropagation(); closeFile(path); }}>×</span></button>)}{!openFiles.length && <span className="tabs-placeholder">ยังไม่ได้เปิดไฟล์</span>}</div><div className="editor-area">{selectedFile ? <div className="file-editor"><div className="editor-header"><span className="file-path">{selectedFile}</span><span className="file-status">● แก้ไขในเครื่อง</span></div><textarea className="code-editor" value={fileContent} onChange={(e) => updateFile(e.target.value)} placeholder="พิมพ์เนื้อหาไฟล์ที่นี่..." /><button className="small-btn editor-save" onClick={requestWrite}>ขออนุมัติบันทึกไฟล์</button></div> : <div className="empty-state"><h3>เลือกไฟล์เพื่อเริ่มแก้ไข</h3><p>เลือกไฟล์จากรายการไฟล์ล่าสุดหรือใช้ตัวเลือกด้านล่าง</p><select onChange={(e) => e.target.value && openFile(e.target.value)} defaultValue=""><option value="">เลือกไฟล์ใน repo</option>{files.map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}</select></div>}</div></section><section className="sandbox-panel"><div className="sandbox-header"><span>Docker Sandbox</span><button className="small-btn" onClick={() => runSandbox()}>▶ รัน</button></div><textarea value={sandboxCommand} onChange={(e) => setSandboxCommand(e.target.value)} /><pre className="sandbox-output">{sandboxOutput}</pre></section></div>{saved && <div className="workspace-status visible">บันทึก Workspace แล้ว</div>}</main>{approval && <div className="modal-backdrop"><div className="approval-modal"><h2>ยืนยันการเขียนไฟล์</h2><p>{approval.payload?.path}</p><pre>{approval.payload?.content}</pre><button className="small-btn" onClick={() => decide(true)}>อนุมัติ</button><button className="small-btn danger" onClick={() => decide(false)}>ปฏิเสธ</button></div></div>}
  </div>;
}
