/**
 * Ship Schedule API (เมนู 🗓 จัดตารางเรือ) — Apps Script ผูกกับ Google Sheet "ShipSchedule_DB"
 * แยกจาก apps_script/Code.gs (ชีตบันทึกเรือ) — ข้อมูลเรือ/ท่า/ผก./เบอร์ แก้ในแท็บของชีตได้ตรงๆ
 * แท็บที่ใช้: Ships, Berths, Agents, Pilots, Duty, FixedContacts, Settings, Movements
 * ตั้งค่า: แก้บรรทัด KEYS ด้านล่างเป็นรหัสที่ตั้งเอง (ใช้รหัสนี้ตอนเชื่อมต่อในแอป)
 * Deploy:  Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone
 */
const KEYS = ['เปลี่ยนเป็นรหัสของคุณ'];

const TZ = 'Asia/Bangkok';

function doGet(e) {
  return respond_(() => {
    auth_(e.parameter.token);
    const a = e.parameter.action;
    if (a === 'init') return init_();
    if (a === 'movements') return listMovements_(e.parameter.from, e.parameter.to);
    throw new Error('ไม่รู้จักคำสั่ง ' + a);
  });
}

function doPost(e) {
  return respond_(() => {
    const req = JSON.parse(e.postData.contents);
    auth_(req.token);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      switch (req.action) {
        case 'saveMovement': return saveMovement_(req.m);
        case 'deleteMovement': return deleteById_('Movements', req.id);
        case 'saveShip': return saveShip_(req.ship);
        case 'updateShip': return updateShip_(req.oldName, req.ship);
        case 'deleteShip': return deleteByCol_('Ships', 'ชื่อเรือ', req.name);
        case 'savePilots': return savePilots_(req.pilots);
        case 'saveDuty': return saveDuty_(req.month, req.list);
        case 'saveFixed': return saveFixed_(req.fixed);
        case 'saveSnapshot': return saveSnapshot_(req.snap);
        case 'saveBoard': return saveBoard_(req.board);
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
    pilots, duty,
    fixed: rows_('FixedContacts').map(r => ({ text: str_(r['ข้อความในตาราง']), group: Number(r['กลุ่ม']) || 1 })).filter(f => f.text),
    settings,
    snapshots: snapshots_(),
    boards: boards_()
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
