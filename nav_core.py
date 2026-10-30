"""
Core logic for merging Songkhla pilot Navigation Cards into one PDF.
Pure functions - no hardcoded paths, no globals except font registration.
"""
import csv
import io
import os
import re
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import numpy as np
import openpyxl
import pdfplumber
from pypdf import PdfReader, PdfWriter, Transformation
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont
from scipy.optimize import linear_sum_assignment

PAGE_W, PAGE_H = 612, 792
OFFSET = 389.8  # vertical offset between top/bottom card on a merged page
ASCENT = 0.96
_HERE = os.path.dirname(os.path.abspath(__file__))
_CAVEAT_PATH = os.path.join(_HERE, 'caveat_fixed.ttf')
THAI_FONT_PATH = os.path.join(_HERE, 'Loma.otf')  # Thai handwriting-style, for Remarks; bundled
pdfmetrics.registerFont(TTFont('Caveat', _CAVEAT_PATH))


# ---------- output filename (Thai date, Bangkok time) ----------
_TH_TZ = timezone(timedelta(hours=7))  # Thailand has no DST -> fixed offset is safe everywhere
_TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']


def thai_now():
    """Current date/time in Thailand (server may run in UTC)."""
    return datetime.now(_TH_TZ)


def thai_card_filename(dt=None):
    """'การ์ดประจำวันที่ <วัน> <เดือนย่อ> <พ.ศ. 2 หลัก> (รวม).pdf'"""
    dt = dt or thai_now()
    be_short = (dt.year + 543) % 100
    return f"การ์ดประจำวันที่ {dt.day} {_TH_MONTHS_SHORT[dt.month - 1]} {be_short} (รวม).pdf"


def baseline(top, size):
    return PAGE_H - top - size * ASCENT


def render_thai_line(text, pt_size, color=(255, 0, 0)):
    """Render one line of Thai text as a transparent-background image
    (handwriting-style Loma font), returning (ImageReader, width_pt, height_pt)."""
    scale = 4
    font = ImageFont.truetype(THAI_FONT_PATH, int(pt_size * scale))
    tmp = Image.new('RGBA', (10, 10))
    d = ImageDraw.Draw(tmp)
    bbox = d.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    img = Image.new('RGBA', (w + 8, h + 8), (255, 255, 255, 0))
    d2 = ImageDraw.Draw(img)
    d2.text((-bbox[0] + 4, -bbox[1] + 4), text, font=font, fill=color + (255,))
    return ImageReader(img), (w + 8) / scale, (h + 8) / scale


def wrap_thai(text, max_w_pt, pt_size=10):
    """Greedy character-wrap for Thai text to fit the Remark column width."""
    font = ImageFont.truetype(THAI_FONT_PATH, int(pt_size * 4))
    tmp = Image.new('RGBA', (10, 10))
    d = ImageDraw.Draw(tmp)
    lines, cur = [], ''
    for ch in text:
        trial = cur + ch
        bbox = d.textbbox((0, 0), trial, font=font)
        w = (bbox[2] - bbox[0]) / 4
        if w > max_w_pt and cur:
            lines.append(cur)
            cur = ch
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


# ---------- bulk remark input: "SGZ40/70 <message>" per line ----------
_REMARK_LINE_RE = re.compile(
    r'^\s*SGZ\s*(\d+)\s*/\s*(\d+)'          # card number, e.g. SGZ40/70 or SGZ 25/70
    r'(?:\s*[:：]\s*|\s+[-–—]\s+|\s+)'        # separator: spaces, ':' or ' - '
    r'(.+?)\s*$', re.IGNORECASE)
_QUOTES = '"\'\u201c\u201d\u2018\u2019'


