import glob
import os
import shutil
import tempfile
import zipfile

import streamlit as st
import streamlit.components.v1 as components

import nav_core as nc

st.set_page_config(page_title="Navigation Card Merger", layout="wide",
                   initial_sidebar_state="expanded")

_BASE_CSS = """
<style>
%(app)s
</style>
"""

_DARK_CSS = """
.stApp, [data-testid="stAppViewContainer"], [data-testid="stHeader"], [data-testid="stMain"] {
    background-color: #0e1117 !important; }
.stApp, .stApp p, .stApp span, .stApp label, .stApp li, .stApp h1, .stApp h2, .stApp h3,
.stApp [data-testid="stMarkdownContainer"], .stApp [data-testid="stCaptionContainer"],
.stApp [data-testid="stWidgetLabel"] { color: #fafafa !important; }
.stApp [data-testid="stFileUploaderDropzone"] { background-color: #262730 !important; }
.stApp .stTextInput input, .stApp .stTextArea textarea,
.stApp [data-baseweb="select"] > div, .stApp [data-baseweb="input"],
.stApp [data-baseweb="textarea"] { background-color: #262730 !important; color: #fafafa !important; }
.stApp button[data-testid^="stBaseButton"] { background-color: #262730 !important;
    color: #fafafa !important; border: 1px solid #4b4b57 !important; }
.stApp button[data-testid="stBaseButton-primary"] { background-color: #ff4b4b !important;
    color: #ffffff !important; border-color: #ff4b4b !important; }
.stApp button[data-testid^="stBaseButton"]:disabled { opacity: 0.45 !important; }
.stApp hr { border-color: #3b3b45 !important; }
[data-testid="stSidebar"], [data-testid="stSidebar"] > div:first-child { background-color: #1b1c24 !important; }
.stApp button[data-testid="stBaseButton-primary"], .stApp button[data-testid="stBaseButton-primary"] * { color: #ffffff !important; }
.stApp [data-baseweb="input"], .stApp [data-baseweb="textarea"], .stApp [data-baseweb="select"] > div { border-color: #4b4b57 !important; }
.stApp [data-testid="stTextInputRootElement"], .stApp [data-testid="stTextAreaRootElement"], .stApp [data-testid="stSelectbox"] [data-baseweb="select"] > div { border-color: #4b4b57 !important; }
.stApp label[data-testid="stRadioOption"]:not([data-selected="true"]) > div > div:first-child,
.stApp label[data-baseweb="radio"]:not(:has(input:checked)) > div:first-child {
    background-color: #262730 !important; border-color: #8b8b97 !important; }
.stApp label[data-baseweb="checkbox"]:not(:has(input:checked)) > span:first-of-type,
.stApp label[data-testid="stCheckbox"]:not(:has(input:checked)) span[class*="Checkmark"],
.stApp label[data-testid="stCheckbox"]:not(:has(input:checked)) > span:first-of-type {
    background-color: #262730 !important; border-color: #8b8b97 !important; }
[data-baseweb="popover"] *, [data-baseweb="menu"], [data-baseweb="menu"] * {
    background-color: #262730 !important; color: #fafafa !important; }
"""

