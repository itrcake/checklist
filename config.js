// ใส่ค่าจาก Supabase → Project Settings → API Keys
const SUPABASE_URL = "https://YOUR-PROJECT-ID.supabase.co";
const SUPABASE_KEY = "YOUR-PUBLISHABLE-OR-ANON-KEY";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const NAME_KEY = "checklist-user-name";

function getName() {
  try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
}

function setName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch {}
}

async function writeLog(action, itemTitle, detail = null) {
  const { error } = await db.from("activity_log").insert({
    actor: getName(),
    action,
    item_title: itemTitle,
    detail,
  });
  if (error) console.error("บันทึกประวัติไม่สำเร็จ", error);
}
