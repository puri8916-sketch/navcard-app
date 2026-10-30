/**
 * navcard-app — สคริปต์รวม (จัดตารางเรือ + สมุดบันทึกเรือ + ปิดการ์ด/เครื่องคิดเลข) ใช้ Google Sheet เดียว
 * แทนที่ Schedule.gs และ Code.gs เดิม — วางไว้ในชีต ShipSchedule_DB (แทนโค้ด Schedule.gs เดิมทั้งหมด)
 *
 * ติดตั้ง (ครั้งเดียว):
 *   1. KEYS: ใส่รหัสเดิมของทั้ง 2 สคริปต์ (รหัสจัดตารางเรือ และรหัสสมุดบันทึกเรือ) — ของเดิมใช้ต่อได้ทั้งคู่
 *   2. Deploy › Manage deployments › ✏️ แก้ไข › Version: New version › Deploy  (URL เดิมของจัดตารางเรือใช้ต่อได้)
 *   3. ย้ายข้อมูลสมุดบันทึกเรือ: ใส่ ID ของชีตบันทึกเรือเดิมใน OLD_LOG_SHEET_ID แล้วเลือกฟังก์ชัน importOldLogSheet › Run (ครั้งเดียว)
 * แท็บ: Ships, Berths, Agents, Pilots, Duty, FixedContacts, Settings, Movements, Snapshots, LineBoards, Layouts, PilotPhotos (จัดตาราง)
 *       data (สมุดบันทึกเรือ, ทะเบียนเรือของบันทึก, เครื่องคิดเลข, รายงานปิดการ์ด)
 */
const KEYS = ['เปลี่ยนเป็นรหัสของคุณ'];
const OLD_LOG_SHEET_ID = '';   // ID ของชีตบันทึกเรือเดิม (ส่วนใน URL ระหว่าง /d/ กับ /edit)

/* one web app, two APIs: จัดตาราง uses token + action, the sync store uses key + ops */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.token !== undefined || p.action === 'init' || p.action === 'movements') return schedGet_(e);
  return syncGet_(e);
}
function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents); } catch (x) {}
  if (b && b.ops) return syncPost_(e);
  return schedPost_(e);
}

/** ย้ายข้อมูลจากชีตบันทึกเรือเดิม (แท็บ data) มารวมที่ชีตนี้ — รันซ้ำได้ แถวที่ใหม่กว่าจะชนะ */
function importOldLogSheet() {
  if (!OLD_LOG_SHEET_ID) throw new Error('ใส่ OLD_LOG_SHEET_ID ก่อน');
  const src = SpreadsheetApp.openById(OLD_LOG_SHEET_ID).getSheetByName('data');
  if (!src) throw new Error('ไม่พบแท็บ data ในชีตเดิม');
  const n = src.getLastRow();
  const old = n < 2 ? [] : src.getRange(2, 1, n - 1, SYNC_HEAD.length).getValues();
  const s = syncSheet_();
  const rows = syncRows_(s);
  const idx = {};
  rows.forEach(function (r, i) { idx[r[0] + '\u0000' + r[1]] = i; });
  let maxSeq = Number(PropertiesService.getScriptProperties().getProperty('SEQ') || 0), added = 0, replaced = 0;
  old.forEach(function (r) {
    if (!r[0] || !r[1]) return;
    r[0] = String(r[0]); r[1] = String(r[1]);
    maxSeq = Math.max(maxSeq, Number(r[2]) || 0);
    const k = r[0] + '\u0000' + r[1], i = idx[k];
    if (i === undefined) { idx[k] = rows.length; rows.push(r); added++; }
    else if (Number(r[3]) > Number(rows[i][3])) { rows[i] = r; replaced++; }
  });
  if (rows.length) s.getRange(2, 1, rows.length, SYNC_HEAD.length).setNumberFormat('@').setValues(rows.map(function (r) { return r.map(function (v) { return v === true ? true : String(v); }); }));
  // deleted flag must stay a real boolean
  if (rows.length) s.getRange(2, 5, rows.length, 1).setNumberFormat('General').setValues(rows.map(function (r) { return [r[4] === true || String(r[4]).toUpperCase() === 'TRUE']; }));
  PropertiesService.getScriptProperties().setProperty('SEQ', String(maxSeq + 1));
  Logger.log('ย้ายแล้ว: เพิ่ม ' + added + ' แถว, แทนที่ ' + replaced + ' แถว, รวม ' + rows.length);
}

