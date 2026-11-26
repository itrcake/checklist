// หน้า checklist: รายการย่อยใน checklist
const listEl = document.getElementById("list");
const progressEl = document.getElementById("progress");
const titleHeading = document.getElementById("checklist-title");
const crumbEl = document.getElementById("crumb");
const formEl = document.getElementById("add-form");
const titleEl = document.getElementById("new-title");

const checklistId = Number(new URLSearchParams(location.search).get("id"));
let checklist = null;
let folder = null;
let items = [];
let editingId = null;
let pendingReload = false;

async function loadChecklist() {
  if (!checklistId) { location.replace("index.html"); return false; }
  const { data, error } = await db.from("checklists")
    .select("id, name, folder_id, folders(id, name)")
    .eq("id", checklistId)
    .maybeSingle();
  if (error) { showStatus("โหลด checklist ไม่สำเร็จ: " + error.message); return false; }
  if (!data) {
    checklist = null;
    titleHeading.textContent = "ไม่พบ checklist นี้";
    progressEl.textContent = "อาจถูกลบไปแล้ว กลับไปหน้าโฟลเดอร์ได้เลย";
    formEl.hidden = true;
    listEl.replaceChildren();
    return false;
  }
  checklist = data;
  folder = data.folders;
  titleHeading.textContent = data.name;
  crumbEl.href = "folder.html?id=" + data.folder_id;
  crumbEl.textContent = "← " + (folder?.name ?? "โฟลเดอร์");
  document.title = data.name + " · Checklist";
  return true;
}

async function loadItems() {
  const { data, error } = await db.from("items")
    .select("*")
    .eq("checklist_id", checklistId)
    .order("created_at", { ascending: true });
  if (error) { showStatus("โหลดรายการไม่สำเร็จ: " + error.message); return; }
  items = data;
  render();
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
    listEl.append(item.id === editingId
      ? renderEditRow(item.title, "แก้ไขชื่อรายการ", (v) => saveEdit(item, v), stopEditing)
      : renderRow(item));
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

function stopEditing() {
  editingId = null;
  if (pendingReload) { pendingReload = false; loadItems(); } else { render(); }
}

async function addItem(title) {
  const { error } = await db.from("items").insert({ title, checklist_id: checklistId });
  if (error) { showStatus("เพิ่มรายการไม่สำเร็จ: " + error.message); return; }
  await logEvent("เพิ่มรายการ", { item: title, folder: folder?.name, checklist: checklist?.name });
  titleEl.value = "";
  await loadItems();
}

async function toggleDone(item, done) {
  const { error } = await db.from("items")
    .update({ done, updated_at: new Date().toISOString() })
    .eq("id", item.id);
  if (error) { showStatus("อัปเดตไม่สำเร็จ: " + error.message); render(); return; }
  await logEvent(done ? "ทำเครื่องหมายเสร็จ" : "ยกเลิกสถานะเสร็จ", { item: item.title, folder: folder?.name, checklist: checklist?.name });
  if (done) hop();
  await loadItems();
}

async function saveEdit(item, newTitle) {
  newTitle = newTitle.trim();
  if (!newTitle) { showStatus("ชื่อรายการว่างไม่ได้"); return; }
  if (newTitle === item.title) { stopEditing(); return; }
  const { error } = await db.from("items")
    .update({ title: newTitle, updated_at: new Date().toISOString() })
    .eq("id", item.id);
  if (error) { showStatus("บันทึกไม่สำเร็จ: " + error.message); return; }
  await logEvent("แก้ไขรายการ", { item: newTitle, folder: folder?.name, checklist: checklist?.name, detail: "ชื่อเดิม: " + item.title });
  editingId = null;
  pendingReload = false;
  await loadItems();
}

async function deleteItem(item) {
  if (!confirm(`ลบ "${item.title}" ใช่ไหม`)) return;
  const { error } = await db.from("items").delete().eq("id", item.id);
  if (error) { showStatus("ลบไม่สำเร็จ: " + error.message); return; }
  await logEvent("ลบรายการ", { item: item.title, folder: folder?.name, checklist: checklist?.name });
  await loadItems();
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  if (!title) { titleEl.focus(); return; }
  if (!checklist) return;
  addItem(title);
});

// อัปเดตเองเมื่อคนอื่นแก้รายการ หรือเปลี่ยนชื่อ/ลบ checklist นี้
db.channel("checklist-" + checklistId)
  .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: "checklist_id=eq." + checklistId }, () => {
    if (editingId === null) loadItems(); else pendingReload = true;
  })
  .on("postgres_changes", { event: "*", schema: "public", table: "checklists" }, async () => {
    if (await loadChecklist()) render();
  })
  .on("postgres_changes", { event: "*", schema: "public", table: "folders" }, async () => {
    if (await loadChecklist()) render();
  })
  .subscribe();

(async () => { if (await loadChecklist()) await loadItems(); })();
