// ส่วนที่ใช้ร่วมกันทุกหน้า (ต้องโหลดหลัง config.js)
const FOLDER_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" fill="var(--accent)" stroke="var(--accent-strong)" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

const CHECKLIST_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="3" fill="var(--surface)" stroke="var(--accent-strong)" stroke-width="1.6"/><rect x="9" y="2.5" width="6" height="3.5" rx="1.5" fill="var(--accent)" stroke="var(--accent-strong)" stroke-width="1.4"/><path d="M8.5 11l1.5 1.5 2.5-3M8.5 16.5l1.5 1.5 2.5-3" fill="none" stroke="var(--accent-strong)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 11.5h2M14.5 17h2" stroke="var(--accent-strong)" stroke-width="1.6" stroke-linecap="round"/></svg>`;

const ICON_BRAND = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>`;
const ICON_LIST = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/></svg>`;
const ICON_HISTORY = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>`;

// เมนูด้านซ้าย (มือถือจะเป็นแถบด้านล่าง)
(function mountSidebar() {
  const page = location.pathname.split("/").pop() || "index.html";
  const onHistory = page === "log.html";
  const aside = document.createElement("aside");
  aside.className = "sidebar";
  aside.innerHTML = `
    <div class="brand">
      <span class="brand-mark">${ICON_BRAND}</span>
      <span><strong>Checklist</strong><small>Workspace</small></span>
    </div>
    <nav class="nav" aria-label="เมนูหลัก">
      <a href="index.html" class="nav-item${onHistory ? "" : " active"}"${onHistory ? "" : ' aria-current="page"'}>${ICON_LIST}<span>Checklist</span></a>
      <a href="log.html" class="nav-item${onHistory ? " active" : ""}"${onHistory ? ' aria-current="page"' : ""}>${ICON_HISTORY}<span>History</span></a>
    </nav>
    <div class="side-note"><strong>ทีละนิดก็ถึง</strong>ติ๊กให้เสร็จวันละข้อ แล้วดูความคืบหน้าเพิ่มขึ้นเรื่อยๆ</div>`;
  document.body.prepend(aside);
  document.querySelectorAll("svg.bunny").forEach((el) => el.remove());
})();

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

// เด้งป้ายความคืบหน้าเมื่อทำรายการเสร็จ
function hop() {
  const badge = document.getElementById("progress");
  if (!badge) return;
  badge.classList.remove("pop");
  void badge.getBoundingClientRect();
  badge.classList.add("pop");
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
function renderLinkRow({ href, icon, name, meta, ratio = null, onEdit, onDelete }) {
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
  if (ratio !== null) {
    const bar = document.createElement("span");
    bar.className = "bar";
    const fill = document.createElement("span");
    fill.style.width = Math.round(ratio * 100) + "%";
    bar.append(fill);
    text.append(bar);
  }
  link.append(iconEl, text);

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(makeButton("แก้ไข", onEdit), makeButton("ลบ", onDelete, "danger"));

  li.append(link, actions);
  return li;
}