_LIGHT_CSS = """
.stApp, [data-testid="stAppViewContainer"], [data-testid="stHeader"], [data-testid="stMain"] {
    background-color: #ffffff !important; }
.stApp, .stApp p, .stApp span, .stApp label, .stApp li, .stApp h1, .stApp h2, .stApp h3,
.stApp [data-testid="stMarkdownContainer"], .stApp [data-testid="stCaptionContainer"],
.stApp [data-testid="stWidgetLabel"] { color: #31333f !important; }
.stApp [data-testid="stFileUploaderDropzone"] { background-color: #f0f2f6 !important; }
.stApp .stTextInput input, .stApp .stTextArea textarea,
.stApp [data-baseweb="select"] > div, .stApp [data-baseweb="input"],
.stApp [data-baseweb="textarea"] { background-color: #f0f2f6 !important; color: #31333f !important; }
.stApp button[data-testid^="stBaseButton"] { background-color: #ffffff !important;
    color: #31333f !important; border: 1px solid #d5d8e0 !important; }
.stApp button[data-testid="stBaseButton-primary"] { background-color: #ff4b4b !important;
    color: #ffffff !important; border-color: #ff4b4b !important; }
.stApp button[data-testid^="stBaseButton"]:disabled { opacity: 0.45 !important; }
.stApp hr { border-color: #e6e9ef !important; }
[data-testid="stSidebar"], [data-testid="stSidebar"] > div:first-child { background-color: #f0f2f6 !important; }
.stApp button[data-testid="stBaseButton-primary"], .stApp button[data-testid="stBaseButton-primary"] * { color: #ffffff !important; }
.stApp [data-baseweb="input"], .stApp [data-baseweb="textarea"], .stApp [data-baseweb="select"] > div { border-color: #d5d8e0 !important; }
.stApp [data-testid="stTextInputRootElement"], .stApp [data-testid="stTextAreaRootElement"], .stApp [data-testid="stSelectbox"] [data-baseweb="select"] > div { border-color: #d5d8e0 !important; }
.stApp label[data-testid="stRadioOption"]:not([data-selected="true"]) > div > div:first-child,
.stApp label[data-baseweb="radio"]:not(:has(input:checked)) > div:first-child {
    background-color: #ffffff !important; border-color: #bfc5d3 !important; }
.stApp label[data-baseweb="checkbox"]:not(:has(input:checked)) > span:first-of-type,
.stApp label[data-testid="stCheckbox"]:not(:has(input:checked)) span[class*="Checkmark"],
.stApp label[data-testid="stCheckbox"]:not(:has(input:checked)) > span:first-of-type {
    background-color: #ffffff !important; border-color: #bfc5d3 !important; }
[data-baseweb="popover"] *, [data-baseweb="menu"], [data-baseweb="menu"] * {
    background-color: #ffffff !important; color: #31333f !important; }
"""

_THEME_OPTIONS = ["🖥️ ตามระบบ", "☀️ สว่าง", "🌙 มืด"]


def apply_theme(choice):
    """Native Streamlit theme can't be switched per-session from code, so
    'สว่าง'/'มืด' are applied with CSS; 'ตามระบบ' leaves Streamlit's own
    theme untouched (it follows the browser/OS setting)."""
    if choice == _THEME_OPTIONS[1]:
        st.markdown(_BASE_CSS % {"app": _LIGHT_CSS}, unsafe_allow_html=True)
    elif choice == _THEME_OPTIONS[2]:
        st.markdown(_BASE_CSS % {"app": _DARK_CSS}, unsafe_allow_html=True)

_HERE = os.path.dirname(os.path.abspath(__file__))
_PAGES = ["⚓ รวมการ์ด", "🧮 เครื่องคิดเลข ×3.2808"]

with st.sidebar:
    st.markdown("### เมนู")
    _page = st.radio("เมนู", _PAGES, key="page_choice", label_visibility="collapsed")
    st.divider()
    _theme_choice = st.radio("โหมดการแสดงผล", _THEME_OPTIONS, key="theme_choice", index=0)
apply_theme(_theme_choice)

if _page == _PAGES[1]:
    st.title("🧮 เครื่องคิดเลข ×3.2808")
    st.caption("ความยาวเรือที่บันทึกที่นี่จะถูกใช้ในเมนู ⚓ รวมการ์ด โดยอัตโนมัติ "
               "(จำไว้ในเบราว์เซอร์เครื่องนี้ — กด “นำเข้าจาก CSV เก่า” เพื่อใส่ข้อมูลเดิมครั้งเดียว)")
    with open(os.path.join(_HERE, "calc_3_2808.html"), encoding="utf-8") as _f:
        _calc_html = _f.read()
    # follow the app's theme choice (the calculator keeps its own ☀️/🌙 button too)
    _calc_theme = {_THEME_OPTIONS[1]: "light", _THEME_OPTIONS[2]: "dark"}.get(_theme_choice)
    if _calc_theme:
        _calc_html = _calc_html.replace(
            "<script>",
            "<script>try{localStorage.setItem('calc3_2808_theme','" + _calc_theme + "');}catch(e){}</script>\n<script>", 1)
    _l, _m, _r = st.columns([1, 2, 1])
    with _m:
        components.html(_calc_html, height=900, scrolling=True)
    st.stop()   # the card-merger UI below is only for the first page