/* ======================= จัดตารางเรือ ======================= */
const TZ = 'Asia/Bangkok';

function schedGet_(e) {
  return respond_(() => {
    auth_(e.parameter.token);
    const a = e.parameter.action;
    if (a === 'init') return init_();
    if (a === 'movements') return listMovements_(e.parameter.from, e.parameter.to);
    throw new Error('ไม่รู้จักคำสั่ง ' + a);
  });
}

function schedPost_(e) {
  return respond_(() => {
    const req = JSON.parse(e.postData.contents);
    auth_(req.token);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      switch (req.action) {
        case 'saveMovement': return saveMovement_(req.m);
        case 'saveMovements': return saveMovements_(req.list);
        case 'deleteMovements': return deleteMovements_(req.ids);
        case 'deleteMovement': return deleteById_('Movements', req.id);
        case 'saveShip': return saveShip_(req.ship);
        case 'updateShip': return updateShip_(req.oldName, req.ship);
        case 'deleteShip': return deleteByCol_('Ships', 'ชื่อเรือ', req.name);
        case 'savePilots': return savePilots_(req.pilots);
        case 'savePilotPhoto': return savePilotPhoto_(req.no, req.photo);
        case 'savePilotProfiles': return savePilotProfiles_(req.list);
        case 'saveDuty': return saveDuty_(req.month, req.list);
        case 'saveFixed': return saveFixed_(req.fixed);
        case 'saveSnapshot': return saveSnapshot_(req.snap);
        case 'saveBoard': return saveBoard_(req.board);
        case 'saveLayout': return saveLayout_(req.layout);
      }
      throw new Error('ไม่รู้จักคำสั่ง ' + req.action);
    } finally { lock.releaseLock(); }
  });
}

/* ---------- helpers ---------- */
function respond_(fn) {
  let out;
  try { out = { ok: true, data: fn() }; }
  catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function auth_(t) {
  t = String(t || '');
  if (KEYS.indexOf('เปลี่ยนเป็นรหัสของคุณ') >= 0 && KEYS.length === 1) throw new Error('ยังไม่ได้แก้รหัสในบรรทัด KEYS ของสคริปต์');
  if (!t || t === 'เปลี่ยนเป็นรหัสของคุณ' || KEYS.indexOf(t) < 0) throw new Error('รหัสไม่ถูกต้อง');
}
function sh_(name) {
  const s = SpreadsheetApp.getActive().getSheetByName(name);
  if (!s) throw new Error('ไม่พบแท็บ ' + name);
  return s;
}
function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm');
  return v === null || v === undefined ? '' : v;
}
function rows_(name) {
  const v = sh_(name).getDataRange().getValues();
  const h = v.shift().map(String);
  return v.filter(r => r.some(c => c !== '' && c !== null))
          .map(r => { const o = {}; h.forEach((k, i) => o[k] = cell_(r[i])); return o; });
}
const str_ = v => String(v === null || v === undefined ? '' : v).trim();

