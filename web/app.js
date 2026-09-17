const STORAGE_KEY = "cowagent-tasks-v1";
const THEME_KEY = "cowagent-theme-v1";
const $ = (id) => document.getElementById(id);
let tasks = loadTasks();
let currentFilter = "all";

function loadTasks() {
  try { const data = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(data) ? data : []; }
  catch (_) { return []; }
}
function saveTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); const status = $("save-status"); status.textContent = "บันทึกแล้ว ✓"; setTimeout(() => { status.textContent = "บันทึกอัตโนมัติ"; }, 1200); }
function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function escapeText(value) { return String(value ?? ""); }
function visibleTasks() {
  const query = $("search-input").value.trim().toLowerCase();
  return tasks.filter((task) => (currentFilter === "all" || (currentFilter === "active" && !task.completed) || (currentFilter === "completed" && task.completed)) && (!query || task.text.toLowerCase().includes(query)));
}
function render() {
  const list = $("task-list"); list.replaceChildren();
  const visible = visibleTasks();
  visible.forEach((task) => {
    const item = document.createElement("article"); item.className = `task ${task.completed ? "completed" : ""}`; item.dataset.id = task.id; item.setAttribute("role", "listitem");
    const check = document.createElement("button"); check.className = "check"; check.type = "button"; check.setAttribute("aria-label", task.completed ? "ทำเครื่องหมายว่ายังไม่เสร็จ" : "ทำเครื่องหมายว่าเสร็จแล้ว"); check.textContent = task.completed ? "✓" : ""; check.addEventListener("click", () => toggleTask(task.id));
    const text = document.createElement("span"); text.className = "task-text"; text.textContent = escapeText(task.text); text.title = "ดับเบิลคลิกเพื่อแก้ไข"; text.addEventListener("dblclick", () => editTask(task.id, text));
    const priority = document.createElement("span"); priority.className = `priority ${task.priority}`; priority.textContent = task.priority === "high" ? "สำคัญ" : task.priority === "low" ? "ไม่เร่งด่วน" : "ปกติ";
    const edit = document.createElement("button"); edit.className = "row-button"; edit.type = "button"; edit.title = "แก้ไข"; edit.textContent = "✎"; edit.addEventListener("click", () => editTask(task.id, text));
    const remove = document.createElement("button"); remove.className = "row-button danger"; remove.type = "button"; remove.title = "ลบ"; remove.textContent = "×"; remove.addEventListener("click", () => removeTask(task.id));
    item.append(check, text, priority, edit, remove); list.append(item);
  });
  const completed = tasks.filter((t) => t.completed).length; const active = tasks.length - completed; const percent = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  $("all-count").textContent = tasks.length; $("active-count").textContent = active; $("completed-count").textContent = completed; $("remaining-text").textContent = `${active} งานที่เหลือ`; $("progress-value").textContent = `${percent}%`; $("progress-ring").style.setProperty("--progress", `${percent * 3.6}deg`);
  const empty = $("empty-state"); empty.classList.toggle("hidden", visible.length > 0); $("empty-title").textContent = tasks.length && !visible.length ? "ไม่พบงานที่ค้นหา" : "ยังไม่มีงาน"; $("empty-copy").textContent = tasks.length && !visible.length ? "ลองเปลี่ยนคำค้นหาหรือตัวกรอง" : "เพิ่มงานแรกของคุณ แล้วเริ่มลงมือกันเลย";
}
function addTask(event) { event.preventDefault(); const input = $("task-input"); const text = input.value.trim(); if (!text) { input.focus(); return; } tasks.unshift({ id: makeId(), text, priority: $("priority-input").value, completed: false, createdAt: Date.now() }); input.value = ""; $("priority-input").value = "normal"; saveTasks(); render(); input.focus(); }
function toggleTask(id) { const task = tasks.find((item) => item.id === id); if (task) { task.completed = !task.completed; task.completedAt = task.completed ? Date.now() : null; saveTasks(); render(); } }
function removeTask(id) { tasks = tasks.filter((task) => task.id !== id); saveTasks(); render(); }
function editTask(id, target) { const task = tasks.find((item) => item.id === id); if (!task || task.completed) return; const input = document.createElement("input"); input.className = "edit-input"; input.value = task.text; target.replaceWith(input); input.focus(); input.select(); const finish = () => { const value = input.value.trim(); if (value) task.text = value; saveTasks(); render(); }; input.addEventListener("blur", finish, { once: true }); input.addEventListener("keydown", (event) => { if (event.key === "Enter") input.blur(); if (event.key === "Escape") { input.value = task.text; input.blur(); } }); }
$("add-form").addEventListener("submit", addTask); $("search-input").addEventListener("input", render); $("clear-completed").addEventListener("click", () => { if (tasks.some((task) => task.completed) && confirm("ลบงานที่เสร็จแล้วทั้งหมดหรือไม่?")) { tasks = tasks.filter((task) => !task.completed); saveTasks(); render(); } });
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => { currentFilter = button.dataset.filter; document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button)); render(); }));
$("theme-toggle").addEventListener("click", () => { document.body.classList.toggle("light"); localStorage.setItem(THEME_KEY, document.body.classList.contains("light") ? "light" : "dark"); });
if (localStorage.getItem(THEME_KEY) === "light") document.body.classList.add("light");
render();
