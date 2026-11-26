// ส่วนที่ใช้ร่วมกันทุกหน้า (ต้องโหลดหลัง config.js)
const BUNNY_SVG = `
<ellipse cx="42" cy="34" rx="12" ry="30" transform="rotate(-12 42 34)" fill="var(--bunny)" stroke="var(--ink)" stroke-width="3"/>
<ellipse cx="42" cy="38" rx="5.5" ry="19" transform="rotate(-12 42 38)" fill="var(--bunny-inner)"/>
<ellipse cx="78" cy="34" rx="12" ry="30" transform="rotate(12 78 34)" fill="var(--bunny)" stroke="var(--ink)" stroke-width="3"/>
<ellipse cx="78" cy="38" rx="5.5" ry="19" transform="rotate(12 78 38)" fill="var(--bunny-inner)"/>
<path d="M88 13c-2-4-8-3-8 1 0 4 8 8 8 8s8-4 8-8c0-4-6-5-8-1z" fill="var(--accent)" stroke="var(--ink)" stroke-width="2"/>
<ellipse cx="60" cy="80" rx="40" ry="31" fill="var(--bunny)" stroke="var(--ink)" stroke-width="3"/>
<ellipse cx="46" cy="77" rx="3.6" ry="4.6" fill="var(--ink)"/>
<ellipse cx="74" cy="77" rx="3.6" ry="4.6" fill="var(--ink)"/>
<circle cx="47.4" cy="75.2" r="1.3" fill="#fff"/>
<circle cx="75.4" cy="75.2" r="1.3" fill="#fff"/>
<ellipse cx="35" cy="88" rx="6.5" ry="3.8" fill="var(--bunny-inner)"/>
<ellipse cx="85" cy="88" rx="6.5" ry="3.8" fill="var(--bunny-inner)"/>
<path d="M57 84h6l-3 3.2z" fill="var(--accent-strong)" stroke="var(--accent-strong)" stroke-linejoin="round" stroke-width="1.5"/>
<path d="M54 90q3 3.5 6 0q3 3.5 6 0" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round"/>`;

const FOLDER_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" fill="var(--accent)" stroke="var(--accent-strong)" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

const CHECKLIST_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="3" fill="var(--surface)" stroke="var(--accent-strong)" stroke-width="1.6"/><rect x="9" y="2.5" width="6" height="3.5" rx="1.5" fill="var(--accent)" stroke="var(--accent-strong)" stroke-width="1.4"/><path d="M8.5 11l1.5 1.5 2.5-3M8.5 16.5l1.5 1.5 2.5-3" fill="none" stroke="var(--accent-strong)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 11.5h2M14.5 17h2" stroke="var(--accent-strong)" stroke-width="1.6" stroke-linecap="round"/></svg>`;

// วาดกระต่ายลงในช่อง <svg class="bunny"> ของแต่ละหน้า
document.querySelectorAll("svg.bunny").forEach((svg) => {
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.innerHTML = BUNNY_SVG;
});

const statusEl = document.getElementById("status");

function showStatus(msg) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ""; }, 4000);
}

function makeButton(text, onClick, extraClass = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = ("ghost " + extraClass).trim();
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

// กระต่ายกระโดดดีใจ
function hop() {
  const bunny = document.getElementById("bunny");
  if (!bunny) return;
  bunny.classList.remove("hop");
  void bunny.getBoundingClientRect();
  bunny.classList.add("hop");
}

// บันทึกประวัติ (ไม่เก็บชื่อคน)
async function logEvent(action, { item = null, folder = null, checklist = null, detail = null } = {}) {
  const { error } = await db.from("activity_log").insert({
    actor: null,
    action,
    item_title: item,
    folder_name: folder,
    checklist_name: checklist,
    detail,
  });
  if (error) console.error("บันทึกประวัติไม่สำเร็จ", error);
}

// แถวแก้ไขชื่อแบบเดียวกันทั้งโฟลเดอร์และรายการ
function renderEditRow(value, label, onSave, onCancel) {
  const li = document.createElement("li");
  li.className = "item";
  const input = document.createElement("input");
  input.className = "edit-input";
  input.value = value;
  input.maxLength = 200;
  input.setAttribute("aria-label", label);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSave(input.value);
    if (e.key === "Escape") onCancel();
  });
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(makeButton("บันทึก", () => onSave(input.value)), makeButton("ยกเลิก", onCancel));
  li.append(input, actions);
  queueMicrotask(() => input.focus());
  return li;
}

// ข้อความความคืบหน้า
function progressText(done, total, emptyText = "ยังไม่มีรายการ") {
  if (total === 0) return emptyText;
  if (done === total) return `เสร็จครบ ${total} รายการ`;
  return `เสร็จแล้ว ${done} จาก ${total} รายการ`;
}

// แถวที่กดเข้าไปได้ (ใช้กับโฟลเดอร์และ checklist)
function renderLinkRow({ href, icon, name, meta, onEdit, onDelete }) {
  const li = document.createElement("li");
  li.className = "item folder-row";

  const link = document.createElement("a");
  link.className = "folder-link";
  link.href = href;

  const iconEl = document.createElement("span");
  iconEl.className = "folder-icon";
  iconEl.innerHTML = icon;

  const text = document.createElement("span");
  const nameEl = document.createElement("span");
  nameEl.className = "folder-name";
  nameEl.textContent = name;
  const metaEl = document.createElement("span");
  metaEl.className = "folder-meta";
  metaEl.textContent = meta;
  text.append(nameEl, metaEl);
  link.append(iconEl, text);

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(makeButton("แก้ไข", onEdit), makeButton("ลบ", onDelete, "danger"));

  li.append(link, actions);
  return li;
}