/* ---------- read ---------- */
function init_() {
  const settings = {};
  // display values: a time like 17:00 is stored as an 1899 date, which formatDate shifts by the old Bangkok offset
  const sv = sh_('Settings').getDataRange().getDisplayValues(); const sh = sv.shift();
  sv.map(r => ({ 'ค่า': r[sh.indexOf('ค่า')], 'ตั้งไว้': r[sh.indexOf('ตั้งไว้')] })).forEach(r => {
    const k = str_(r['ค่า']), v = str_(r['ตั้งไว้']);
    if (k === 'ตัดรอบตาราง') { const t = v.match(/(\d{1,2}):(\d{2})/); if (t) settings.cutoff = ('0' + t[1]).slice(-2) + ':' + t[2]; }
    if (k === 'แถวคั่น (ชม.)') settings.gap = Number(v) || 2;
  });
  const duty = {};
  rows_('Duty').forEach(r => {
    const m = str_(r['เดือน']); let key;
    let x = m.match(/^(\d{4})-(\d{2})/); if (x) key = x[1] + '-' + x[2];
    x = m.match(/^(\d{1,2})\/(\d{4})$/); if (x) key = x[2] + '-' + ('0' + x[1]).slice(-2);
    if (key) duty[key] = ['ผก.ประจำ 1', 'ผก.ประจำ 2', 'ผก.เวร 3', 'ผก.เวร 4'].map(k => str_(r[k])).filter(Boolean);
  });
  const pilots = {};
  rows_('Pilots').forEach(r => pilots[str_(r['เลขผก.'])] = str_(r['เบอร์โทร']));
  return {
    ships: rows_('Ships').map(r => ({ name: str_(r['ชื่อเรือ']).toUpperCase(), loa: str_(r['LOA']), berth: str_(r['ท่าประจำ']), agent: str_(r['เอเย่นต์']), note: str_(r['หมายเหตุ']) })).filter(s => s.name),
    berths: rows_('Berths').map(r => str_(r['ท่า'])).filter(Boolean),
    agents: rows_('Agents').map(r => str_(r['เอเย่นต์'])).filter(Boolean),
    pilots, duty, profiles: pilotProfiles_(),
    fixed: rows_('FixedContacts').map(r => ({ text: str_(r['ข้อความในตาราง']), group: Number(r['กลุ่ม']) || 1 })).filter(f => f.text),
    settings,
    snapshots: snapshots_(),
    boards: boards_(),
    layouts: layouts_()
  };
}
function listMovements_(from, to) {
  return rows_('Movements')
    .map(r => ({ id: str_(r.id), type: str_(r.type), datetime: str_(r.datetime), ship: str_(r.ship), loa: str_(r.loa), drf: str_(r.drf),
                 pob: str_(r.pob), from: str_(r.from), to: str_(r.to), pilot: str_(r.pilot), agent: str_(r.agent),
                 late: Number(r.late) || 0, note: str_(r.note) }))
    .filter(m => m.id && m.datetime >= from && m.datetime < to);
}