def parse_remark_lines(text, valid_card_nos=None, wrap_width=100):
    """Parse pasted text, one remark per line: '<card no> <message>'.

    Returns (remarks, texts, notes)
      remarks: {card_no: [wrapped lines]}   -> for build_pdf
      texts:   {card_no: original message}  -> for display
      notes:   [str] warnings (bad line, unknown card, replaced duplicate)
    Surrounding quotes are stripped; asterisks in the message are kept.
    """
    remarks, texts, notes = {}, {}, []
    valid = set(valid_card_nos) if valid_card_nos is not None else None
    for raw in (text or '').splitlines():
        if not raw.strip():
            continue
        m = _REMARK_LINE_RE.match(raw)
        if not m:
            notes.append(f"ข้ามบรรทัด (ไม่พบเลขการ์ดนำหน้า): {raw.strip()[:60]}")
            continue
        card_no = f"SGZ{m.group(1)}/{m.group(2)}"
        msg = m.group(3).strip().strip(_QUOTES).strip()
        if not msg:
            notes.append(f"ข้าม {card_no}: ไม่มีข้อความ")
            continue
        if valid is not None and card_no not in valid:
            notes.append(f"ข้าม {card_no}: ไม่มีการ์ดนี้ในชุดที่อัปโหลด")
            continue
        if card_no in remarks:
            notes.append(f"{card_no}: มีหลายบรรทัด ใช้บรรทัดหลังสุด")
        remarks[card_no] = wrap_thai(msg, wrap_width)
        texts[card_no] = msg
    return remarks, texts, notes


def fmt_num(s):
    try:
        v = float(s)
        if v == int(v):
            return str(int(v))
        s2 = ('%f' % v).rstrip('0').rstrip('.')
        return s2
    except Exception:
        return s


def normalize_name(name):
    if name is None:
        return None
    cleaned = re.sub(r'[^A-Za-z0-9 ]', '', name)
    return ''.join(cleaned.split()).upper()


def card_sort_key(card_no):
    """Sorts both old 'SGZxxxx/69' and new fiscal-year 'SGZn/70' numbering."""
    m = re.search(r'/(\d+)$', card_no)
    year = int(m.group(1)) if m else 0
    num = int(re.search(r'\d+', card_no).group())
    return (year, num)


_TEXT_CACHE = {}


def _page_text(path):
    """First-page text of a card PDF, read once (card no, ship name and LOA all come from it)."""
    try:
        key = (path, os.path.getmtime(path), os.path.getsize(path))
    except OSError:
        key = (path, 0, 0)
    t = _TEXT_CACHE.get(key)
    if t is None:
        with pdfplumber.open(path) as pdf:
            t = pdf.pages[0].extract_text() or ""
        if len(_TEXT_CACHE) > 500:
            _TEXT_CACHE.clear()
        _TEXT_CACHE[key] = t
    return t


def extract_card_no(path):
    t = _page_text(path)
    m = re.search(r'Card no\. (\S+)', t)
    return m.group(1) if m else None


def extract_ship_name(path):
    t = _page_text(path)
    m = re.search(r'Ship name : (.*?) Flag', t)
    return m.group(1).strip() if m else None


def extract_loa_meters(path):
    t = _page_text(path)
    m = re.search(r'LOA \(m/f\) :\s*([\d.]+)', t)
    return float(m.group(1)) if m else None


_NUM = r'([0-9][0-9,]*(?:\.[0-9]+)?)'


def extract_tonnage(path):
    """(grt, nrt, imo) from the card's For Agent box ("G.R.T. : 2,387", "N.R.T. : 716"); missing -> None."""
    t = _page_text(path)

    def num(label):
        m = re.search(label + r'\s*:?\s*' + _NUM, t)
        if not m:
            return None
        try:
            v = float(m.group(1).replace(',', ''))
        except ValueError:
            return None
        return int(v) if v == int(v) else v
    imo = re.search(r'IMO\s*no\.?\s*:?\s*(\d{7})', t, re.I)
    return (num(r'G\.\s*R\.\s*T\.?'), num(r'N\.\s*R\.\s*T\.?'), imo.group(1) if imo else None)


def _ck(cn):
    try:
        return card_sort_key(cn)
    except Exception:
        return (0, 0)