st.title("⚓ Navigation Card Merger")

# Bridge: reads the calculator's remembered ship lengths from this browser.
_ship_store = components.declare_component(
    "ship_store", path=os.path.join(_HERE, "ship_store_component"))
_store = _ship_store(key="ship_store", default=None)
_ship_memory = nc.ship_memory_from_store(_store)

st.caption("อัปโหลดไฟล์ zip (NavigationCard PDFs + ReportCardIsClosedDaily.xlsx + CSV ตัวเลข) "
           "ระบบจะตรวจสอบความครบถ้วนและรวมเป็น PDF เดียว")

def _add_remarks():
    """Button callback: parse the pasted '<card no> <message>' lines."""
    rep = st.session_state.report
    valid = [s["card_no"] for s in rep["ships"]] if rep else []
    new_remarks, new_texts, notes = nc.parse_remark_lines(
        st.session_state.get("remark_bulk_input", ""), valid)
    replaced = [cn for cn in new_remarks if cn in st.session_state.remarks]
    st.session_state.remarks.update(new_remarks)
    st.session_state.remark_texts.update(new_texts)
    st.session_state.remark_msg = {"added": list(new_remarks), "replaced": replaced, "notes": notes}
    if new_remarks:
        st.session_state.remark_bulk_input = ""   # clear the box once something was added


if "workdir" not in st.session_state:
    st.session_state.workdir = tempfile.mkdtemp(prefix="navcard_")
    st.session_state.report = None
    st.session_state.remarks = {}
    st.session_state.remark_texts = {}
    st.session_state.loa_overrides = {}
    st.session_state.data_fixes = {}
    st.session_state.row_overrides = {}

workdir = st.session_state.workdir
card_dir = os.path.join(workdir, "card_zip")
extracted_dir = os.path.join(workdir, "extracted")

uploaded = st.file_uploader("ไฟล์ zip ของชุดการ์ด", type="zip")

if _store is None:
    st.caption("⏳ กำลังอ่านความยาวเรือจากเครื่องคิดเลข...")
elif _store.get("error"):
    st.warning("อ่านข้อมูลความยาวเรือจากเบราว์เซอร์ไม่ได้ — ใส่ไฟล์ CSV ใน zip หรือกรอกเองด้านล่างแทน")
else:
    st.caption(f"🧮 ความยาวเรือที่จำไว้ในเครื่องคิดเลข: **{len(_ship_memory)}** ลำ"
               + ("" if _ship_memory else " — ยังไม่มี: ไปเมนู เครื่องคิดเลข แล้วกด “นำเข้าจาก CSV เก่า”"))

col_a, col_b, col_c = st.columns([1, 1, 1])
with col_a:
    analyze_clicked = st.button("📋 ตรวจสอบความครบถ้วน", type="primary", disabled=uploaded is None)
with col_b:
    recheck_clicked = st.button("🔁 ตรวจสอบอีกครั้ง (ไฟล์เดิม)", disabled=st.session_state.report is None,
                                help="ใช้หลังเพิ่มความยาวเรือในเครื่องคิดเลข ไม่ต้องอัปโหลด zip ซ้ำ")
with col_c:
    reset_clicked = st.button("🔄 เริ่มใหม่ (ล้างไฟล์ที่อัปโหลด)")

if reset_clicked:
    shutil.rmtree(workdir, ignore_errors=True)
    for k in list(st.session_state.keys()):
        del st.session_state[k]
    st.rerun()

