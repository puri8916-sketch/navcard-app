/**
 * navcard-app sync backend — stores the app's data in this Google Sheet.
 *
 * ติดตั้ง (ทำครั้งเดียว):
 *   1. แก้ KEYS ด้านล่างเป็นรหัสเข้าใช้ของคุณ (ตั้งเองได้ เช่น "songkhla-2569")
 *   2. Deploy › New deployment › Web app
 *        Execute as: Me   |   Who has access: Anyone
 *   3. คัดลอก Web app URL (ลงท้าย /exec) ไปใส่ในแอป: บันทึกประจำวัน › ตั้งค่า › เชื่อมต่อ Google Sheet
 *
 * เพิ่มผู้ใช้ในอนาคต: เพิ่มรหัสใน KEYS แล้วกด Deploy › Manage deployments › แก้ไข › Version: New version
 * ยกเลิกสิทธิ์: ลบรหัสนั้นออกจาก KEYS แล้ว deploy version ใหม่
 */
const KEYS = ['เปลี่ยนเป็นรหัสของคุณ'];

const SHEET = 'data';
const HEAD = ['col', 'id', 'seq', 'updated', 'deleted', 'json', 'สรุป'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEET);
  if (!s) {
    s = ss.insertSheet(SHEET);
    s.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
    s.setFrozenRows(1);
    // keep ids / JSON as plain text so Sheets never turns "12-10" into a date
    s.getRange('A:B').setNumberFormat('@');
    s.getRange('F:G').setNumberFormat('@');
  }
  return s;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function authed_(k) {
  k = String(k || '');
  return k !== '' && k !== 'เปลี่ยนเป็นรหัสของคุณ' && KEYS.indexOf(k) >= 0;
}

function rows_(s) {
  const n = s.getLastRow();
  return n < 2 ? [] : s.getRange(2, 1, n - 1, HEAD.length).getValues();
}

function summary_(col, d, del) {
  if (del || !d) return '(ลบแล้ว)';
  if (col === 'calls') return [d.date, d.job, d.vessel, d.closeNo].filter(Boolean).join(' · ');
  if (col === 'vessels') return [d.name, d.loa, d.agent].filter(Boolean).join(' · ');
  if (col === 'calcShips') return [d.value, d.result].filter(Boolean).join(' → ');
  return '';
}

/** GET ?action=ping&key=…            → {ok, counts}
 *  GET ?action=load&key=…&since=SEQ   → {ok, now, docs:[{col,id,updated,deleted,doc}]} (changes after SEQ) */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!authed_(p.key)) return out_({ ok: false, error: 'bad_key' });
  const rows = rows_(sheet_());
  if (p.action === 'ping') {
    const counts = {};
    rows.forEach(function (r) { if (r[4] !== true) counts[r[0]] = (counts[r[0]] || 0) + 1; });
    return out_({ ok: true, counts: counts });
  }
  const since = Number(p.since || 0);
  let now = Number(PropertiesService.getScriptProperties().getProperty('SEQ') || 0);
  const docs = [];
  rows.forEach(function (r) {
    const seq = Number(r[2]);
    if (seq > now) now = seq;
    if (seq <= since) return;
    const del = r[4] === true;
    docs.push({ col: String(r[0]), id: String(r[1]), updated: Number(r[3]), deleted: del, doc: del ? null : JSON.parse(r[5] || 'null') });
  });
  return out_({ ok: true, now: now, docs: docs });
}

/** POST body (text/plain JSON): {key, ops:[{op:'put'|'del', col, id, doc, updated}]}
 *  Last writer wins by `updated` (client time); every applied write gets a new server `seq`. */
function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: 'bad_json' }); }
  if (!authed_(b.key)) return out_({ ok: false, error: 'bad_key' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const s = sheet_();
    const rows = rows_(s);
    const idx = {};
    rows.forEach(function (r, i) { idx[r[0] + '\u0000' + r[1]] = i; });
    const props = PropertiesService.getScriptProperties();
    let seq = Math.max(Date.now(), Number(props.getProperty('SEQ') || 0) + 1);
    const results = [];
    (b.ops || []).forEach(function (op) {
      const col = String(op.col || ''), id = String(op.id || '');
      if (!col || !id) { results.push({ id: id, error: 'bad_op' }); return; }
      const k = col + '\u0000' + id, i = idx[k];
      const upd = Number(op.updated || Date.now());
      if (i !== undefined && Number(rows[i][3]) > upd) { results.push({ id: id, skipped: true }); return; }
      const del = op.op === 'del';
      const json = del ? '' : JSON.stringify(op.doc || {});
      if (json.length > 49000) { results.push({ id: id, error: 'too_big' }); return; }
      const row = [col, id, seq, upd, del, json, summary_(col, op.doc, del)];
      if (i !== undefined) { s.getRange(i + 2, 1, 1, HEAD.length).setValues([row]); rows[i] = row; }
      else { s.getRange(rows.length + 2, 1, 1, HEAD.length).setValues([row]); idx[k] = rows.length; rows.push(row); }
      results.push({ id: id, seq: seq });
      seq++;
    });
    props.setProperty('SEQ', String(seq - 1));
    return out_({ ok: true, now: seq - 1, results: results });
  } finally {
    lock.releaseLock();
  }
}
