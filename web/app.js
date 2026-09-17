const $ = (id) => document.getElementById(id);
const login = $("login"), logout = $("logout"), status = $("status");
const prompt = $("prompt"), send = $("send"), messages = $("messages"), errorBox = $("error");
let busy = false;

function showError(message = "") { errorBox.textContent = message; errorBox.classList.toggle("hidden", !message); }
function setReady(user) {
  const name = user?.username || user?.email || "ผู้ใช้ Puter";
  status.textContent = `● ${name}`; status.classList.add("online");
  login.classList.add("hidden"); logout.classList.remove("hidden"); prompt.disabled = false; send.disabled = false;
}
function addMessage(role, text) {
  const row = document.createElement("div"); row.className = `message ${role}`;
  row.innerHTML = `<div class="avatar">${role === "user" ? "คุณ" : "C"}</div><div><span class="label">${role === "user" ? "คุณ" : "CowAgent"}</span><p></p></div>`;
  row.querySelector("p").textContent = text; messages.appendChild(row); messages.scrollTop = messages.scrollHeight;
}

login.addEventListener("click", async () => {
  showError(""); login.disabled = true; login.textContent = "กำลังเปิดหน้าล็อกอิน...";
  try { await puter.auth.signIn(); setReady(await puter.auth.getUser()); }
  catch (e) { showError(e?.msg || e?.message || "ล็อกอินไม่สำเร็จ กรุณาลองใหม่"); }
  finally { login.disabled = false; login.textContent = "เข้าสู่ระบบด้วย Puter"; }
});
logout.addEventListener("click", () => { puter.auth.signOut(); location.reload(); });

(async () => { try { if (puter.auth.isSignedIn()) setReady(await puter.auth.getUser()); } catch (_) {} })();

$("composer").addEventListener("submit", async (event) => {
  event.preventDefault(); const text = prompt.value.trim();
  if (!text || busy) return; if (!puter.auth.isSignedIn()) return showError("กรุณาเข้าสู่ระบบก่อนใช้งาน");
  busy = true; showError(""); prompt.value = ""; addMessage("user", text); send.disabled = true;
  const thinking = document.createElement("div"); thinking.className = "thinking"; thinking.textContent = "กำลังคิด..."; messages.appendChild(thinking); messages.scrollTop = messages.scrollHeight;
  try { const result = await puter.ai.chat(text); thinking.remove(); const answer = typeof result === "string" ? result : result?.message?.content || result?.message || result?.content || JSON.stringify(result, null, 2); addMessage("assistant", answer); }
  catch (e) { thinking.remove(); showError(e?.message || "เรียก Puter AI ไม่สำเร็จ"); }
  finally { busy = false; send.disabled = false; prompt.focus(); }
});
