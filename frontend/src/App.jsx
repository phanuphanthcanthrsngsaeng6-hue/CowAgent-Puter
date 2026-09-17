import { useEffect, useState } from 'react';

const DEFAULT_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'claude-3-5-sonnet',
  'gemini-2.0-flash',
  'x-ai/grok-3-mini',
  'ollama/llama3',
];

const initialMessages = [
  { role: 'assistant', content: 'Hello! I am CowAgent. Login with Puter, choose a model, and I can help inspect the repo, search files, or run sandbox commands.' },
];

export default function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODELS[0]);
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [repoState, setRepoState] = useState({ status: [], files: [] });

  useEffect(() => {
    fetch('/api/models')
      .then((res) => res.json())
      .then((data) => setModels(data.models || DEFAULT_MODELS))
      .catch(() => setModels(DEFAULT_MODELS));

    fetch('/api/git/status')
      .then((res) => res.json())
      .then((data) => setRepoState((prev) => ({ ...prev, status: data.status || [] })))
      .catch(() => {});
  }, []);

  const loginPuter = async () => {
    try {
      if (!window.puter || !window.puter.auth) {
        alert('Puter SDK is not available yet.');
        return;
      }
      if (window.puter.auth.isSignedIn && window.puter.auth.isSignedIn()) {
        const currentUser = await window.puter.auth.getUser();
        setUser(currentUser);
        return;
      }
      await window.puter.auth.signIn();
      const currentUser = await window.puter.auth.getUser();
      setUser(currentUser);
    } catch (error) {
      console.error(error);
      alert('Login failed: ' + (error?.message || 'Unknown error'));
    }
  };

  const tryPuterResponse = async (prompt) => {
    if (window.puter && window.puter.ai && window.puter.ai.chat) {
      const result = await window.puter.ai.chat([
        { role: 'user', content: prompt },
      ], {
        model: selectedModel,
        stream: false,
      });
      return result?.message?.content || result?.content || 'No response received from Puter.';
    }
    return null;
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage = { role: 'user', content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const puterReply = await tryPuterResponse(trimmed);
      let reply = puterReply;

      if (!puterReply) {
        const backendRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel, messages: nextMessages, prompt: trimmed }),
        });
        const json = await backendRes.json();
        reply = json.reply || 'Backend fallback reply';
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error while generating response: ' + (error?.message || 'Unknown error') }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchRepo = async () => {
    const q = prompt('Search repo for text');
    if (!q) return;
    const res = await fetch('/api/workspace/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, path: '.' }),
    });
    const json = await res.json();
    const text = json.results?.join('\n') || 'No search results';
    setMessages((prev) => [...prev, { role: 'assistant', content: `Search results for "${q}":\n\n${text}` }]);
  };

  const handleGitStatus = async () => {
    const res = await fetch('/api/git/status');
    const json = await res.json();
    const text = (json.status || []).join('\n') || 'Working tree is clean';
    setMessages((prev) => [...prev, { role: 'assistant', content: `Git status:\n\n${text}` }]);
  };

  const handleSandbox = async () => {
    const res = await fetch('/api/sandbox/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'echo sandbox-ready && uname -a' }),
    });
    const json = await res.json();
    const text = json.stdout || json.stderr || 'Sandbox unavailable';
    setMessages((prev) => [...prev, { role: 'assistant', content: `Sandbox:\n\n${text}` }]);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-name">CowAgent</div>
            <div className="brand-sub">Workspace</div>
          </div>
        </div>

        <nav className="nav">
          <button className="nav-item active">💬 Chat</button>
          <button className="nav-item">🧪 Sandbox</button>
          <button className="nav-item">📋 Tasks</button>
          <button className="nav-item">⚙️ Settings</button>
        </nav>

        <div className="account-box">
          <div className="status-pill">{user ? 'Online' : 'Not signed in'}</div>
          <button className="primary-btn" onClick={loginPuter}>
            {user ? `Connected: ${user.username || user.email || 'Puter User'}` : 'Login with Puter'}
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <div className="eyebrow">AI WORKSPACE</div>
            <h1>Chat + Code + Sandbox</h1>
          </div>
          <div className="toolbar-actions">
            <label className="model-picker">
              <span>Model</span>
              <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <div className="content-grid">
          <section className="chat-panel">
            <div className="chat-header">
              <span>My Assistant</span>
              <span className="muted">Repository ready</span>
            </div>

            <div className="messages">
              {messages.map((msg, index) => (
                <div key={index} className={`message ${msg.role}`}>
                  <div className="avatar">{msg.role === 'user' ? 'U' : 'AI'}</div>
                  <div className="bubble">{msg.content}</div>
                </div>
              ))}
              {loading && <div className="message assistant"><div className="avatar">AI</div><div className="bubble">Thinking…</div></div>}
            </div>

            <div className="composer">
              <textarea
                rows={1}
                value={input}
                placeholder="Type a task for the assistant..."
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button className="send-btn" onClick={sendMessage} disabled={loading}>Send</button>
            </div>
          </section>

          <aside className="sandbox-panel">
            <div className="sandbox-header">
              <span>Browser Sandbox</span>
              <div className="sandbox-actions">
                <button className="small-btn" onClick={handleSandbox}>Run</button>
                <button className="small-btn ghost">Save</button>
              </div>
            </div>

            <div className="editor-wrap">
              <div className="editor-column">
                <label>HTML</label>
                <textarea defaultValue={'<h1>Hello CowAgent!</h1><button onclick="alert(\'Hi\')">Click me</button>'} />
              </div>
              <div className="editor-column">
                <label>CSS</label>
                <textarea defaultValue={'body { font-family: sans-serif; padding: 24px; background: #0f172a; color: white; } button { padding: 10px 16px; border-radius: 10px; background: #55e6ab; color: #021a12; }'} />
              </div>
              <div className="editor-column">
                <label>JavaScript</label>
                <textarea defaultValue={"console.log('Sandbox ready');"} />
              </div>
            </div>

            <div className="preview-header">
              <span>Live Preview</span>
            </div>
            <iframe title="preview" className="preview-frame" srcDoc={`<!doctype html><html><body><h1>Hello CowAgent!</h1></body></html>`} />
          </aside>
        </div>

        <div className="bottom-row">
          <button className="utility-btn" onClick={handleSearchRepo}>Search repo</button>
          <button className="utility-btn" onClick={handleGitStatus}>Git status</button>
          <button className="utility-btn" onClick={handleSandbox}>Run sandbox</button>
        </div>
      </main>
    </div>
  );
}
