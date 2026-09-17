const STORAGE_KEY = "cowagent-chat-v1";
const SANDBOX_KEY = "cowagent-sandbox-v1";
const $ = (id) => document.getElementById(id);

const status = $("status");
const loginBtn = $("login");
const logoutBtn = $("logout");
const prompt = $("prompt");
const composer = $("composer");
const messages = $("messages");
const errorBox = $("error");
const counter = $("counter");
const htmlEditor = $("html-editor");
const cssEditor = $("css-editor");
const jsEditor = $("js-editor");
const previewFrame = $("preview-frame");
const runCodeBtn = $("run-code");
const saveCodeBtn = $("save-code");

let conversation = loadConversation();

function defaultConversation() {
  return [{ role: "assistant", content: "สวัสดีครับ 👋\nผมเรียกใช้ Browser Sandbox ให้คุณได้จากในแชท\n\nลองพิมพ์:\n• รัน sandbox\n• preview\n• /run\n• /html <h1>Hello</h1>" }];
}
function loadConversation() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(saved) && saved.length ? saved : defaultConversation(); } catch (_) { return defaultConversation(); } }
function saveConversation() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation)); } catch (_) {} }
function renderMessages() { messages.innerHTML = ""; conversation.forEach((item) => { const article = document.createElement("article"); article.className = `message ${item.role}`; const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = item.role === "user" ? "You" : "AI"; const bubble = document.createElement("div"); bubble.className = "bubble"; bubble.textContent = item.content; article.append(avatar, bubble); messages.appendChild(article); }); messages.scrollTop = messages.scrollHeight; }
function addMessage(role, content) { conversation.push({ role, content }); saveConversation(); renderMessages(); }
function showError(message = "") { errorBox.textContent = message; errorBox.classList.toggle("hidden", !message); }
function setSignedIn(user) { const name = user?.username || user?.email || "ผู้ใช้ Puter"; status.textContent = `ล็อกอินแล้ว: ${name}`; status.classList.add("online"); loginBtn.classList.add("hidden"); logoutBtn.classList.remove("hidden"); }
function setSignedOut() { status.textContent = "ยังไม่ได้ล็อกอิน"; status.classList.remove("online"); loginBtn.classList.remove("hidden"); logoutBtn.classList.add("hidden"); }
async function handleLogin() { try { if (!window.puter || !puter.auth) return showError("Puter SDK ยังไม่พร้อมใช้งานในหน้านี้"); await puter.auth.signIn(); setSignedIn(await puter.auth.getUser()); showError(""); } catch (_) { showError("ไม่สามารถเข้าสู่ระบบ Puter ได้"); } }
function handleLogout() { try { if (window.puter && puter.auth) puter.auth.signOut(); } catch (_) {} setSignedOut(); }
function loadSandbox() { try { const saved = JSON.parse(localStorage.getItem(SANDBOX_KEY)); if (saved) { htmlEditor.value = saved.html || htmlEditor.value; cssEditor.value = saved.css || cssEditor.value; jsEditor.value = saved.js || jsEditor.value; } } catch (_) {} }
function saveSandbox() { try { localStorage.setItem(SANDBOX_KEY, JSON.stringify({ html: htmlEditor.value, css: cssEditor.value, js: jsEditor.value })); } catch (_) {} }
function runSandbox() { const doc = `<!doctype html><html><head><meta charset="UTF-8"><style>${cssEditor.value}</style></head><body>${htmlEditor.value}<script>try{${jsEditor.value}}catch(error){const el=document.createElement('pre');el.style.color='#ffb4b4';el.textContent=error.stack||error.message;document.body.appendChild(el)}<\\/script></body></html>`; previewFrame.srcdoc = doc; saveSandbox(); }

