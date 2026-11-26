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
    .select("id, name, created_at, checklists(id, items(done))")
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
    if (f.id === editingId) {
      listEl.append(renderEditRow(f.name, "แก้ไขชื่อโฟลเดอร์", (v) => renameFolder(f, v), stopEditing));
      continue;
    }
    const all = f.checklists.flatMap((c) => c.items);
    const done = all.filter((i) => i.done).length;
    const meta = f.checklists.length === 0
      ? "ยังไม่มี checklist"
      : `${f.checklists.length} checklist · ` + progressText(done, all.length);
    listEl.append(renderLinkRow({
      href: "folder.html?id=" + f.id,
      icon: FOLDER_SVG,
      name: f.name,
      meta,
      onEdit: () => { editingId = f.id; render(); },
      onDelete: () => deleteFolder(f),
    }));
  }
  progressEl.textContent = folders.length ? `มีทั้งหมด ${folders.length} โฟลเดอร์` : "สร้างโฟลเดอร์แรกกันเลย";
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
  const count = f.checklists.length;
  const msg = count
    ? `ลบโฟลเดอร์ "${f.name}" และ checklist ข้างในทั้งหมด ${count} อัน ใช่ไหม\nลบแล้วกู้คืนไม่ได้`
    : `ลบโฟลเดอร์ "${f.name}" ใช่ไหม`;
  if (!confirm(msg)) return;
  const { error } = await db.from("folders").delete().eq("id", f.id);
  if (error) { showStatus("ลบไม่สำเร็จ: " + error.message); return; }
  await logEvent("ลบโฟลเดอร์", { folder: f.name, detail: count ? `รวม checklist ข้างใน ${count} อัน` : null });
  await loadFolders();
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameEl.value.trim();
  if (!name) { nameEl.focus(); return; }
  addFolder(name);
});

// อัปเดตเองเมื่อคนอื่นแก้ข้อมูล
const onChange = () => { if (editingId === null) loadFolders(); else pendingReload = true; };
db.channel("folders-page")
  .on("postgres_changes", { event: "*", schema: "public", table: "folders" }, onChange)
  .on("postgres_changes", { event: "*", schema: "public", table: "checklists" }, onChange)
  .on("postgres_changes", { event: "*", schema: "public", table: "items" }, onChange)
  .subscribe();

loadFolders();