def card_tonnage(card_dir):
    """{normalized ship name: {name, grt, nrt, imo, card}} for every card PDF in the folder (latest card number wins)."""
    out = {}
    pdfs = [os.path.join(card_dir, f) for f in os.listdir(card_dir) if f.lower().endswith('.pdf')] if os.path.isdir(card_dir) else []
    for p in pdfs:
        try:
            name, cn = extract_ship_name(p), extract_card_no(p)
            grt, nrt, imo = extract_tonnage(p)
        except Exception:
            continue
        if not name or (grt is None and nrt is None):
            continue
        k = normalize_name(name)
        if k in out and _ck(out[k]['card']) > _ck(cn):
            continue
        out[k] = {'name': name.strip(), 'grt': grt, 'nrt': nrt, 'imo': imo, 'card': cn}
    return out


def parse_ships(xlsx_path):
    """Parse the ReportCardIsClosedDaily.xlsx into a list of
    {'card_no':, 'rows': [{'item','day','month','time','draft','berth','pilot'}]}.
    A list of paths (several days' exports) is read one after another; a card found twice is kept once."""
    if isinstance(xlsx_path, (list, tuple)):
        out, seen = [], set()
        for p in xlsx_path:
            for s in parse_ships(p):
                if s['card_no'] not in seen:
                    seen.add(s['card_no'])
                    out.append(s)
        return out
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(min_row=1, max_row=ws.max_row, values_only=True))
    ships = []
    cur = None
    for r in rows:
        cardno = r[0]
        if cardno and str(cardno).startswith('SGZ'):
            if cur:
                ships.append(cur)
            cur = {'card_no': cardno, 'rows': [],
                   'agent': str(r[1] or '').strip(), 'ship': str(r[2] or '').strip()}
        if cur is not None and r[7] and r[7] != 'Date':
            datestr = r[7]
            item, rest = datestr.split(':', 1)
            item = item.strip()
            rest = rest.strip()
            d, m, t = rest.split('-')
            cur['rows'].append({
                'item': item,
                'day': str(int(d)),
                'month': str(int(m)),
                'time': t.replace(':', ''),
                'draft': r[8],
                'berth': r[9],
                'pilot': r[12],
            })
    if cur:
        ships.append(cur)
    return ships


