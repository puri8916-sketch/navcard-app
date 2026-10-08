"""
Core logic for merging Songkhla pilot Navigation Cards into one PDF.
Pure functions - no hardcoded paths, no globals except font registration.
"""
import csv
import io
import os
import re
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


def extract_card_no(path):
    with pdfplumber.open(path) as pdf:
        t = pdf.pages[0].extract_text()
    m = re.search(r'Card no\. (\S+)', t)
    return m.group(1) if m else None


def extract_ship_name(path):
    with pdfplumber.open(path) as pdf:
        t = pdf.pages[0].extract_text()
    m = re.search(r'Ship name : (.*?) Flag', t)
    return m.group(1).strip() if m else None


def extract_loa_meters(path):
    with pdfplumber.open(path) as pdf:
        t = pdf.pages[0].extract_text()
    m = re.search(r'LOA \(m/f\) :\s*([\d.]+)', t)
    return float(m.group(1)) if m else None


def parse_ships(xlsx_path):
    """Parse the ReportCardIsClosedDaily.xlsx into a list of
    {'card_no':, 'rows': [{'item','day','month','time','draft','berth','pilot'}]}."""
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
            cur = {'card_no': cardno, 'rows': []}
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

    n_override = row_count_override
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


def analyze_batch(card_dir, xlsx_path, csv_paths):
    """Read everything and report completeness + the proposed LOA matching,
    without building the final PDF. Used to drive the UI before the user
    confirms remarks/overrides and clicks Build."""
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
                else:
                    loa_map[cn] = None
                    unmatched_ships.append((cn, ship_names.get(cn)))
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
            else:
                unmatched_ships = [(s['card_no'], ship_names.get(s['card_no'])) for s in ships]

    report = {
        'ships': ships,
        'card_map': card_map,
        'ship_names': ship_names,
        'loa_map': loa_map,
        'duplicates': duplicates,
        'missing_card_pdf': missing_card_pdf,
        'extra_cards_no_report_row': extra_cards,
        'unmatched_loa_ships': unmatched_ships,
        'unused_csv_entries': unused_csv,
        'no_csv_at_all': no_csv_at_all,
    }
    return report


def is_batch_complete(report):
    """True only if every card has: a blank PDF, a report row (or is an
    accepted empty-row 'extra' card), and an LOA value (or LOA skip is ok
    when there's genuinely no csv at all)."""
    if report['missing_card_pdf']:
        return False
    if report['unmatched_loa_ships'] and not report['no_csv_at_all']:
        return False
    return True


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
