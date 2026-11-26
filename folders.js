// หน้าแรก: รายการ checklist ทั้งหมด
const listEl = document.getElementById("list");
const progressEl = document.getElementById("progress");
const formEl = document.getElementById("add-form");
const nameEl = document.getElementById("new-name");

let lists = [];
let editingId = null;
let pendingReload = false;

function taskText(done, total) {
  if (total === 0) return "ยังไม่มีงาน";
  if (done === total) return `เสร็จครบ ${total} งาน`;
  return `เสร็จแล้ว ${done} จาก ${total} งาน`;
}

async function loadLists() {
  const { data, error } = await db.from("folders")
    .select("id, name, created_at, items(done)")
    .order("created_at", { ascending: true });
  if (error) { showStatus("โหลด checklist ไม่สำเร็จ: " + error.message); return; }
  lists = data;
  render();
}

function render() {
  listEl.replaceChildren();
  if (lists.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "ยังไม่มี checklist สร้างอันแรกด้านบนได้เลย";
    listEl.append(li);
  }
  for (const l of lists) {
    if (l.id === editingId) {
      listEl.append(renderEditRow(l.name, "แก้ไขชื่อ checklist", (v) => renameList(l, v), stopEditing));
      continue;
    }
    const total = l.items.length;
    const done = l.items.filter((i) => i.done).length;
    listEl.append(renderLinkRow({
      href: "folder.html?id=" + l.id,
      icon: CHECKLIST_SVG,
      name: l.name,
      meta: taskText(done, total),
      ratio: total ? done / total : null,
      onEdit: () => { editingId = l.id; render(); },
      onDelete: () => deleteList(l),
    }));
  }
  progressEl.textContent = lists.length ? `มีทั้งหมด ${lists.length} checklist` : "สร้าง checklist แรกกันเลย";
}

function stopEditing() {
  editingId = null;
  if (pendingReload) { pendingReload = false; loadLists(); } else { render(); }
}

async function addList(name) {
  const { error } = await db.from("folders").insert({ name });
  if (error) { showStatus("สร้าง checklist ไม่สำเร็จ: " + error.message); return; }
  await logEvent("สร้าง checklist", { folder: name });
  nameEl.value = "";
  await loadLists();
}

async function renameList(l, newName) {
  newName = newName.trim();
  if (!newName) { showStatus("ชื่อ checklist ว่างไม่ได้"); return; }
  if (newName === l.name) { stopEditing(); return; }
  const { error } = await db.from("folders").update({ name: newName }).eq("id", l.id);
  if (error) { showStatus("บันทึกไม่สำเร็จ: " + error.message); return; }
  await logEvent("เปลี่ยนชื่อ checklist", { folder: newName, detail: "ชื่อเดิม: " + l.name });
  editingId = null;
  pendingReload = false;
  await loadLists();
}

async function deleteList(l) {
  const count = l.items.length;
  const msg = count
    ? `ลบ checklist "${l.name}" และงานข้างในทั้งหมด ${count} งาน ใช่ไหม\nลบแล้วกู้คืนไม่ได้`
    : `ลบ checklist "${l.name}" ใช่ไหม`;
  if (!confirm(msg)) return;
  const { error } = await db.from("folders").delete().eq("id", l.id);
  if (error) { showStatus("ลบไม่สำเร็จ: " + error.message); return; }
  await logEvent("ลบ checklist", { folder: l.name, detail: count ? `รวมงานข้างใน ${count} งาน` : null });
  await loadLists();
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameEl.value.trim();
  if (!name) { nameEl.focus(); return; }
  addList(name);
});

// อัปเดตเองเมื่อคนอื่นแก้ข้อมูล
const onChange = () => { if (editingId === null) loadLists(); else pendingReload = true; };
db.channel("lists-page")
  .on("postgres_changes", { event: "*", schema: "public", table: "folders" }, onChange)
  .on("postgres_changes", { event: "*", schema: "public", table: "items" }, onChange)
  .subscribe();

loadLists();
