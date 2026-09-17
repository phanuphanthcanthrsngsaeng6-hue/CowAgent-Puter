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

function loadConversation() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) && saved.length ? saved : [{ role: "assistant", content: "สวัสดีครับ 👋\nผมพร้อมช่วยคุณตั้งค่า workspace, แซนบ็อก preview และงานต่าง ๆ" }];
  } catch (_) {
    return [{ role: "assistant", content: "สวัสดีครับ 👋\nผมพร้อมช่วยคุณตั้งค่า workspace, แซนบ็อก preview และงานต่าง ๆ" }];
  }
}

function saveConversation() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation));
  } catch (_) {}
}

function renderMessages() {
  messages.innerHTML = "";
  conversation.forEach((item) => {
    const article = document.createElement("article");
    article.className = `message ${item.role}`;
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = item.role === "user" ? "You" : "AI";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = item.content;

    article.appendChild(avatar);
    article.appendChild(bubble);
    messages.appendChild(article);
  });
  messages.scrollTop = messages.scrollHeight;
}

function showError(message = "") {
  errorBox.textContent = message;
  errorBox.classList.toggle("hidden", !message);
}

function setSignedIn(user) {
  const name = user?.username || user?.email || "ผู้ใช้ Puter";
  status.textContent = `ล็อกอินแล้ว: ${name}`;
  status.classList.add("online");
  loginBtn.classList.add("hidden");
  logoutBtn.classList.remove("hidden");
}

function setSignedOut() {
  status.textContent = "ยังไม่ได้ล็อกอิน";
  status.classList.remove("online");
  loginBtn.classList.remove("hidden");
  logoutBtn.classList.add("hidden");
}

async function handleLogin() {
  try {
    if (!window.puter || !puter.auth) {
      showError("Puter SDK ยังไม่พร้อมใช้งานในหน้านี้");
      return;
    }

    await puter.auth.signIn();
    const user = await puter.auth.getUser();
    setSignedIn(user);
    showError("");
  } catch (error) {
    showError("ไม่สามารถเข้าสู่ระบบ Puter ได้");
  }
}

function handleLogout() {
  try {
    if (window.puter && puter.auth) {
      puter.auth.signOut();
    }
  } catch (_) {}
  setSignedOut();
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = prompt.value.trim();
  if (!text) return;

  conversation.push({ role: "user", content: text });
  conversation.push({ role: "assistant", content: `ผมได้ยินแล้ว: "${text}"\n\nใน workspace นี้ ผมสามารถช่วยได้ 3 อย่าง:\n- ออกแบบ feature ใหม่\n- สร้าง mock UI สำหรับหน้าแชท/แดชบอร์ด\n- วางแซนบ็อก preview ให้คุณทดลองโค้ดได้ทันที` });
  prompt.value = "";
  counter.textContent = "0 / 6000";
  saveConversation();
  renderMessages();
});

prompt.addEventListener("input", () => {
  counter.textContent = `${prompt.value.length} / 6000`;
  prompt.style.height = "auto";
  prompt.style.height = `${Math.min(prompt.scrollHeight, 140)}px`;
});

prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

loginBtn.addEventListener("click", handleLogin);
logoutBtn.addEventListener("click", handleLogout);

function loadSandbox() {
  try {
    const saved = JSON.parse(localStorage.getItem(SANDBOX_KEY));
    if (saved) {
      htmlEditor.value = saved.html || htmlEditor.value;
      cssEditor.value = saved.css || cssEditor.value;
      jsEditor.value = saved.js || jsEditor.value;
    }
  } catch (_) {}
}

function saveSandbox() {
  localStorage.setItem(SANDBOX_KEY, JSON.stringify({
    html: htmlEditor.value,
    css: cssEditor.value,
    js: jsEditor.value
  }));
}

function runSandbox() {
  const html = htmlEditor.value;
  const css = cssEditor.value;
  const js = jsEditor.value;

  const doc = `<!doctype html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <style>${css}</style>
    </head>
    <body>
      ${html}
      <script>
        try {
          ${js}
        } catch (error) {
          const div = document.createElement('pre');
          div.style.color = '#ffb4b4';
          div.style.marginTop = '12px';
          div.textContent = error.stack || error.message;
          document.body.appendChild(div);
        }
      <\/script>
    </body>
  </html>`;

  previewFrame.srcdoc = doc;
  saveSandbox();
}

runCodeBtn.addEventListener("click", runSandbox);
saveCodeBtn.addEventListener("click", saveSandbox);

(function init() {
  renderMessages();
  loadSandbox();
  runSandbox();

  try {
    if (window.puter && puter.auth && puter.auth.isSignedIn()) {
      puter.auth.getUser().then(setSignedIn).catch(() => setSignedOut());
    } else {
      setSignedOut();
    }
  } catch (_) {
    setSignedOut();
  }
})();
