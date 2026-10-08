import glob
import os
import shutil
import tempfile
import zipfile

import streamlit as st

import nav_core as nc

st.set_page_config(page_title="Navigation Card Merger", layout="wide")

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

_title_col, _theme_col = st.columns([3, 2])
with _title_col:
    st.title("⚓ Navigation Card Merger")
with _theme_col:
    _theme_choice = st.radio("โหมดการแสดงผล", _THEME_OPTIONS, horizontal=True,
                             key="theme_choice", index=0)
apply_theme(_theme_choice)
st.caption("อัปโหลดไฟล์ zip (NavigationCard PDFs + ReportCardIsClosedDaily.xlsx + CSV ตัวเลข) "
           "ระบบจะตรวจสอบความครบถ้วนและรวมเป็น PDF เดียว")

if "workdir" not in st.session_state:
    st.session_state.workdir = tempfile.mkdtemp(prefix="navcard_")
    st.session_state.report = None
    st.session_state.remarks = {}
    st.session_state.loa_overrides = {}
    st.session_state.data_fixes = {}
    st.session_state.row_overrides = {}

workdir = st.session_state.workdir
card_dir = os.path.join(workdir, "card_zip")
extracted_dir = os.path.join(workdir, "extracted")

uploaded = st.file_uploader("ไฟล์ zip ของชุดการ์ด", type="zip")

col_a, col_b = st.columns([1, 1])
with col_a:
    analyze_clicked = st.button("📋 ตรวจสอบความครบถ้วน", type="primary", disabled=uploaded is None)
with col_b:
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
        report = nc.analyze_batch(card_dir, xlsx_path, csv_paths)
        st.session_state.report = report
        st.session_state.upload_dt = nc.thai_now()
        st.session_state.remarks = {}
        st.session_state.loa_overrides = {}
        st.session_state.data_fixes = {}
        st.session_state.row_overrides = {}

report = st.session_state.report

if report is not None:
    complete = nc.is_batch_complete(report)
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

    if report["unmatched_loa_ships"] and not report["no_csv_at_all"]:
        problems = True
        st.error("⚠️ ไม่มีค่า LOA (CSV) สำหรับเรือเหล่านี้ — กรอกค่าด้วยตนเองด้านล่าง:")
        for cn, name in report["unmatched_loa_ships"]:
            cur = st.session_state.loa_overrides.get(cn, "")
            val = st.text_input(f"LOA override สำหรับ {cn} ({name})", value=cur, key=f"loa_{cn}")
            if val:
                try:
                    st.session_state.loa_overrides[cn] = float(val)
                except ValueError:
                    st.caption("ใส่ตัวเลขเท่านั้น")

    if report["unused_csv_entries"]:
        st.info(f"CSV มีรายการที่ไม่ได้ใช้ (ชื่อไม่ตรงกับเรือใดเลย): {report['unused_csv_entries']}")

    if report["no_csv_at_all"]:
        st.warning("ไม่มีไฟล์ CSV ใน zip นี้ — จะข้ามตัวเลขหลัง LOA ทุกใบ")

    st.divider()
    st.subheader("รายการเรือทั้งหมด")
    for s in report["ships"]:
        cn = s["card_no"]
        name = report["ship_names"].get(cn, "(ไม่มีไฟล์การ์ด)")
        loa = report["loa_map"].get(cn)
        loa_display = f"{loa}m" if loa is not None else "-"
        st.write(f"- **{cn}** — {name} — LOA: {loa_display} — {len(s['rows'])} legs")

    st.divider()
    st.subheader("✏️ เพิ่ม Remark (ถ้ามี)")
    st.caption("พิมพ์ข้อความเต็ม ระบบจะตัดบรรทัดให้เอง ใส่สีแดงและฟอนต์ลายมือไทยอัตโนมัติ")
    remark_card = st.selectbox("เลือกการ์ด", ["-"] + [s["card_no"] for s in report["ships"]])
    remark_text = st.text_area("ข้อความ Remark", key="remark_text_input")
    if st.button("➕ เพิ่ม Remark นี้") and remark_card != "-" and remark_text.strip():
        st.session_state.remarks[remark_card] = nc.wrap_thai(remark_text.strip(), 100)
        st.success(f"เพิ่ม Remark ให้ {remark_card} แล้ว")

    if st.session_state.remarks:
        st.write("Remark ที่ตั้งไว้:")
        for cn, lines in list(st.session_state.remarks.items()):
            c1, c2 = st.columns([5, 1])
            c1.write(f"**{cn}**: {' '.join(lines)}")
            if c2.button("ลบ", key=f"del_remark_{cn}"):
                del st.session_state.remarks[cn]
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
