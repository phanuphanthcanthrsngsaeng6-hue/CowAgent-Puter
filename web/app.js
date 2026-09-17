const STORAGE_KEY = "cowagent-chat-v2";
const SANDBOX_KEY = "cowagent-sandbox-v1";
const $ = (id) => document.getElementById(id);

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
  return [{
    role: "assistant",
    content: "สวัสดีครับ 👋\nผมคือ CowAgent คุยกับผมได้ตามปกติเลยครับ หรือจะสั่ง /run เพื่อเปิด Sandbox ก็ได้"
  }];
}

function loadConversation() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) && saved.length ? saved : defaultConversation();
  } catch (_) { return defaultConversation(); }
}

function saveConversation() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation)); } catch (_) {}
}

function renderMessages() {
  if (!messages) return;
  messages.replaceChildren();
  conversation.forEach((item) => {
    const article = document.createElement("article");
    article.className = `message ${item.role}`;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = item.content;
    article.appendChild(bubble);
    messages.appendChild(article);
  });
  messages.scrollTop = messages.scrollHeight;
}

function addMessage(role, content) {
  conversation.push({ role, content });
  saveConversation();
  renderMessages();
}

function showError(message = "") {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.classList.toggle("hidden", !message);
}

function loadSandbox() {
  try {
    const saved = JSON.parse(localStorage.getItem(SANDBOX_KEY));
    if (saved) {
      if (htmlEditor) htmlEditor.value = saved.html || htmlEditor.value;
      if (cssEditor) cssEditor.value = saved.css || cssEditor.value;
      if (jsEditor) jsEditor.value = saved.js || jsEditor.value;
    }
  } catch (_) {}
}

function saveSandbox() {
  try {
    localStorage.setItem(SANDBOX_KEY, JSON.stringify({
      html: htmlEditor?.value || "",
      css: cssEditor?.value || "",
      js: jsEditor?.value || ""
    }));
  } catch (_) {}
}

function runSandbox() {
  if (!previewFrame || !htmlEditor || !cssEditor || !jsEditor) return;
  const doc = `<!doctype html><html><head><meta charset="UTF-8"><style>${cssEditor.value}</style></head><body>${htmlEditor.value}<script>try{${jsEditor.value}}catch(error){const el=document.createElement('pre');el.style.color='#b42318';el.style.whiteSpace='pre-wrap';el.textContent=error.stack||error.message;document.body.appendChild(el)}<\\/script></body></html>`;
  previewFrame.srcdoc = doc;
  saveSandbox();
}

function extractAIText(response) {
  if (typeof response === "string") return response;
  if (response?.message?.content) return response.message.content;
  if (Array.isArray(response?.message?.content)) return response.message.content.map((part) => part.text || "").join("");
  if (response?.content) return response.content;
  return "ได้รับคำตอบจาก AI แล้ว แต่ไม่พบข้อความตอบกลับที่อ่านได้ครับ";
}

async function askBot(text) {
  if (!window.puter?.ai?.chat) {
    return "ตอนนี้ยังเชื่อมต่อ AI ไม่สำเร็จครับ ลองโหลดหน้าใหม่ หรือตรวจว่า Puter SDK โหลดได้แล้ว\n\nคุณยังใช้ /run เพื่อรัน Browser Sandbox ได้ตามปกติ";
  }
  try {
    const history = conversation.slice(-12).map((item) => ({ role: item.role, content: item.content }));
    const response = await puter.ai.chat(history.concat({ role: "user", content: text }), {
      model: "gpt-4o-mini",
      stream: false
    });
    return extractAIText(response);
  } catch (error) {
    console.error(error);
    return `ขออภัยครับ เรียก AI ไม่สำเร็จ: ${error.message || "ไม่ทราบสาเหตุ"}\n\nลองเข้าสู่ระบบ Puter แล้วส่งข้อความอีกครั้งครับ`;
  }
}

function isRunRequest(text) {
  const lower = text.toLowerCase();
  return lower === "/run" || lower === "/preview" || /รัน.*(sandbox|แซนบ็อก)|แสดงผล.*(sandbox|preview)/.test(lower);
}

async function handleMessage(text) {
  const normalized = text.trim();
  const htmlCommand = normalized.match(/^\/html\s+([\s\S]+)/i);
  const cssCommand = normalized.match(/^\/css\s+([\s\S]+)/i);
  const jsCommand = normalized.match(/^\/(?:js|javascript)\s+([\s\S]+)/i);

  if (htmlCommand && htmlEditor) {
    htmlEditor.value = htmlCommand[1]; runSandbox();
    return "อัปเดต HTML และรัน Preview ให้แล้วครับ ✅";
  }
  if (cssCommand && cssEditor) {
    cssEditor.value = cssCommand[1]; runSandbox();
    return "อัปเดต CSS และรัน Preview ให้แล้วครับ ✅";
  }
  if (jsCommand && jsEditor) {
    jsEditor.value = jsCommand[1]; runSandbox();
    return "อัปเดต JavaScript และรัน Preview ให้แล้วครับ ✅";
  }
  if (isRunRequest(normalized)) {
    runSandbox();
    return "เรียกใช้ Browser Sandbox และอัปเดต Live Preview ให้แล้วครับ ✅";
  }
  return askBot(normalized);
}

if (composer) {
  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = prompt?.value.trim();
    if (!text) return;
    addMessage("user", text);
    prompt.value = "";
    if (counter) counter.textContent = "0 / 6000";
    const send = $("send");
    if (send) { send.disabled = true; send.style.opacity = "0.5"; }
    const answer = await handleMessage(text);
    addMessage("assistant", answer);
    if (send) { send.disabled = false; send.style.opacity = "1"; }
  });
}

if (prompt) {
  prompt.addEventListener("input", () => {
    if (counter) counter.textContent = `${prompt.value.length} / 6000`;
    prompt.style.height = "auto";
    prompt.style.height = `${Math.min(prompt.scrollHeight, 150)}px`;
  });
  prompt.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      composer?.requestSubmit();
    }
  });
}

$("new-chat")?.addEventListener("click", () => {
  conversation = defaultConversation();
  saveConversation();
  renderMessages();
});
$("run-code")?.addEventListener("click", runSandbox);
$("save-code")?.addEventListener("click", saveSandbox);

(function init() {
  renderMessages();
  loadSandbox();
  runSandbox();
})();