if analyze_clicked and uploaded is not None:
    shutil.rmtree(card_dir, ignore_errors=True)
    shutil.rmtree(extracted_dir, ignore_errors=True)
    os.makedirs(card_dir, exist_ok=True)
    os.makedirs(extracted_dir, exist_ok=True)

    with zipfile.ZipFile(uploaded) as z:
        z.extractall(extracted_dir)

    for fn in os.listdir(extracted_dir):
        if fn.lower().endswith(".pdf"):
            shutil.move(os.path.join(extracted_dir, fn), os.path.join(card_dir, fn))

    xlsx_candidates = glob.glob(os.path.join(extracted_dir, "*.xlsx"))
    csv_paths = glob.glob(os.path.join(extracted_dir, "*.csv"))

    if not xlsx_candidates:
        st.error("ไม่พบไฟล์ .xlsx ใน zip นี้ — ต้องมี ReportCardIsClosedDaily.xlsx")
    else:
        xlsx_path = xlsx_candidates[0]
        report = nc.analyze_batch(card_dir, xlsx_path, csv_paths, ship_memory=_ship_memory)
        st.session_state.report = report
        st.session_state.upload_dt = nc.thai_now()
        st.session_state.remarks = {}
        st.session_state.remark_texts = {}
        st.session_state.loa_overrides = {}
        st.session_state.data_fixes = {}
        st.session_state.row_overrides = {}

if recheck_clicked and st.session_state.report is not None:
    _x = glob.glob(os.path.join(extracted_dir, "*.xlsx"))
    _c = glob.glob(os.path.join(extracted_dir, "*.csv"))
    if _x and os.path.isdir(card_dir):
        st.session_state.report = nc.analyze_batch(card_dir, _x[0], _c, ship_memory=_ship_memory)
        st.success("ตรวจสอบใหม่แล้ว (ใช้ความยาวเรือล่าสุดจากเครื่องคิดเลข)")
    else:
        st.error("ไม่พบไฟล์เดิมบนเซิร์ฟเวอร์แล้ว — กรุณาอัปโหลด zip ใหม่")

report = st.session_state.report

