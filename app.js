const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const nameEl = document.getElementById("name");
const formEl = document.getElementById("add-form");
const titleEl = document.getElementById("new-title");

let items = [];
let editingId = null;      // รายการที่กำลังแก้ไขอยู่
let pendingReload = false; // มีคนอื่นแก้ระหว่างที่เรากำลังแก้ไข

nameEl.value = getName();
nameEl.addEventListener("change", () => setName(nameEl.value.trim()));

function showStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ""; }, 4000);
}

function requireName() {
  const name = nameEl.value.trim();
  if (!name) {
    showStatus("ใส่ชื่อของคุณก่อน ระบบจะได้บันทึกว่าใครเป็นคนทำ");
    nameEl.focus();
    return false;
  }
  setName(name);
  return true;
}

async function loadItems() {
  const { data, error } = await db.from("items").select("*").order("created_at", { ascending: true });
  if (error) { showStatus("โหลดรายการไม่สำเร็จ: " + error.message); return; }
  items = data;
  render();
}

function makeButton(text, onClick, extraClass = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = ("ghost " + extraClass).trim();
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function render() {
  listEl.replaceChildren();
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "ยังไม่มีรายการ พิมพ์ด้านบนแล้วกดเพิ่มได้เลย";
    listEl.append(li);
  }
  for (const item of items) {
    listEl.append(item.id === editingId ? renderEditRow(item) : renderRow(item));
  }
  const done = items.filter((i) => i.done).length;
  if (items.length === 0) progressEl.textContent = "มาเริ่มรายการแรกกัน";
  else if (done === items.length) progressEl.textContent = `เสร็จครบ ${done} รายการแล้ว เก่งมาก!`;
  else progressEl.textContent = `เสร็จแล้ว ${done} จาก ${items.length} รายการ`;
}

function renderRow(item) {
  const li = document.createElement("li");
  li.className = "item" + (item.done ? " is-done" : "");

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.id = "cb-" + item.id;
  cb.checked = item.done;
  cb.addEventListener("change", () => toggleDone(item, cb.checked));

  const label = document.createElement("label");
  label.htmlFor = cb.id;
  label.className = "title";
  label.textContent = item.title;

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(
    makeButton("แก้ไข", () => { editingId = item.id; render(); }),
    makeButton("ลบ", () => deleteItem(item), "danger"),
  );

  li.append(cb, label, actions);
  return li;
}

function renderEditRow(item) {
  const li = document.createElement("li");
  li.className = "item";

  const input = document.createElement("input");
  input.className = "edit-input";
  input.value = item.title;
  input.maxLength = 200;
  input.setAttribute("aria-label", "แก้ไขชื่อรายการ");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveEdit(item, input.value);
    if (e.key === "Escape") stopEditing();
  });

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(
    makeButton("บันทึก", () => saveEdit(item, input.value)),
    makeButton("ยกเลิก", stopEditing),
  );

  li.append(input, actions);
  queueMicrotask(() => input.focus());
  return li;
}

// กระต่ายกระโดดดีใจเมื่อมีรายการเสร็จ
function hop() {
  const bunny = document.getElementById("bunny");
  if (!bunny) return;
  bunny.classList.remove("hop");
  void bunny.getBoundingClientRect();
  bunny.classList.add("hop");
}

function stopEditing() {
  editingId = null;
  if (pendingReload) { pendingReload = false; loadItems(); } else { render(); }
}

async function addItem(title) {
  const { error } = await db.from("items").insert({ title });
  if (error) { showStatus("เพิ่มรายการไม่สำเร็จ: " + error.message); return; }
  await writeLog("เพิ่มรายการ", title);
  titleEl.value = "";
  await loadItems();
}

async function toggleDone(item, done) {
  if (!requireName()) { render(); return; }
  const { error } = await db.from("items")
    .update({ done, updated_at: new Date().toISOString() })
    .eq("id", item.id);
  if (error) { showStatus("อัปเดตไม่สำเร็จ: " + error.message); render(); return; }
  await writeLog(done ? "ทำเครื่องหมายเสร็จ" : "ยกเลิกสถานะเสร็จ", item.title);
  if (done) hop();
  await loadItems();
}

async function saveEdit(item, newTitle) {
  newTitle = newTitle.trim();
  if (!newTitle) { showStatus("ชื่อรายการว่างไม่ได้"); return; }
  if (!requireName()) return;
  if (newTitle === item.title) { stopEditing(); return; }
  const { error } = await db.from("items")
    .update({ title: newTitle, updated_at: new Date().toISOString() })
    .eq("id", item.id);
  if (error) { showStatus("บันทึกไม่สำเร็จ: " + error.message); return; }
  await writeLog("แก้ไขรายการ", newTitle, "ชื่อเดิม: " + item.title);
  editingId = null;
  pendingReload = false;
  await loadItems();
}

async function deleteItem(item) {
  if (!requireName()) return;
  if (!confirm(`ลบ "${item.title}" ใช่ไหม`)) return;
  const { error } = await db.from("items").delete().eq("id", item.id);
  if (error) { showStatus("ลบไม่สำเร็จ: " + error.message); return; }
  await writeLog("ลบรายการ", item.title);
  await loadItems();
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  if (!title) { titleEl.focus(); return; }
  if (!requireName()) return;
  addItem(title);
});

// เมื่อคนอื่นแก้รายการ หน้านี้จะอัปเดตเองโดยไม่ต้องรีเฟรช
db.channel("items-changes")
  .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => {
    if (editingId === null) loadItems(); else pendingReload = true;
  })
  .subscribe();

loadItems();