def parse_loa_rows(csv_paths):
    """Returns list of (ship_name_or_None, value) merged from all CSV files
    given (a batch can span multiple days, each with its own csv)."""
    rows = []
    for path in csv_paths:
        with open(path, encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                name = row.get('ชื่อเรือ')
                rows.append((name.strip() if name else None, row['ตัวเลขที่กรอก']))
    return rows


def draw_pilot(c, x, row_top, font_size, pilot):
    """Pilot '000' always renders as red '-CAP-' instead of the number."""
    pilot_str = str(pilot)
    if pilot_str == '000':
        c.setFillColorRGB(1, 0, 0)
        c.drawString(x, baseline(row_top, font_size), '-CAP-')
        c.setFillColorRGB(0, 0, 1)
    else:
        c.drawString(x, baseline(row_top, font_size), pilot_str)


def build_overlay(ship, loa_value, remark_lines=None, data_fixes=None, row_count_override=None):
    """Build the one-page reportlab overlay (top-card position) for one ship."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(PAGE_W, PAGE_H))
    if loa_value is not None:
        c.setFont('Caveat', 13.5)
        c.setFillColorRGB(1, 0, 0)
        c.drawString(121.79, baseline(100.1, 13.5), f"/ {fmt_num(loa_value)}m")

    rows = list(ship['rows'])
    if data_fixes:
        rows = [dict(r) for r in rows]
        for idx, field_updates in data_fixes.items():
            if idx < len(rows):
                rows[idx].update(field_updates)

    n_override = max(row_count_override or 0, len(rows))   # auto-compress when > 7 legs
    if n_override and n_override > 7:
        row_height = 126.0 / n_override
        font_size = 11 * (row_height / 18.0)
        row_top0 = 222.5 + 4.8 * (row_height / 18.0)
    else:
        row_height = 18.0
        font_size = 11
        row_top0 = 227.3

    c.setFont('Caveat', font_size)
    c.setFillColorRGB(0, 0, 1)
    row_top = row_top0
    prev_berth = None
    for row in rows:
        item = row['item']
        date_str = f"{row['day']} - {row['month']} -{row['time']}"
        c.drawString(28.5, baseline(row_top, font_size), date_str)

        if item == 'EN':
            c.drawString(119.5, baseline(row_top, font_size), 'ENTER')
            c.drawString(262.5, baseline(row_top, font_size), row['berth'])
            draw_pilot(c, 328.5, row_top, font_size, row['pilot'])
            c.drawString(380.5, baseline(row_top, font_size), fmt_num(row['draft']))
            prev_berth = row['berth']
        elif item == 'SA':
            c.drawString(119.5, baseline(row_top, font_size), 'SAIL')
            c.drawString(196.5, baseline(row_top, font_size), row['berth'])
            draw_pilot(c, 328.5, row_top, font_size, row['pilot'])
            c.drawString(380.5, baseline(row_top, font_size), fmt_num(row['draft']))
            prev_berth = row['berth']
        elif item == 'SH':
            c.drawString(119.5, baseline(row_top, font_size), 'SHIF')
            c.drawString(196.5, baseline(row_top, font_size), prev_berth or '')
            c.drawString(262.5, baseline(row_top, font_size), row['berth'])
            draw_pilot(c, 328.5, row_top, font_size, row['pilot'])
            prev_berth = row['berth']
        row_top += row_height

    if remark_lines:
        r_top = 227.3
        for line in remark_lines:
            img, w, h = render_thai_line(line, 10)
            c.drawImage(img, 478.0, PAGE_H - r_top - h, width=w, height=h, mask='auto')
            r_top += 18

    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def analyze_batch(card_dir, xlsx_path, csv_paths, ship_memory=None):
    """Read everything and report completeness + the proposed LOA matching,
    without building the final PDF. Used to drive the UI before the user
    confirms remarks/overrides and clicks Build.

    LOA value sources, in priority order:
      1. CSV file(s) inside the zip (explicit for this batch)
      2. ship_memory = {ship name: length} remembered by the calculator page
    """
    ships = parse_ships(xlsx_path)

    all_files = [f for f in os.listdir(card_dir) if f.lower().endswith('.pdf')]
    card_map = {}
    duplicates = []
    for fn in all_files:
        cn = extract_card_no(os.path.join(card_dir, fn))
        if cn in card_map:
            duplicates.append((fn, cn))
        else:
            card_map[cn] = fn

    missing_card_pdf = [s['card_no'] for s in ships if s['card_no'] not in card_map]

    ship_card_nos = {s['card_no'] for s in ships}
    extra_cards = [cn for cn in card_map if cn not in ship_card_nos]
    for cn in extra_cards:
        ships.append({'card_no': cn, 'rows': []})
    ships.sort(key=lambda s: card_sort_key(s['card_no']))

    ship_names = {}
    for s in ships:
        cn = s['card_no']
        if cn in card_map:
            ship_names[cn] = extract_ship_name(os.path.join(card_dir, card_map[cn]))

    loa_map = {}
    loa_source = {}
    loa_key = {}          # name the length was found under (e.g. "TUG+BARGE" for a tow)
    csv_all = {}          # every named CSV length, for looking up a barge's own length
    raw_name = {}         # normalized -> name as typed (keeps the '+' of a tow)
    unmatched_ships = []
    unused_csv = {}
    no_csv_at_all = not csv_paths

    if not no_csv_at_all:
        loa_rows = parse_loa_rows(csv_paths)
        has_names = all(name is not None for name, _ in loa_rows)

        if has_names:
            csv_by_name = defaultdict(list)
            for name, val in loa_rows:
                csv_by_name[normalize_name(name)].append(float(val))
                csv_all.setdefault(normalize_name(name), float(val))
                raw_name.setdefault(normalize_name(name), str(name).strip())

            for s in ships:
                cn = s['card_no']
                nm = normalize_name(ship_names.get(cn))
                bucket = csv_by_name.get(nm, [])
                if not bucket and nm:
                    for key in list(csv_by_name.keys()):
                        if csv_by_name[key] and key.startswith(nm):
                            bucket = csv_by_name[key]
                            break
                if bucket:
                    loa_map[cn] = bucket.pop(0)
                    loa_source[cn] = 'csv'
                    _k = next((k for k, b in csv_by_name.items() if b is bucket), nm)
                    loa_key[cn] = raw_name.get(_k, _k)
                else:
                    loa_map[cn] = None
            unused_csv = {nm: vals for nm, vals in csv_by_name.items() if vals}
        else:
            loa_values = [float(v) for _, v in loa_rows]
            n = len(ships)
            expected = []
            for s in ships:
                cn = s['card_no']
                loa_m = extract_loa_meters(os.path.join(card_dir, card_map[cn])) if cn in card_map else None
                expected.append(loa_m * 0.3048 if loa_m else None)
            if len(loa_values) == n:
                cost = np.zeros((n, n))
                for i in range(n):
                    for j in range(n):
                        e = expected[i]
                        loa_cost = abs(e - loa_values[j]) if e is not None else 1e6
                        cost[i][j] = loa_cost * 1000 + abs(i - j)
                row_ind, col_ind = linear_sum_assignment(cost)
                for i, j in zip(row_ind, col_ind):
                    loa_map[ships[i]['card_no']] = loa_values[j]
                    loa_source[ships[i]['card_no']] = 'csv'

    # ---- ship-length memory from the calculator page (fills what the CSV did not) ----
    mem = {}
    for k, v in (ship_memory or {}).items():
        try:
            mem[normalize_name(k)] = float(v)
            raw_name[normalize_name(k)] = str(k).strip()
        except (TypeError, ValueError):
            continue
    for s in ships:
        cn = s['card_no']
        if loa_map.get(cn) is not None:
            continue
        nm = normalize_name(ship_names.get(cn))
        val = None
        key = None
        if nm:
            val = mem.get(nm)
            key = nm
            if val is None:                      # e.g. combined tow entry "SHIP+TOWNAME"
                for k, v in mem.items():
                    if k.startswith(nm):
                        val, key = v, k
                        break
        if val is not None:
            loa_map[cn] = val
            loa_source[cn] = 'memory'
            loa_key[cn] = raw_name.get(key, key)

    unmatched_ships = [(s['card_no'], ship_names.get(s['card_no']))
                       for s in ships if loa_map.get(s['card_no']) is None]
    no_csv_at_all = (not csv_paths) and not mem

    report = {
        'ships': ships,
        'card_map': card_map,
        'ship_names': ship_names,
        'loa_map': loa_map,
        'loa_source': loa_source,
        'duplicates': duplicates,
        'missing_card_pdf': missing_card_pdf,
        'extra_cards_no_report_row': extra_cards,
        'unmatched_loa_ships': unmatched_ships,
        'unused_csv_entries': unused_csv,
        'no_csv_at_all': no_csv_at_all,
        'loa_key': loa_key,
        'lengths': {**csv_all, **mem},   # every known length by name (calculator wins)
    }
    return report


def is_batch_complete(report, loa_overrides=None):
    """True only if every card has a blank PDF and an LOA value
    (from CSV, calculator memory, or a manual override)."""
    if report['missing_card_pdf']:
        return False
    overrides = loa_overrides or {}
    missing = [cn for cn, _ in report['unmatched_loa_ships'] if cn not in overrides]
    return not missing


def ship_memory_from_store(store):
    """Convert the browser-component payload
    {'ships': {name: {'value': '64.8', ...}}} -> {name: 64.8}."""
    out = {}
    for name, d in ((store or {}).get('ships') or {}).items():
        try:
            out[name] = float(d['value'] if isinstance(d, dict) else d)
        except (TypeError, ValueError, KeyError):
            continue
    return out


def build_pdf(card_dir, report, loa_overrides=None, remarks=None, data_fixes=None,
              row_count_overrides=None, output_path=None):
    """Build the final merged PDF. loa_overrides/remarks/data_fixes/
    row_count_overrides are dicts keyed by card_no, supplied by the user
    via the UI for exceptions the automatic pass couldn't resolve."""
    loa_overrides = loa_overrides or {}
    remarks = remarks or {}
    data_fixes = data_fixes or {}
    row_count_overrides = row_count_overrides or {}

    ships = report['ships']
    card_map = report['card_map']
    loa_map = dict(report['loa_map'])
    loa_map.update(loa_overrides)

    filled_pages = []
    for ship in ships:
        cn = ship['card_no']
        if cn not in card_map:
            continue
        blank_reader = PdfReader(os.path.join(card_dir, card_map[cn]))
        blank_page = blank_reader.pages[0]
        overlay_page = build_overlay(
            ship, loa_map.get(cn),
            remark_lines=remarks.get(cn),
            data_fixes=data_fixes.get(cn),
            row_count_override=row_count_overrides.get(cn),
        )
        blank_page.merge_page(overlay_page)
        filled_pages.append(blank_page)

    writer = PdfWriter()
    n_pages = len(filled_pages)
    for i in range(0, n_pages, 2):
        writer.add_page(filled_pages[i])
        new_page = writer.pages[-1]
        if i + 1 < n_pages:
            transform = Transformation().translate(tx=0, ty=-OFFSET)
            new_page.merge_transformed_page(filled_pages[i + 1], transform)

    if output_path:
        with open(output_path, 'wb') as f:
            writer.write(f)
        return output_path
    else:
        out_buf = io.BytesIO()
        writer.write(out_buf)
        out_buf.seek(0)
        return out_buf


def load_default_ships(path):
    """Read the repo's ships.csv -> {name: {'value': str, 'result': str, 'time': str}}."""
    import csv, re
    out = {}
    if not path or not os.path.exists(path):
        return out
    with open(path, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.reader(f))
    if not rows:
        return out
    h = [x.strip() for x in rows[0]]
    iN = h.index('ชื่อเรือ') if 'ชื่อเรือ' in h else 0
    iV = next((i for i, x in enumerate(h) if 'เลขที่กรอก' in x or 'ความยาว' in x), 1)
    iT = next((i for i, x in enumerate(h) if 'บันทึกล่าสุด' in x or x == 'เวลา'), None)
    for r in rows[1:]:
        if len(r) <= max(iN, iV):
            continue
        name = re.sub(r'\s+', ' ', r[iN]).strip()
        try:
            v = float(r[iV])
        except ValueError:
            continue
        out[name] = {'value': r[iV].strip(), 'result': f"{round(v * 3.2808, 4):,}",
                     'time': r[iT].strip() if iT is not None and len(r) > iT else ''}
    return out


# ---------- automatic Remarks for the special cases (rules given by the user) ----------
LOA_LIMIT = 173.0
_TXT_CAP = {'EN': '**เรือขาเข้ายกเว้นนำร่อง**', 'SA': '**เรือขาออกยกเว้นนำร่อง**'}
_TXT_SPLIT_IN = '**แยกใบแจ้งหนี้เรือออก/ไม่มีเรือออก**'
_TXT_SPLIT_OUT = 'แจ้งเรือออก: เปลี่ยนบริษัทหรือตัวแทนสายเรือ*แยกใบแจ้งหนี้เรือเข้า/ไม่มีเรือเข้า*'


def _num_txt(v):
    return fmt_num(round(float(v), 2))


def _agent_key(a):
    return re.sub(r'[^A-Z0-9]', '', str(a or '').upper())


def auto_remarks(report, loa_overrides=None):
    """Return ({card_no: [remark text, ...]}, [warning text, ...]).

    1. EN/SA leg with pilot 000 (-CAP-)  -> **เรือขาเข้า/ขาออกยกเว้นนำร่อง** (warn if that leg's draft is not 0.00)
    2. LOA (m, as written on the card) > 173 -> เรือยาวเกินข้อกำหนดขนาด n เมตร
    3. same ship, 2 agents: card with EN (and SH) but no SA + card with only SA -> split-invoice texts
    4. length found under "TUG+BARGE" -> ลากB.BARGE ยาว m เมตร (ft ปัดขึ้น ฟุต) เข้ามาด้วย.
    """
    loa_overrides = loa_overrides or {}
    out, warns = defaultdict(list), []
    ships = report['ships']
    names = report.get('ship_names', {})
    lengths = report.get('lengths', {})
    for s in ships:
        cn = s['card_no']
        # 1. -CAP-
        for r in s['rows']:
            if str(r.get('pilot')) == '000' and r['item'] in _TXT_CAP:
                if _TXT_CAP[r['item']] not in out[cn]:
                    out[cn].append(_TXT_CAP[r['item']])
                try:
                    dr = float(r.get('draft') or 0)
                except (TypeError, ValueError):
                    dr = None
                if dr != 0:
                    leg = 'ขาเข้า' if r['item'] == 'EN' else 'ขาออก'
                    warns.append(f"{cn}: {leg} -CAP- แต่ดราฟ = {r.get('draft')} (ควรเป็น 0.00)")
        # 2. too long
        loa = loa_overrides.get(cn, report['loa_map'].get(cn))
        if loa is not None and float(loa) > LOA_LIMIT + 1e-9:
            out[cn].append(f"เรือยาวเกินข้อกำหนดขนาด {_num_txt(float(loa) - LOA_LIMIT)} เมตร")
        # 4. tug + barge
        key = report.get('loa_key', {}).get(cn) or ''
        if '+' in key:
            barge = key.split('+', 1)[1].strip()
            bl = lengths.get(normalize_name(barge))
            if bl is None:
                warns.append(f"{cn}: ลากบาส {barge} แต่ยังไม่มีความยาวของบาส — เพิ่ม '{barge}' ในเครื่องคิดเลข แล้วกดตรวจสอบอีกครั้ง")
            else:
                ft = math.ceil(round(float(bl) * 3.2808, 6))
                out[cn].append(f"ลากB.{barge} ยาว {_num_txt(bl)} เมตร ({ft} ฟุต) เข้ามาด้วย.")
    # 3. split invoice (change of agent)
    by_ship = defaultdict(list)
    for s in ships:
        nm = normalize_name(s.get('ship') or names.get(s['card_no']) or '')
        if nm:
            by_ship[nm].append(s)
    for nm, cards in by_ship.items():
        if len({_agent_key(c.get('agent')) for c in cards}) < 2:
            continue
        cards = sorted(cards, key=lambda c: card_sort_key(c['card_no']))
        its = {c['card_no']: {r['item'] for r in c['rows']} for c in cards}
        used = set()
        for ci in cards:                     # in-card (EN, maybe SH, no SA) -> next out-only card of another agent
            if not ('EN' in its[ci['card_no']] and 'SA' not in its[ci['card_no']]):
                continue
            for co in cards:
                if (co['card_no'] not in used and its[co['card_no']] == {'SA'}
                        and card_sort_key(co['card_no']) > card_sort_key(ci['card_no'])
                        and _agent_key(co.get('agent')) != _agent_key(ci.get('agent'))):
                    used.add(co['card_no'])
                    out[ci['card_no']].append(_TXT_SPLIT_IN)
                    out[co['card_no']].append(_TXT_SPLIT_OUT)
                    break
    for cn, t in out.items():
        if len(t) > 1:
            warns.append(f"{cn}: เข้าหลายกรณีพร้อมกัน ({len(t)} ข้อความ) — ตรวจสอบ Remark")
    return dict(out), warns