/* ---------- write ---------- */
function writeRow_(sheet, rowIndex, header, obj) {
  const vals = header.map(h => obj[h] === undefined ? '' : String(obj[h]));
  sheet.getRange(rowIndex, 1, 1, header.length).setNumberFormat('@').setValues([vals]);
}
function findRow_(sheet, colName, value) {
  const v = sheet.getDataRange().getValues(); const c = v[0].map(String).indexOf(colName);
  for (let i = 1; i < v.length; i++) if (str_(v[i][c]).toUpperCase() === str_(value).toUpperCase()) return i + 1;
  return -1;
}
function saveMovement_(m) {
  const s = sh_('Movements');
  const header = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
  const obj = Object.assign({}, m, { updated: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss') });
  const r = findRow_(s, 'id', m.id);
  writeRow_(s, r > 0 ? r : s.getLastRow() + 1, header, obj);
  return m;
}
// many new movements at once (นำเข้าไฟล์ตาราง): append in one write
function saveMovements_(list) {
  const s = sh_('Movements');
  if (!list || !list.length) return 0;
  const header = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
  const rows = list.map(m => { const o = Object.assign({}, m, { updated: now }); return header.map(h => o[h] === undefined ? '' : String(o[h])); });
  s.getRange(s.getLastRow() + 1, 1, rows.length, header.length).setNumberFormat('@').setValues(rows);
  return rows.length;
}
function deleteMovements_(ids) {
  const s = sh_('Movements'); const v = s.getDataRange().getValues(); const c = v[0].map(String).indexOf('id');
  const want = {}; (ids || []).forEach(i => want[String(i)] = 1);
  for (let r = v.length - 1; r >= 1; r--) if (want[String(v[r][c])]) s.deleteRow(r + 1);
  return true;
}
function deleteById_(name, id) {
  const s = sh_(name); const r = findRow_(s, 'id', id);
  if (r > 0) s.deleteRow(r);
  return true;
}
function saveShip_(ship) {
  const s = sh_('Ships');
  if (findRow_(s, 'ชื่อเรือ', ship.name) > 0) return ship;
  const header = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
  const map = { 'ชื่อเรือ': ship.name, 'LOA': ship.loa, 'ท่าประจำ': ship.berth, 'เอเย่นต์': ship.agent, 'หมายเหตุ': ship.note || '', 'ที่มา': 'เว็บ' };
  writeRow_(s, s.getLastRow() + 1, header, map);
  return ship;
}

const SHIP_COLS_ = { name: 'ชื่อเรือ', loa: 'LOA', berth: 'ท่าประจำ', agent: 'เอเย่นต์', note: 'หมายเหตุ' };
function updateShip_(oldName, ship) {
  const s = sh_('Ships');
  const header = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
  const name = str_(ship.name).toUpperCase();
  if (!name) throw new Error('ชื่อเรือว่าง');
  const r = findRow_(s, 'ชื่อเรือ', oldName);
  if (name !== str_(oldName).toUpperCase() && findRow_(s, 'ชื่อเรือ', name) > 0) throw new Error(name + ' มีในทะเบียนแล้ว');
  if (r < 0) return saveShip_(Object.assign({}, ship, { name: name }));
  Object.keys(SHIP_COLS_).forEach(k => {
    const c = header.indexOf(SHIP_COLS_[k]);
    if (c >= 0 && ship[k] !== undefined) s.getRange(r, c + 1).setNumberFormat('@').setValue(k === 'name' ? name : str_(ship[k]));
  });
  return ship;
}
function deleteByCol_(name, col, value) {
  const s = sh_(name); const r = findRow_(s, col, value);
  if (r > 0) s.deleteRow(r);
  return true;
}

/* ---------- ผก. / เวร / เบอร์ติดต่อ ---------- */
function rewrite_(name, rowsObj) {
  const s = sh_(name);
  const header = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
  const n = s.getLastRow();
  if (n > 1) s.getRange(2, 1, n - 1, header.length).clearContent();
  if (rowsObj.length) {
    const vals = rowsObj.map(o => header.map(h => o[h] === undefined || o[h] === null ? '' : String(o[h])));
    s.getRange(2, 1, vals.length, header.length).setNumberFormat('@').setValues(vals);
  }
  return rowsObj.length;
}
// pilot profiles: picture (small JPEG data URL) + name, tab PilotPhotos (created on first use)
function photoSheet_() {
  const ss = SpreadsheetApp.getActive(); let s = ss.getSheetByName('PilotPhotos');
  if (!s) { s = ss.insertSheet('PilotPhotos'); s.getRange(1, 1, 1, 3).setValues([['เลขผก.', 'รูป', 'ชื่อ']]); }
  if (str_(s.getRange(1, 3).getValue()) !== 'ชื่อ') s.getRange(1, 3).setValue('ชื่อ');
  return s;
}
function pilotProfiles_() {
  const s = SpreadsheetApp.getActive().getSheetByName('PilotPhotos'); const photos = {}, names = {};
  if (s) s.getDataRange().getValues().slice(1).forEach(r => { const no = str_(r[0]); if (!no) return; if (str_(r[1])) photos[no] = str_(r[1]); if (str_(r[2])) names[no] = str_(r[2]); });
  return { photos: photos, names: names };
}
// list = [{no, photo?, name?}] — a field left undefined keeps what is there; '' clears it
function savePilotProfiles_(list) {
  const s = photoSheet_(); const v = s.getDataRange().getValues(); const at = {};
  for (let i = 1; i < v.length; i++) at[str_(v[i][0])] = i + 1;
  (list || []).forEach(p => {
    const no = str_(p.no); if (!no) return; let r = at[no];
    if (!r) { r = s.getLastRow() + 1; s.getRange(r, 1).setNumberFormat('@').setValue(no); at[no] = r; }
    if (p.photo !== undefined) s.getRange(r, 2).setValue(p.photo || '');
    if (p.name !== undefined) s.getRange(r, 3).setValue(p.name || '');
  });
  return true;
}
function savePilotPhoto_(no, photo) { return savePilotProfiles_([{ no: no, photo: photo || '' }]); }
function savePilots_(list) {
  const fixed = ['178', '189'];
  return rewrite_('Pilots', (list || []).map(p => ({ 'เลขผก.': str_(p.no), 'เบอร์โทร': str_(p.phone), 'ประเภท': fixed.indexOf(str_(p.no)) >= 0 ? 'ประจำ' : 'หมุนเวียน' })));
}
function monthKey_(v) {
  const m = str_(v); let x = m.match(/^(\d{4})-(\d{2})/); if (x) return x[1] + '-' + x[2];
  x = m.match(/^(\d{1,2})\/(\d{4})$/); if (x) return x[2] + '-' + ('0' + x[1]).slice(-2);
  return '';
}
function saveDuty_(month, list) {
  const s = sh_('Duty');
  const header = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
  const v = s.getDataRange().getValues(); const c = header.indexOf('เดือน');
  let r = -1; for (let i = 1; i < v.length; i++) if (monthKey_(cell_(v[i][c])) === month) { r = i + 1; break; }
  const [y, m] = month.split('-');
  const obj = { 'เดือน': m + '/' + y };
  ['ผก.ประจำ 1', 'ผก.ประจำ 2', 'ผก.เวร 3', 'ผก.เวร 4'].forEach((k, i) => obj[k] = str_((list || [])[i]));
  writeRow_(s, r > 0 ? r : s.getLastRow() + 1, header, obj);
  return true;
}
function saveFixed_(list) {
  return rewrite_('FixedContacts', (list || []).map((f, i) => ({ 'ลำดับ': i + 1, 'ข้อความในตาราง': str_(f.text), 'กลุ่ม': Number(f.group) || 1 })));
}

/* ---------- จัดจ่ายแล้ว (snapshot ไว้เทียบหาเรือที่แก้ไข → ตัวแดงในรูป LINE) ---------- */
function snapSheet_() {
  const ss = SpreadsheetApp.getActive(); let s = ss.getSheetByName('Snapshots');
  if (!s) { s = ss.insertSheet('Snapshots'); s.getRange(1, 1, 1, 3).setValues([['date', 'at', 'json']]); s.getRange('A:C').setNumberFormat('@'); }
  return s;
}
function snapshots_() {
  const s = SpreadsheetApp.getActive().getSheetByName('Snapshots'); if (!s) return {};
  const since = Utilities.formatDate(new Date(Date.now() - 70 * 864e5), TZ, 'yyyy-MM-dd');
  const out = {};
  s.getDataRange().getValues().slice(1).forEach(r => {
    const d = str_(cell_(r[0])).slice(0, 10);
    if (d && d >= since) { try { out[d] = { at: str_(r[1]), items: JSON.parse(r[2] || '{}') }; } catch (e) {} }
  });
  return out;
}
function saveSnapshot_(snap) {
  const s = snapSheet_();
  const json = JSON.stringify(snap.items || {});
  if (json.length > 49000) throw new Error('ข้อมูลจัดจ่ายใหญ่เกินไป');
  const r = findRow_(s, 'date', snap.date);
  s.getRange(r > 0 ? r : s.getLastRow() + 1, 1, 1, 3).setNumberFormat('@').setValues([[snap.date, str_(snap.at), json]]);
  return true;
}

/* ---------- กระดานรูป LINE (แก้อิสระ แยกจากจัดตาราง) ---------- */
function boards_() {
  const s = SpreadsheetApp.getActive().getSheetByName('LineBoards'); if (!s) return {};
  const since = Utilities.formatDate(new Date(Date.now() - 14 * 864e5), TZ, 'yyyy-MM-dd');
  const out = {};
  s.getDataRange().getValues().slice(1).forEach(r => {
    const d = str_(cell_(r[0])).slice(0, 10);
    if (d && d >= since) { try { out[d] = JSON.parse(r[2] || 'null'); } catch (e) {} }
  });
  return out;
}
function saveBoard_(board) {
  const ss = SpreadsheetApp.getActive(); let s = ss.getSheetByName('LineBoards');
  if (!s) { s = ss.insertSheet('LineBoards'); s.getRange(1, 1, 1, 3).setValues([['date', 'updated', 'json']]); s.getRange('A:C').setNumberFormat('@'); }
  const json = JSON.stringify(board);
  if (json.length > 49000) throw new Error('ตารางรูป LINE ยาวเกินไป');
  const r = findRow_(s, 'date', board.date);
  const old = r > 0 ? Number(s.getRange(r, 2).getValue()) || 0 : 0;
  if (old > Number(board.updated)) return false;   // a newer version from another device is already there
  s.getRange(r > 0 ? r : s.getLastRow() + 1, 1, 1, 3).setNumberFormat('@').setValues([[board.date, String(board.updated), json]]);
  return true;
}

/* ---------- ลำดับแถวที่จัดเองในหน้าจัดตาราง (ต่อวัน) ---------- */
function layouts_() {
  const s = SpreadsheetApp.getActive().getSheetByName('Layouts'); if (!s) return {};
  const since = Utilities.formatDate(new Date(Date.now() - 40 * 864e5), TZ, 'yyyy-MM-dd');
  const out = {};
  s.getDataRange().getValues().slice(1).forEach(r => {
    const d = str_(cell_(r[0])).slice(0, 10);
    if (d && d >= since) { try { out[d] = { date: d, updated: Number(r[1]) || 0, rows: JSON.parse(r[2] || 'null') }; } catch (e) {} }
  });
  return out;
}
function saveLayout_(lay) {
  const ss = SpreadsheetApp.getActive(); let s = ss.getSheetByName('Layouts');
  if (!s) { s = ss.insertSheet('Layouts'); s.getRange(1, 1, 1, 3).setValues([['date', 'updated', 'rows']]); s.getRange('A:C').setNumberFormat('@'); }
  const json = JSON.stringify(lay.rows === undefined ? null : lay.rows);
  if (json.length > 49000) throw new Error('ลำดับแถวยาวเกินไป');
  const r = findRow_(s, 'date', lay.date);
  const old = r > 0 ? Number(s.getRange(r, 2).getValue()) || 0 : 0;
  if (old > Number(lay.updated)) return false;
  s.getRange(r > 0 ? r : s.getLastRow() + 1, 1, 1, 3).setNumberFormat('@').setValues([[lay.date, String(lay.updated), json]]);
  return true;
}


/* ======================= สมุดบันทึกเรือ / เครื่องคิดเลข / ปิดการ์ด (sync store) ======================= */
const SYNC_SHEET = 'data';
const SYNC_HEAD = ['col', 'id', 'seq', 'updated', 'deleted', 'json', 'สรุป'];

function syncSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SYNC_SHEET);
  if (!s) {
    s = ss.insertSheet(SYNC_SHEET);
    s.getRange(1, 1, 1, SYNC_HEAD.length).setValues([SYNC_HEAD]).setFontWeight('bold');
    s.setFrozenRows(1);
    // keep ids / JSON as plain text so Sheets never turns "12-10" into a date
    s.getRange('A:B').setNumberFormat('@');
    s.getRange('F:G').setNumberFormat('@');
  }
  return s;
}

