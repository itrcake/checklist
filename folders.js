// หน้าแรก: รายการโฟลเดอร์
const listEl = document.getElementById("list");
const progressEl = document.getElementById("progress");
const formEl = document.getElementById("add-form");
const nameEl = document.getElementById("new-name");

let folders = [];
let editingId = null;
let pendingReload = false;

async function loadFolders() {
  const { data, error } = await db.from("folders")
    .select("id, name, created_at, items(done)")
    .order("created_at", { ascending: true });
  if (error) { showStatus("โหลดโฟลเดอร์ไม่สำเร็จ: " + error.message); return; }
  folders = data;
  render();
}

function render() {
  listEl.replaceChildren();
  if (folders.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "ยังไม่มีโฟลเดอร์ สร้างโฟลเดอร์แรกด้านบนได้เลย";
    listEl.append(li);
  }
  for (const f of folders) {
    listEl.append(f.id === editingId
      ? renderEditRow(f.name, "แก้ไขชื่อโฟลเดอร์", (v) => renameFolder(f, v), stopEditing)
      : renderFolderRow(f));
  }
  progressEl.textContent = folders.length ? `มีทั้งหมด ${folders.length} โฟลเดอร์` : "สร้างโฟลเดอร์แรกกันเลย";
}

function renderFolderRow(f) {
  const total = f.items.length;
  const done = f.items.filter((i) => i.done).length;

  const li = document.createElement("li");
  li.className = "item folder-row";

  const link = document.createElement("a");
  link.className = "folder-link";
  link.href = "folder.html?id=" + f.id;

  const icon = document.createElement("span");
  icon.className = "folder-icon";
  icon.innerHTML = FOLDER_SVG;

  const text = document.createElement("span");
  const name = document.createElement("span");
  name.className = "folder-name";
  name.textContent = f.name;
  const meta = document.createElement("span");
  meta.className = "folder-meta";
  meta.textContent = total === 0 ? "ยังไม่มีรายการ"
    : done === total ? `เสร็จครบ ${total} รายการ`
    : `เสร็จแล้ว ${done} จาก ${total} รายการ`;
  text.append(name, meta);
  link.append(icon, text);

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(
    makeButton("แก้ไข", () => { editingId = f.id; render(); }),
    makeButton("ลบ", () => deleteFolder(f), "danger"),
  );

  li.append(link, actions);
  return li;
}

function stopEditing() {
  editingId = null;
  if (pendingReload) { pendingReload = false; loadFolders(); } else { render(); }
}

async function addFolder(name) {
  const { error } = await db.from("folders").insert({ name });
  if (error) { showStatus("สร้างโฟลเดอร์ไม่สำเร็จ: " + error.message); return; }
  await logEvent("สร้างโฟลเดอร์", { folder: name });
  nameEl.value = "";
  await loadFolders();
}

async function renameFolder(f, newName) {
  newName = newName.trim();
  if (!newName) { showStatus("ชื่อโฟลเดอร์ว่างไม่ได้"); return; }
  if (newName === f.name) { stopEditing(); return; }
  const { error } = await db.from("folders").update({ name: newName }).eq("id", f.id);
  if (error) { showStatus("บันทึกไม่สำเร็จ: " + error.message); return; }
  await logEvent("เปลี่ยนชื่อโฟลเดอร์", { folder: newName, detail: "ชื่อเดิม: " + f.name });
  editingId = null;
  pendingReload = false;
  await loadFolders();
}

async function deleteFolder(f) {
  const count = f.items.length;
  const msg = count
    ? `ลบโฟลเดอร์ "${f.name}" และรายการข้างในทั้งหมด ${count} รายการ ใช่ไหม\nลบแล้วกู้คืนไม่ได้`
    : `ลบโฟลเดอร์ "${f.name}" ใช่ไหม`;
  if (!confirm(msg)) return;
  const { error } = await db.from("folders").delete().eq("id", f.id);
  if (error) { showStatus("ลบไม่สำเร็จ: " + error.message); return; }
  await logEvent("ลบโฟลเดอร์", { folder: f.name, detail: count ? `รวมรายการข้างใน ${count} รายการ` : null });
  await loadFolders();
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameEl.value.trim();
  if (!name) { nameEl.focus(); return; }
  addFolder(name);
});

// อัปเดตเองเมื่อคนอื่นแก้โฟลเดอร์หรือรายการ
const onChange = () => { if (editingId === null) loadFolders(); else pendingReload = true; };
db.channel("folders-page")
  .on("postgres_changes", { event: "*", schema: "public", table: "folders" }, onChange)
  .on("postgres_changes", { event: "*", schema: "public", table: "items" }, onChange)
  .subscribe();

loadFolders();
