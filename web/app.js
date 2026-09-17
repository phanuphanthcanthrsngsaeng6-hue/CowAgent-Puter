const $ = (id) => document.getElementById(id);
const login = $("login"), logout = $("logout"), status = $("status");
const prompt = $("prompt"), send = $("send"), messages = $("messages"), errorBox = $("error");
const list = $("conversation-list"), counter = $("counter");
const STORAGE_KEY = "cowagent-puter-conversation-v1";
let busy = false;
let conversation = loadConversation();

function loadConversation() {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(value) && value.length ? value : [{ role: "assistant", content: "สวัสดีครับ 👋\nผมคือ CowAgent ผู้ช่วยของคุณ เริ่มต้นด้วยการเข้าสู่ระบบด้วย Puter แล้วถามอะไรก็ได้เลย" }]; } catch (_) { return [{ role: "assistant", content: "สวัสดีครับ 👋\nผมคือ CowAgent ผู้ช่วยของคุณ เริ่มต้นด้วยการเข้าสู่ระบบด้วย Puter แล้วถามอะไรก็ได้เลย" }]; }
}
function saveConversation() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation)); } catch (_) {} }
function showError(message = "") { errorBox.textContent = message; errorBox.classList.toggle("hidden", !message); }
function setReady(user) { const name = user?.username || user?.email || "ผู้ใช้ Puter"; status.innerHTML = `<i class="online-dot"></i>${escapeHtml(name)}`; status.classList.add("online"); login.classList.add("hidden"); logout.classList.remove("hidden"); prompt.disabled = false; prompt.placeholder = "พิมพ์ข้อความของคุณ..."; send.disabled = false; }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = String(value ?? ""); return div.innerHTML; }
function render() { messages.innerHTML = ""; conversation.forEach((item) => addMessage(item.role, item.content, false)); updateList(); saveConversation(); }
function addMessage(role, text, persist = true) { const row = document.createElement("article"); row.className = `message ${role}`; row.innerHTML = `<div class="avatar">${role === "user" ? "คุณ" : "C"}</div><div class="bubble"><span class="label">${role === "user" ? "คุณ" : "CowAgent"}</span><p></p></div>`; row.querySelector("p").textContent = text; messages.appendChild(row); messages.scrollTop = messages.scrollHeight; if (persist) { conversation.push({ role, content: text }); saveConversation(); updateList(); } }
function updateList() { const first = conversation.find((item) => item.role === "user"); list.innerHTML = `<button class="conversation active"><span class="mini-icon">✦</span><span>${escapeHtml(first ? first.content.slice(0, 28) : "บทสนทนาใหม่")}</span></button>`; }
function setBusy(value) { busy = value; send.disabled = value || !puter.auth.isSignedIn(); }
function extractText(result) { if (typeof result === "string") return result; if (result?.message?.content) return result.message.content; if (typeof result?.message === "string") return result.message; if (typeof result?.content === "string") return result.content; return JSON.stringify(result, null, 2); }

login.addEventListener("click", async () => { showError(""); login.disabled = true; login.textContent = "กำลังเปิดหน้าล็อกอิน..."; try { await puter.auth.signIn(); setReady(await puter.auth.getUser()); } catch (error) { showError(error?.msg || error?.message || "ล็อกอินไม่สำเร็จ กรุณาลองใหม่"); } finally { login.disabled = false; login.textContent = "เข้าสู่ระบบด้วย Puter"; } });
logout.addEventListener("click", () => { puter.auth.signOut(); location.reload(); });
$("new-chat").addEventListener("click", () => { conversation = [{ role: "assistant", content: "เริ่มบทสนทนาใหม่ได้เลยครับ ✨" }]; render(); prompt.focus(); });
$("clear-chat").addEventListener("click", () => { if (conversation.length > 1 && confirm("ล้างบทสนทนานี้หรือไม่?")) { conversation = [{ role: "assistant", content: "ล้างบทสนทนาแล้วครับ เริ่มใหม่ได้เลย ✨" }]; render(); } });
prompt.addEventListener("input", () => { counter.textContent = `${prompt.value.length} / 8000`; prompt.style.height = "auto"; prompt.style.height = `${Math.min(prompt.scrollHeight, 160)}px`; });

(async () => { render(); try { if (puter.auth.isSignedIn()) setReady(await puter.auth.getUser()); } catch (_) {} })();

$("composer").addEventListener("submit", async (event) => { event.preventDefault(); const text = prompt.value.trim(); if (!text || busy) return; if (!puter.auth.isSignedIn()) return showError("กรุณาเข้าสู่ระบบก่อนใช้งาน"); showError(""); prompt.value = ""; prompt.dispatchEvent(new Event("input")); addMessage("user", text); setBusy(true); const thinking = document.createElement("article"); thinking.className = "message assistant thinking-row"; thinking.innerHTML = `<div class="avatar">C</div><div class="bubble"><span class="label">CowAgent</span><p><span class="typing"><i></i><i></i><i></i></span></p></div>`; messages.appendChild(thinking); messages.scrollTop = messages.scrollHeight; try { const result = await puter.ai.chat(text); thinking.remove(); addMessage("assistant", extractText(result)); } catch (error) { thinking.remove(); showError(error?.message || "เรียก Puter AI ไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); prompt.focus(); } });
prompt.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("composer").requestSubmit(); } });