function syncOut_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function syncAuthed_(k) {
  k = String(k || '');
  return k !== '' && k !== 'เปลี่ยนเป็นรหัสของคุณ' && KEYS.indexOf(k) >= 0;
}

function syncRows_(s) {
  const n = s.getLastRow();
  return n < 2 ? [] : s.getRange(2, 1, n - 1, SYNC_HEAD.length).getValues();
}

function syncSummary_(col, d, del) {
  if (del || !d) return '(ลบแล้ว)';
  if (col === 'calls') return [d.date, d.job, d.vessel, d.closeNo].filter(Boolean).join(' · ');
  if (col === 'vessels') return [d.name, d.loa, d.agent].filter(Boolean).join(' · ');
  if (col === 'calcShips') return [d.value, d.result].filter(Boolean).join(' → ');
  return '';
}

/** GET ?action=ping&key=…            → {ok, counts}
 *  GET ?action=load&key=…&since=SEQ   → {ok, now, docs:[{col,id,updated,deleted,doc}]} (changes after SEQ)
 *      &cols=a,b                       → only those collections (smaller/faster answer) */
function syncGet_(e) {
  const p = (e && e.parameter) || {};
  if (!syncAuthed_(p.key)) return syncOut_({ ok: false, error: 'bad_key' });
  const rows = syncRows_(syncSheet_());
  if (p.action === 'ping') {
    const counts = {};
    rows.forEach(function (r) { if (r[4] !== true) counts[r[0]] = (counts[r[0]] || 0) + 1; });
    return syncOut_({ ok: true, counts: counts });
  }
  const since = Number(p.since || 0);
  let now = Number(PropertiesService.getScriptProperties().getProperty('SEQ') || 0);
  const docs = [];
  const only = p.cols ? String(p.cols).split(',') : null;
  rows.forEach(function (r) {
    const seq = Number(r[2]);
    if (seq > now) now = seq;
    if (seq <= since) return;
    if (only && only.indexOf(String(r[0])) < 0) return;
    const del = r[4] === true;
    docs.push({ col: String(r[0]), id: String(r[1]), updated: Number(r[3]), deleted: del, doc: del ? null : JSON.parse(r[5] || 'null') });
  });
  return syncOut_({ ok: true, now: now, docs: docs });
}

/** POST body (text/plain JSON): {key, ops:[{op:'put'|'del', col, id, doc, updated}]}
 *  Last writer wins by `updated` (client time); every applied write gets a new server `seq`. */
function syncPost_(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (x) { return syncOut_({ ok: false, error: 'bad_json' }); }
  if (!syncAuthed_(b.key)) return syncOut_({ ok: false, error: 'bad_key' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const s = syncSheet_();
    const rows = syncRows_(s);
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
      const row = [col, id, seq, upd, del, json, syncSummary_(col, op.doc, del)];
      if (i !== undefined) { s.getRange(i + 2, 1, 1, SYNC_HEAD.length).setValues([row]); rows[i] = row; }
      else { s.getRange(rows.length + 2, 1, 1, SYNC_HEAD.length).setValues([row]); idx[k] = rows.length; rows.push(row); }
      results.push({ id: id, seq: seq });
      seq++;
    });
    props.setProperty('SEQ', String(seq - 1));
    return syncOut_({ ok: true, now: seq - 1, results: results });
  } finally {
    lock.releaseLock();
  }
}