if report is not None:
    # sync manual length overrides from the input boxes first (so the messages below are never stale)
    for _cn, _nm in report["unmatched_loa_ships"]:
        _v = str(st.session_state.get(f"loa_{_cn}", "")).strip()
        try:
            if _v:
                st.session_state.loa_overrides[_cn] = float(_v)
            else:
                st.session_state.loa_overrides.pop(_cn, None)
        except ValueError:
            st.session_state.loa_overrides.pop(_cn, None)

    complete = nc.is_batch_complete(report, st.session_state.loa_overrides)
    n_ships = len(report["ships"])
    n_matched_cards = len(report["card_map"])

    st.subheader("ผลการตรวจสอบ")
    st.write(f"พบ **{n_ships}** รายการใน report, **{n_matched_cards}** ไฟล์การ์ดเปล่า")

    problems = False

    if report["duplicates"]:
        problems = True
        st.error(f"⚠️ พบการ์ดเลขซ้ำ: {report['duplicates']}")

    if report["missing_card_pdf"]:
        problems = True
        st.error(f"⚠️ ขาดไฟล์การ์ดเปล่าสำหรับ: {', '.join(report['missing_card_pdf'])}")

    if report["extra_cards_no_report_row"]:
        st.warning(
            f"ℹ️ การ์ดเปล่าที่ยังไม่มีแถวใน report (ตาราง For Staff จะว่าง): "
            f"{', '.join(report['extra_cards_no_report_row'])}"
        )

    _missing = [(cn, nm) for cn, nm in report["unmatched_loa_ships"]
                if cn not in st.session_state.loa_overrides]
    if report["unmatched_loa_ships"]:
        if _missing:
            problems = True
            st.error("⚠️ ไม่พบความยาวเรือ (ทั้งในเครื่องคิดเลขและ CSV) สำหรับ: "
                     + ", ".join(f"{nm or cn}" for cn, nm in report["unmatched_loa_ships"]
                                 if cn not in st.session_state.loa_overrides))
            st.caption("ไปเพิ่มที่เมนู 🧮 เครื่องคิดเลข ×3.2808 แล้วกลับมากด “ตรวจสอบอีกครั้ง (ไฟล์เดิม)” "
                       "หรือกรอกค่าชั่วคราวด้านล่าง")
        _box = st.expander("กรอกความยาวเรือเอง (เฉพาะรอบนี้)", expanded=len(_missing) <= 6)
        with _box:
            for cn, name in report["unmatched_loa_ships"]:
                cur = st.session_state.loa_overrides.get(cn, "")
                val = st.text_input(f"{cn} ({name or '-'})", value=cur, key=f"loa_{cn}")
                if val:
                    try:
                        st.session_state.loa_overrides[cn] = float(val)
                    except ValueError:
                        st.caption("ใส่ตัวเลขเท่านั้น")

    if report["unused_csv_entries"]:
        st.info(f"CSV มีรายการที่ไม่ได้ใช้ (ชื่อไม่ตรงกับเรือใดเลย): {report['unused_csv_entries']}")

    st.divider()
    st.subheader("รายการเรือทั้งหมด")
    for s in report["ships"]:
        cn = s["card_no"]
        name = report["ship_names"].get(cn, "(ไม่มีไฟล์การ์ด)")
        loa = report["loa_map"].get(cn)
        _src = {"csv": "CSV", "memory": "เครื่องคิดเลข"}.get(report.get("loa_source", {}).get(cn), "")
        if loa is not None:
            loa_display = f"{loa}m ({_src})"
        elif cn in st.session_state.loa_overrides:
            loa_display = f"{st.session_state.loa_overrides[cn]}m (กรอกเอง)"
        else:
            loa_display = "❌ ไม่มี"
        st.write(f"- **{cn}** — {name} — LOA: {loa_display} — {len(s['rows'])} legs")

    st.divider()
    st.subheader("✏️ เพิ่ม Remark (ถ้ามี)")
    st.caption("วางได้หลายบรรทัดพร้อมกัน บรรทัดละ 1 การ์ด รูปแบบ: เลขการ์ด เว้นวรรค ข้อความ "
               "— ระบบตัดบรรทัด ใส่สีแดงและฟอนต์ลายมือไทยให้เอง")
    st.text_area(
        "เลขการ์ด + ข้อความ Remark", key="remark_bulk_input", height=140,
        placeholder="SGZ40/70 **แยกใบแจ้งหนี้เรือออก/ไม่มีเรือออก**\n"
                    "SGZ41/70 แจ้งเรือออก: เปลี่ยนบริษัทหรือตัวแทนสายเรือ*แยกใบแจ้งหนี้เรือเข้า/ไม่มีเรือเข้า*",
    )
    st.button("➕ เพิ่ม Remark ทั้งหมดที่วาง", on_click=_add_remarks)

    _msg = st.session_state.pop("remark_msg", None)
    if _msg:
        if _msg["added"]:
            st.success("เพิ่มแล้ว: " + ", ".join(_msg["added"])
                       + (f"  (แทนที่ของเดิม: {', '.join(_msg['replaced'])})" if _msg["replaced"] else ""))
        for _n in _msg["notes"]:
            st.warning(_n)

    if st.session_state.remarks:
        st.write("Remark ที่ตั้งไว้:")
        for cn, lines in list(st.session_state.remarks.items()):
            c1, c2 = st.columns([5, 1])
            c1.markdown(f"**{cn}**")
            c1.text(st.session_state.remark_texts.get(cn, " ".join(lines)))
            if c2.button("ลบ", key=f"del_remark_{cn}"):
                del st.session_state.remarks[cn]
                st.session_state.remark_texts.pop(cn, None)
                st.rerun()

    st.divider()
    can_build = complete or st.checkbox(
        "ยืนยันสร้าง PDF ทั้งที่ข้อมูลยังไม่ครบ (การ์ดที่ขาดข้อมูลจะถูกข้ามหรือเว้นว่างบางส่วน)"
    )

    if not complete:
        st.warning("ข้อมูลยังไม่ครบตามเงื่อนไข — ตามปกติจะรอให้ครบก่อนค่อยสร้างไฟล์")

    if st.button("🛠️ สร้างไฟล์ PDF รวม", type="primary", disabled=not can_build):
        out_path = os.path.join(workdir, "output.pdf")
        nc.build_pdf(
            card_dir, report,
            loa_overrides=st.session_state.loa_overrides,
            remarks=st.session_state.remarks,
            data_fixes=st.session_state.data_fixes,
            row_count_overrides=st.session_state.row_overrides,
            output_path=out_path,
        )
        with open(out_path, "rb") as f:
            st.download_button(
                "⬇️ ดาวน์โหลดไฟล์ PDF รวม",
                f.read(),
                file_name=nc.thai_card_filename(st.session_state.get("upload_dt")),
                mime="application/pdf",
            )
        st.success("สร้างไฟล์เสร็จแล้ว!")
