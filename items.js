// หน้าโฟลเดอร์: รายการ checklist ในโฟลเดอร์
const listEl = document.getElementById("list");
const progressEl = document.getElementById("progress");
const titleHeading = document.getElementById("folder-title");
const formEl = document.getElementById("add-form");
const titleEl = document.getElementById("new-title");

const folderId = Number(new URLSearchParams(location.search).get("id"));
let folder = null;
let items = [];
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

async function loadItems() {
  const { data, error } = await db.from("items")
    .select("*")
    .eq("folder_id", folderId)
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
  const { error } = await db.from("items").insert({ title, folder_id: folderId });
  if (error) { showStatus("เพิ่มรายการไม่สำเร็จ: " + error.message); return; }
  await logEvent("เพิ่มรายการ", { item: title, folder: folder?.name });
  titleEl.value = "";
  await loadItems();
}

async function toggleDone(item, done) {
  const { error } = await db.from("items")
    .update({ done, updated_at: new Date().toISOString() })
    .eq("id", item.id);
  if (error) { showStatus("อัปเดตไม่สำเร็จ: " + error.message); render(); return; }
  await logEvent(done ? "ทำเครื่องหมายเสร็จ" : "ยกเลิกสถานะเสร็จ", { item: item.title, folder: folder?.name });
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
  await logEvent("แก้ไขรายการ", { item: newTitle, folder: folder?.name, detail: "ชื่อเดิม: " + item.title });
  editingId = null;
  pendingReload = false;
  await loadItems();
}

async function deleteItem(item) {
  if (!confirm(`ลบ "${item.title}" ใช่ไหม`)) return;
  const { error } = await db.from("items").delete().eq("id", item.id);
  if (error) { showStatus("ลบไม่สำเร็จ: " + error.message); return; }
  await logEvent("ลบรายการ", { item: item.title, folder: folder?.name });
  await loadItems();
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  if (!title) { titleEl.focus(); return; }
  if (!folder) return;
  addItem(title);
});

// อัปเดตเองเมื่อคนอื่นแก้รายการ หรือเปลี่ยนชื่อ/ลบโฟลเดอร์นี้
db.channel("folder-" + folderId)
  .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: "folder_id=eq." + folderId }, () => {
    if (editingId === null) loadItems(); else pendingReload = true;
  })
  .on("postgres_changes", { event: "*", schema: "public", table: "folders" }, async () => {
    if (await loadFolder()) render();
  })
  .subscribe();

(async () => { if (await loadFolder()) await loadItems(); })();
