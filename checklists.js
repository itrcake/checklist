// หน้าโฟลเดอร์: รายการ checklist ในโฟลเดอร์
const listEl = document.getElementById("list");
const progressEl = document.getElementById("progress");
const titleHeading = document.getElementById("folder-title");
const formEl = document.getElementById("add-form");
const nameEl = document.getElementById("new-name");

const folderId = Number(new URLSearchParams(location.search).get("id"));
let folder = null;
let checklists = [];
let editingId = null;
let pendingReload = false;

async function loadFolder() {
  if (!folderId) { location.replace("index.html"); return false; }
  const { data, error } = await db.from("folders").select("id, name").eq("id", folderId).maybeSingle();
  if (error) { showStatus("โหลดโฟลเดอร์ไม่สำเร็จ: " + error.message); return false; }
  if (!data) {
    folder = null;
    titleHeading.textContent = "ไม่พบโฟลเดอร์นี้";
    progressEl.textContent = "อาจถูกลบไปแล้ว กลับไปหน้าโฟลเดอร์ได้เลย";
    formEl.hidden = true;
    listEl.replaceChildren();
    return false;
  }
  folder = data;
  titleHeading.textContent = data.name;
  document.title = data.name + " · Checklist";
  return true;
}

async function loadChecklists() {
  const { data, error } = await db.from("checklists")
    .select("id, name, created_at, items(done)")
    .eq("folder_id", folderId)
    .order("created_at", { ascending: true });
  if (error) { showStatus("โหลด checklist ไม่สำเร็จ: " + error.message); return; }
  checklists = data;
  render();
}

function render() {
  listEl.replaceChildren();
  if (checklists.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "ยังไม่มี checklist ในโฟลเดอร์นี้ สร้างอันแรกด้านบนได้เลย";
    listEl.append(li);
  }
  for (const c of checklists) {
    if (c.id === editingId) {
      listEl.append(renderEditRow(c.name, "แก้ไขชื่อ checklist", (v) => renameChecklist(c, v), stopEditing));
      continue;
    }
    const done = c.items.filter((i) => i.done).length;
    listEl.append(renderLinkRow({
      href: "checklist.html?id=" + c.id,
      icon: CHECKLIST_SVG,
      name: c.name,
      meta: progressText(done, c.items.length),
      ratio: c.items.length ? done / c.items.length : null,
      onEdit: () => { editingId = c.id; render(); },
      onDelete: () => deleteChecklist(c),
    }));
  }
  const finished = checklists.filter((c) => c.items.length && c.items.every((i) => i.done)).length;
  progressEl.textContent = checklists.length === 0 ? "สร้าง checklist แรกกันเลย"
    : finished === checklists.length ? `ครบทุก checklist แล้ว เก่งมาก!`
    : `มี ${checklists.length} checklist · เสร็จครบแล้ว ${finished} อัน`;
}

function stopEditing() {
  editingId = null;
  if (pendingReload) { pendingReload = false; loadChecklists(); } else { render(); }
}

async function addChecklist(name) {
  const { error } = await db.from("checklists").insert({ name, folder_id: folderId });
  if (error) { showStatus("สร้าง checklist ไม่สำเร็จ: " + error.message); return; }
  await logEvent("สร้าง checklist", { folder: folder?.name, checklist: name });
  nameEl.value = "";
  await loadChecklists();
}

async function renameChecklist(c, newName) {
  newName = newName.trim();
  if (!newName) { showStatus("ชื่อ checklist ว่างไม่ได้"); return; }
  if (newName === c.name) { stopEditing(); return; }
  const { error } = await db.from("checklists").update({ name: newName }).eq("id", c.id);
  if (error) { showStatus("บันทึกไม่สำเร็จ: " + error.message); return; }
  await logEvent("เปลี่ยนชื่อ checklist", { folder: folder?.name, checklist: newName, detail: "ชื่อเดิม: " + c.name });
  editingId = null;
  pendingReload = false;
  await loadChecklists();
}

async function deleteChecklist(c) {
  const count = c.items.length;
  const msg = count
    ? `ลบ checklist "${c.name}" และรายการข้างในทั้งหมด ${count} รายการ ใช่ไหม\nลบแล้วกู้คืนไม่ได้`
    : `ลบ checklist "${c.name}" ใช่ไหม`;
  if (!confirm(msg)) return;
  const { error } = await db.from("checklists").delete().eq("id", c.id);
  if (error) { showStatus("ลบไม่สำเร็จ: " + error.message); return; }
  await logEvent("ลบ checklist", { folder: folder?.name, checklist: c.name, detail: count ? `รวมรายการข้างใน ${count} รายการ` : null });
  await loadChecklists();
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameEl.value.trim();
  if (!name) { nameEl.focus(); return; }
  if (!folder) return;
  addChecklist(name);
});

// อัปเดตเองเมื่อคนอื่นแก้ข้อมูล
const onChange = () => { if (editingId === null) loadChecklists(); else pendingReload = true; };
db.channel("folder-" + folderId)
  .on("postgres_changes", { event: "*", schema: "public", table: "checklists", filter: "folder_id=eq." + folderId }, onChange)
  .on("postgres_changes", { event: "*", schema: "public", table: "items" }, onChange)
  .on("postgres_changes", { event: "*", schema: "public", table: "folders" }, async () => {
    if (await loadFolder()) render();
  })
  .subscribe();

(async () => { if (await loadFolder()) await loadChecklists(); })();