async function syncSandboxToRepo() {
  saveSandbox();
  const button = document.getElementById("sync-repo");
  button.disabled = true;
  button.textContent = "กำลังบันทึก...";
  showError("");
  try {
    const response = await fetch("/api/github-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: { "web/sandbox-preview.html": htmlEditor.value, "web/sandbox-preview.css": cssEditor.value, "web/sandbox-preview.js": jsEditor.value } }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "บันทึกเข้า GitHub ไม่สำเร็จ");
    addMessage("assistant", `บันทึก Sandbox เข้า GitHub แล้วครับ ✅\nCommit: ${data.commitUrl || data.commit || "สำเร็จ"}`);
    button.textContent = "บันทึกแล้ว ✓";
  } catch (error) {
    showError(error.message || "เชื่อมต่อ GitHub ไม่สำเร็จ");
    button.textContent = "บันทึกเข้า GitHub";
  } finally { button.disabled = false; setTimeout(() => { if (button) button.textContent = "บันทึกเข้า GitHub"; }, 2500); }
}

function installRepoButton() { const actions = document.querySelector(".sandbox-actions"); if (!actions || document.getElementById("sync-repo")) return; const button = document.createElement("button"); button.id = "sync-repo"; button.type = "button"; button.className = "small-btn"; button.textContent = "บันทึกเข้า GitHub"; button.title = "สร้าง commit ของโค้ด Sandbox ใน repository"; button.addEventListener("click", syncSandboxToRepo); actions.appendChild(button); }

function runFromChat(text) {
  const normalized = text.trim(); const lower = normalized.toLowerCase();
  const runRequest = lower === "/run" || lower === "/preview" || /รัน.*(sandbox|แซนบ็อก)|แสดงผล.*(sandbox|preview)|preview.*(โค้ด|code)?/.test(lower);
  const syncRequest = lower === "/sync" || /บันทึก.*(github|repo|รีโป)|ส่ง.*(github|repo)/.test(lower);
  const htmlCommand = normalized.match(/^\/(?:html)\s+([\s\S]+)/i); const cssCommand = normalized.match(/^\/(?:css)\s+([\s\S]+)/i); const jsCommand = normalized.match(/^\/(?:js|javascript)\s+([\s\S]+)/i);
  if (htmlCommand) { htmlEditor.value = htmlCommand[1]; runSandbox(); return "อัปเดต HTML และรันใน Sandbox ให้แล้วครับ ✅"; }
  if (cssCommand) { cssEditor.value = cssCommand[1]; runSandbox(); return "อัปเดต CSS และรัน Preview ให้แล้วครับ ✅"; }
  if (jsCommand) { jsEditor.value = jsCommand[1]; runSandbox(); return "อัปเดต JavaScript และรันใน Sandbox ให้แล้วครับ ✅"; }
  if (runRequest) { runSandbox(); return "เรียกใช้ Sandbox และอัปเดต Live Preview ให้แล้วครับ ✅\n\nหมายเหตุ: ตอนนี้เป็น Browser Sandbox จึงรัน HTML/CSS/JavaScript ได้ แต่ยังไม่รัน Python หรือคำสั่งระบบจริง"; }
  if (syncRequest) { syncSandboxToRepo(); return "กำลังส่งโค้ด Sandbox เข้า GitHub และสร้าง commit ให้ครับ..."; }
  if (lower.includes("python") || lower.includes("pip install") || lower.includes("npm install")) return "ตอนนี้ผมเรียกใช้ได้เฉพาะ Browser Sandbox ในหน้าเว็บครับ\n\nPython, pip และ npm ต้องมี backend/container แยกต่างหาก ไม่ควรรันคำสั่งเหล่านี้ใน browser โดยตรง\n\nถ้าต้องการดูหน้าเว็บ ให้พิมพ์ /run หรือ /html <h1>Hello</h1>";
  return `รับคำสั่งแล้วครับ: "${normalized}"\n\nถ้าต้องการให้ผมเรียก Sandbox ให้พิมพ์ /run หรือ “รัน sandbox”\nถ้าต้องการบันทึกโค้ดเข้า repository ให้พิมพ์ /sync`;
}

composer.addEventListener("submit", (event) => { event.preventDefault(); const text = prompt.value.trim(); if (!text) return; addMessage("user", text); prompt.value = ""; counter.textContent = "0 / 6000"; addMessage("assistant", runFromChat(text)); });
prompt.addEventListener("input", () => { counter.textContent = `${prompt.value.length} / 6000`; prompt.style.height = "auto"; prompt.style.height = `${Math.min(prompt.scrollHeight, 140)}px`; });
prompt.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); composer.requestSubmit(); } });
loginBtn.addEventListener("click", handleLogin); logoutBtn.addEventListener("click", handleLogout); runCodeBtn.addEventListener("click", runSandbox); saveCodeBtn.addEventListener("click", saveSandbox);

(function init() { renderMessages(); loadSandbox(); installRepoButton(); runSandbox(); try { if (window.puter && puter.auth && puter.auth.isSignedIn()) puter.auth.getUser().then(setSignedIn).catch(setSignedOut); else setSignedOut(); } catch (_) { setSignedOut(); } })();
