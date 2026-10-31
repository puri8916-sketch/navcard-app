import glob
import json
import os
import shutil
import tempfile
import zipfile

import streamlit as st
import streamlit.components.v1 as components

import nav_core as nc
import importlib as _importlib
# Streamlit Cloud re-runs app.py after an update but keeps the old helper modules in memory;
# reload them when they are older than this app.py (missing new functions -> AttributeError)
if not hasattr(nc, "auto_remarks"):
    nc = _importlib.reload(nc)

st.set_page_config(page_title="Navigation Card Merger", layout="wide",
                   initial_sidebar_state="collapsed")

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

_THEME_OPTIONS = ["☀️ สว่าง", "🌙 มืด"]


def apply_theme(choice):
    """Native Streamlit theme can't be switched per-session from code, so
    'สว่าง'/'มืด' are applied with CSS; 'ตามระบบ' leaves Streamlit's own
    theme untouched (it follows the browser/OS setting)."""
    if choice == _THEME_OPTIONS[0]:
        st.markdown(_BASE_CSS % {"app": _LIGHT_CSS}, unsafe_allow_html=True)
    elif choice == _THEME_OPTIONS[1]:
        st.markdown(_BASE_CSS % {"app": _DARK_CSS}, unsafe_allow_html=True)

_HERE = os.path.dirname(os.path.abspath(__file__))


def _cfg_for(kind):
    """Sheet web-app URL/key: [app] (one merged script for everything) wins, else the old per-menu section."""
    try:
        for name in ("app", kind):
            sec = st.secrets.get(name, {})
            if sec.get("url"):
                return {"url": str(sec.get("url")).strip(), "key": str(sec.get("key", "")).strip(),
                        "managed": name == "app"}
    except Exception:
        pass
    return {}


# ---------- login (users in Streamlit secrets [users] name = "password"; none set → no login) ----------
import hashlib as _hl
import hmac as _hmac
import time as _time

_AUTH_COOKIE = "navauth"


def _users():
    try:
        return {str(k).strip(): str(v) for k, v in st.secrets.get("users", {}).items()}
    except Exception:
        return {}


def _auth_secret(users):
    try:
        x = str(st.secrets.get("auth_secret", ""))
    except Exception:
        x = ""
    return (x or "navcard|" + "|".join(f"{k}={v}" for k, v in sorted(users.items()))).encode("utf-8")


def _pw_ok(stored, given):
    if stored.startswith("sha256:"):
        return _hmac.compare_digest(stored[7:].lower(), _hl.sha256(given.encode("utf-8")).hexdigest())
    return _hmac.compare_digest(stored, given)


def _token(user, users, days=3650):   # ~10 years = until logout or a password change
    exp = int(_time.time()) + days * 86400
    msg = f"{user}|{exp}"
    sig = _hmac.new(_auth_secret(users), msg.encode("utf-8"), _hl.sha256).hexdigest()[:32]
    return f"{msg}|{sig}"


def _check_token(raw, users):
    from urllib.parse import unquote
    parts = unquote(raw or "").split("|")
    if len(parts) != 3:
        return None
    user, exp, sig = parts
    good = _hmac.new(_auth_secret(users), f"{user}|{exp}".encode("utf-8"), _hl.sha256).hexdigest()[:32]
    if user in users and exp.isdigit() and int(exp) > _time.time() and _hmac.compare_digest(sig, good):
        return user
    return None


def _cookie_user(users):
    try:
        return _check_token(st.context.cookies.get(_AUTH_COOKIE, ""), users)
    except Exception:
        return None


def _remember_js(value, max_age):
    """Keep the sign-in on this device: a cookie (read by the server) + localStorage (fallback when the
    hosting proxy does not pass cookies through: the login page sends it back as ?auth=…)."""
    from urllib.parse import quote
    v = json.dumps(value)
    components.html("<script>(()=>{const v=" + v + ";"
                    "try{window.parent.document.cookie='" + _AUTH_COOKIE + "='+encodeURIComponent(v)+'; path=/; max-age=" +
                    str(int(max_age)) + "; SameSite=Lax; Secure'}catch(e){}"
                    "try{if(v)localStorage.setItem('" + _AUTH_COOKIE + "',v);else localStorage.removeItem('" + _AUTH_COOKIE + "')}catch(e){}"
                    "try{window.top.sessionStorage.removeItem('navauth_try')}catch(e){}})()</script>", height=0)


_auth_ls = components.declare_component("auth_ls", path=os.path.join(_HERE, "auth_component"))


def _login_gate():
    """Stop here with a login form until someone signs in. Returns the user name."""
    users = _users()
    if not users:
        return None
    if st.session_state.pop("_auth_clear", False):
        _remember_js("", 0)
    user = st.session_state.get("auth_user")
    if not user and not st.session_state.get("_auth_nocookie"):
        user = _cookie_user(users)
        if not user and st.query_params.get("auth"):          # sent back from this device's localStorage
            user = _check_token(st.query_params.get("auth"), users)
            if user:
                st.session_state._auth_set = st.query_params.get("auth")
            else:
                _remember_js("", 0)                            # expired / changed password: forget it
            try:
                del st.query_params["auth"]
            except Exception:
                pass
        if user:
            st.session_state.auth_user = user
    if not user and not st.session_state.get("_auth_nocookie") and not st.session_state.get("_auth_ls_done"):
        # this browser's remembered sign-in, read by a tiny component in the same session (no reload)
        got = _auth_ls(key="auth_ls", default=None)
        if got is None:
            st.markdown("<div style='text-align:center;margin-top:30vh;color:#6b7884;font-size:18px'>กำลังเข้าสู่ระบบ…</div>",
                        unsafe_allow_html=True)
            st.stop()
        st.session_state._auth_ls_done = True
        user = _check_token((got or {}).get("t", ""), users)
        if user:
            st.session_state.auth_user = user
        elif (got or {}).get("t"):
            _remember_js("", 0)   # expired / password changed: forget it
    if user:
        tok = st.session_state.pop("_auth_set", None)
        if tok:
            _remember_js(tok, 3650 * 86400)
        return user
    st.markdown("<style>[data-testid='stSidebar'],[data-testid='stExpandSidebarButton']{display:none!important}"
                ".block-container{max-width:460px!important;padding-top:14vh!important}</style>", unsafe_allow_html=True)
    st.markdown("<h2 style='text-align:center;white-space:nowrap;margin-bottom:.5rem'>ระบบนำร่องสงขลา</h2>", unsafe_allow_html=True)
    with st.form("login"):
        u = st.text_input("ชื่อผู้ใช้")
        p = st.text_input("รหัสผ่าน", type="password")
        keep = st.checkbox("จำการเข้าสู่ระบบในเครื่องนี้", value=True)
        go = st.form_submit_button("เข้าสู่ระบบ", type="primary", width="stretch")
    if go:
        u = u.strip()
        name = next((k for k in users if k.lower() == u.lower()), None)
        if name and _pw_ok(users[name], p):
            st.session_state.auth_user = name
            st.session_state.pop("_auth_nocookie", None)
            if keep:
                st.session_state._auth_set = _token(name, users)
            st.rerun()
        st.error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    st.stop()


def _sync_script():
    """<script> tags that give a page the shared Google Sheet sync client (sync_client.js).
    The sheet URL/key can come from Streamlit secrets ([sync] url=..., key=...) or be typed
    in once per device under บันทึกประจำวัน › ตั้งค่า."""
    cfg = _cfg_for("sync")
    with open(os.path.join(_HERE, "sync_client.js"), encoding="utf-8") as f:
        js = f.read()
    return ("<script>window.__SYNC__=" + json.dumps(cfg, ensure_ascii=False).replace("</", "<\\/") + ";</script>\n"
            "<script>" + js + "</script>\n")


_P_LOG, _P_SCHED, _P_CLOSE = "สมุดบันทึกเรือ", "จัดตารางเรือ", "ปิดการ์ด"
_P_NOTICE = "แจ้งเรือขาดย้ายท่า"
_PAGES = [_P_SCHED, _P_LOG, _P_CLOSE, _P_NOTICE]   # จัดตารางเรือ first: the page the site opens on
if st.session_state.get("page_choice") not in _PAGES:
    st.session_state["page_choice"] = _PAGES[0]


def _go(p):
    st.session_state["page_choice"] = p


# Streamlit hides the sidebar's collapse (<<) button until hover; keep it visible so the
# menu can be hidden for more room, and make the reopen (>>) button easy to see.
st.logo(os.path.join(_HERE, "md_logo.png"), size="large")   # กรมเจ้าท่า, top-left of the menu
st.markdown("""<style>
[data-testid="stMain"] [data-testid="stElementContainer"]:has(iframe[srcdoc*="navauth"]){position:absolute!important;width:0!important;height:0!important;overflow:hidden}
.st-key-profile_pop{position:fixed!important;top:10px;right:16px;z-index:999990;width:auto!important}
.st-key-profile_pop > div > button,.st-key-profile_pop button[data-testid="stPopoverButton"]{width:40px;height:40px;min-height:40px;padding:0!important;border-radius:50%!important;background:#1A56DB!important;border:0!important;box-shadow:0 1px 4px rgb(0 0 0 / .25)}
.st-key-profile_pop::before{content:"";position:absolute;inset:-4px;border-radius:50%;pointer-events:none;z-index:0;
  background:conic-gradient(from 0deg,#00C6FF,#7B61FF,#FF4FD8,#FFB800,#00E28A,#00C6FF);
  -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2.5px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2.5px));
  animation:navSpin 2.4s linear infinite;filter:drop-shadow(0 0 4px rgb(123 97 255 / .7))}
.st-key-profile_pop::after{content:"";position:absolute;inset:-4px;border-radius:50%;pointer-events:none;z-index:0;
  background:conic-gradient(from 0deg,transparent 0 75%,rgb(255 255 255 / .95) 88%,transparent 100%);
  -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2.5px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2.5px));
  animation:navSpin 1.6s linear infinite}
.st-key-profile_pop > div{position:relative;z-index:1}
.st-key-profile_pop button[data-testid="stPopoverButton"]{background:linear-gradient(135deg,#2563EB,#7B3FE4)!important;transition:transform .2s}
.st-key-profile_pop button[data-testid="stPopoverButton"]:hover{transform:scale(1.07)}
@keyframes navSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.st-key-profile_pop::before,.st-key-profile_pop::after{animation:none}}
.st-key-profile_pop button p{color:#fff!important;font-size:19px!important;font-weight:800!important;margin:0!important}
.st-key-profile_pop button div[aria-hidden="true"],.st-key-profile_pop button [data-testid="stIconMaterial"]{display:none!important}
.st-key-profile_pop button,.st-key-profile_pop button > div,.st-key-profile_pop button > div > div{display:flex!important;align-items:center!important;justify-content:center!important;gap:0!important;margin:0!important}
.st-key-profile_pop button p{line-height:1!important}
[data-testid="stToolbarActions"],[data-testid="stToolbarActionButton"],[data-testid="stAppDeployButton"],[data-testid="stMainMenu"]{display:none!important}
.stApp header[data-testid="stHeader"],[data-testid="stHeader"]{height:auto!important;background:transparent!important;pointer-events:none;width:auto!important;right:auto!important}
[data-testid="stHeader"] button,[data-testid="stHeader"] img{pointer-events:auto}
[data-testid="stToolbar"],[data-testid="stToolbar"] *{background:transparent!important}
[data-testid="stToolbar"],[data-testid="stToolbar"] div:has([data-testid="stHeaderLogo"]){align-items:flex-start!important;height:auto!important}
div:has(> div > div > [data-testid="stHeaderLogo"]){flex-direction:row!important;align-items:center!important;gap:10px!important}
div:has(> [data-testid="stExpandSidebarButton"]){order:-1!important;align-self:center!important;margin-top:4px}
[data-testid="stExpandSidebarButton"]{background:transparent!important;border:0!important;border-radius:8px!important;padding:2px 6px!important;min-height:40px}
[data-testid="stExpandSidebarButton"]:hover{background:rgba(0,0,0,.06)!important}
[data-testid="stExpandSidebarButton"] [data-testid="stIconMaterial"]{font-size:0!important;width:auto!important}
[data-testid="stExpandSidebarButton"] [data-testid="stIconMaterial"]::after{content:"☰";font:700 30px/1 system-ui,"Segoe UI Symbol",sans-serif;color:#1d2730}
[data-testid="stSidebarLogo"],[data-testid="stHeaderLogo"]{height:48px!important;max-height:48px!important;width:auto!important;max-width:none!important}
[data-testid="stSidebarHeader"]{margin-left:-14px!important;padding-left:0!important;padding-top:6px!important;height:auto!important;align-items:flex-start!important}
[data-testid="stSidebarCollapseButton"],[data-testid="stSidebarCollapseButton"] *{opacity:1!important;visibility:visible!important;display:inline-flex!important}
[data-testid="stSidebar"] .stButton button{min-height:48px;padding:8px 14px;border-radius:10px}
[data-testid="stSidebar"] .stButton button p{font-size:19px!important;font-weight:700!important;letter-spacing:.2px;line-height:1.3}
[data-testid="stSidebar"] .stButton button[kind="secondary"]{color:#1d2730;border:1.5px solid #b9c3cc}
[data-testid="stSidebarCollapseButton"] button{border:1px solid rgba(128,128,128,.45)!important;border-radius:8px!important}
</style>""", unsafe_allow_html=True)

# Start every page load with the menu hidden. Streamlit remembers the last open/closed state in
# localStorage (stSidebarCollapsed-*), which overrides initial_sidebar_state, so reset it once per load.
_AUTH_USER = _login_gate()
if _AUTH_USER:
    with st.popover(_AUTH_USER[:1].upper(), key="profile_pop", help=_AUTH_USER):   # round badge: first letter of the user
        st.markdown(f"**{_AUTH_USER}**")
        if st.button("ออกจากระบบ", key="logout_btn", width="stretch"):
            st.session_state.pop("auth_user", None)
            st.session_state._auth_clear = True
            st.session_state._auth_nocookie = True   # this session's request still carries the old cookie
            st.rerun()

with st.sidebar:
    components.html("""<script>
    (()=>{const P=window.parent;if(!P||P.__navSbInit)return;P.__navSbInit=true;
    try{for(let i=0;i<P.localStorage.length;i++){const k=P.localStorage.key(i);if(k&&k.startsWith("stSidebarCollapsed-"))P.localStorage.setItem(k,"true")}}catch(e){}
    let n=0;const t=setInterval(()=>{const sb=P.document.querySelector('[data-testid="stSidebar"]');
      if(sb&&sb.getAttribute("aria-expanded")==="true"){const b=P.document.querySelector('[data-testid="stSidebarCollapseButton"] button');if(b){b.click();clearInterval(t)}}
      else if(sb||++n>40)clearInterval(t)},100)})();
    /* Streamlit Cloud badge (Created by … / Hosted with Streamlit) sits in the outer page: hide it there */
    (()=>{const hide=w=>{try{const D=w.document;if(D.getElementById("navHideBadge"))return;const s=D.createElement("style");s.id="navHideBadge";
      s.textContent='[class*="viewerBadge"],[class*="ViewerBadge"],[class*="profileContainer"],[class*="profilePreview"],[data-testid="appCreatorAvatar"],a[href*="streamlit.io/cloud"],a[href*="share.streamlit.io/user"]{display:none!important}';
      D.head.appendChild(s)}catch(e){}};let w=window;for(let i=0;i<4&&w;i++){hide(w);if(w===w.parent)break;w=w.parent}})();
    </script>""", height=0)
    _theme_choice = _THEME_OPTIONS[0]   # always light (the light/dark switch was removed)
    st.markdown("### ระบบนำร่องสงขลา")
    for _i, _p in enumerate(_PAGES):
        st.button(_p, key=f"nav_{_i}", on_click=_go, args=(_p,), width="stretch",
                  type="primary" if st.session_state["page_choice"] == _p else "secondary")
    _page = st.session_state["page_choice"]
apply_theme(_theme_choice)

if _page == _P_LOG:
    # Daily pilot log (replaces the per-day tabs of the Google Sheet "เล่มบันทึกข้อมูล").
    # Data lives in this browser's localStorage; the page has its own backup/restore buttons.
    import csv as _csv
    _db_path = os.path.join(_HERE, "ship_database.csv")
    _ship_db = []
    if os.path.exists(_db_path):
        with open(_db_path, encoding="utf-8-sig", newline="") as _f:
            for _r in _csv.DictReader(_f):
                if (_r.get("Ship's Name") or "").strip():
                    _ship_db.append({"name": _r["Ship's Name"].strip(),
                                     "loa": (_r.get("LOA") or "").strip(),
                                     "agent": (_r.get("Agent") or "").strip()})
    with open(os.path.join(_HERE, "pilot_log.html"), encoding="utf-8") as _f:
        _log_html = _f.read()
    _inject = "window.__SHIP_DB__=" + json.dumps(_ship_db, ensure_ascii=False).replace("</", "<\\/") + ";"
    # ships.csv lengths are copied once into the original port's sheet (calcShips) by the page
    _inject += "window.__DEFAULT_SHIPS__=" + json.dumps(nc.load_default_ships(os.path.join(_HERE, "ships.csv")),
                                                       ensure_ascii=False).replace("</", "<\\/") + ";"
    _log_theme = {_THEME_OPTIONS[0]: "light", _THEME_OPTIONS[1]: "dark"}.get(_theme_choice)
    if _log_theme:
        _inject += "window.__THEME__='" + _log_theme + "';"
    _log_html = _log_html.replace("<script>", "<script>" + _inject + "</script>\n" + _sync_script() + "<script>", 1)
    st.markdown("""<style>[data-testid="stMainBlockContainer"],[data-testid="block-container"],.block-container,section.main>div{padding-top:.5rem !important;padding-bottom:0 !important;padding-left:.75rem !important;padding-right:.75rem !important;max-width:100% !important}iframe[data-testid="stIFrame"][scrolling="auto"]{height:calc(100vh - 68px) !important;height:calc(100dvh - 68px) !important;display:block}[data-testid="stAppViewContainer"] [data-testid="stMain"],section.main{overflow:hidden}</style>""",
                unsafe_allow_html=True)
    components.html(_log_html, height=1100, scrolling=True)
    st.stop()

if _page in (_P_SCHED, _P_NOTICE):
    # Ship's schedule for printing (replaces the per-day tabs + แก้ไข tab of the schedule workbook).
    # Data lives in its own Google Sheet (ShipSchedule_DB) via apps_script/Schedule.gs.
    with open(os.path.join(_HERE, "schedule.html"), encoding="utf-8") as _f:
        _sched_html = _f.read()
    _sched_cfg = {k: v for k, v in _cfg_for("schedule").items() if k in ("url", "key")}
    _inject = ("window.__SCHED__=" + json.dumps(_sched_cfg, ensure_ascii=False).replace("</", "<\\/") + ";"
               "window.__CAN_PRINT__=true;" + ("window.__ONLY__='notice';" if _page == _P_NOTICE else ""))
    _sched_theme = {_THEME_OPTIONS[0]: "light", _THEME_OPTIONS[1]: "dark"}.get(_theme_choice)
    if _sched_theme:
        _inject += "window.__THEME__='" + _sched_theme + "';"
    _sched_html = _sched_html.replace("<script>", "<script>" + _inject + "</script>\n<script>", 1)
    st.markdown("""<style>[data-testid="stMainBlockContainer"],[data-testid="block-container"],.block-container,section.main>div{padding-top:.5rem !important;padding-bottom:0 !important;padding-left:.75rem !important;padding-right:.75rem !important;max-width:100% !important}iframe[data-testid="stIFrame"][scrolling="auto"]{height:calc(100vh - 68px) !important;height:calc(100dvh - 68px) !important;display:block}[data-testid="stAppViewContainer"] [data-testid="stMain"],section.main{overflow:hidden}</style>""",
                unsafe_allow_html=True)
    components.html(_sched_html, height=1100, scrolling=True)
    st.stop()

# Bridge to this browser: calculator ship lengths + its Google Sheet connection.
_ship_store = components.declare_component(
    "ship_store", path=os.path.join(_HERE, "ship_store_component"))

def _calc_component(height):
    """The ×3.2808 calculator (same synced ship lengths), shown beside the card merger."""
    with open(os.path.join(_HERE, "calc_3_2808.html"), encoding="utf-8") as _f:
        _calc_html = _f.read()
    _defaults = nc.load_default_ships(os.path.join(_HERE, "ships.csv"))
    _calc_html = _calc_html.replace(
        "<script>", "<script>window.__DEFAULT_SHIPS__=" + json.dumps(_defaults, ensure_ascii=False).replace("</", "<\\/") + ";</script>\n<script>", 1)
    _calc_theme = {_THEME_OPTIONS[0]: "light", _THEME_OPTIONS[1]: "dark"}.get(_theme_choice)
    if _calc_theme:
        _calc_html = _calc_html.replace(
            "<script>",
            "<script>try{localStorage.setItem('calc3_2808_theme','" + _calc_theme + "');}catch(e){}</script>\n<script>", 1)
    _calc_html = _calc_html.replace("<script>", _sync_script() + "<script>", 1)
    components.html(_calc_html, height=height, scrolling=True)


_main, _side = st.columns([5, 2], gap="large")
with _side:
    st.markdown("#### 🧮 เครื่องคิดเลข ×3.2808")
    _calc_component(560)

with _main:
    import report_page
    st.title("📑 ปิดการ์ดประจำวัน")

    _store = _ship_store(key="ship_store", default=None)
    # ship lengths come from the calculator store only (ships.csv defaults now live in the sheet of the original port)
    _ship_memory = dict(nc.ship_memory_from_store(_store))
    for _nm, _d in ((_store or {}).get("ships") or {}).items():   # ships removed in the calculator
        if isinstance(_d, dict) and _d.get("hidden"):
            _ship_memory.pop(_nm, None)


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
        st.session_state.auto_off = set()
        st.session_state.row_overrides = {}

    workdir = st.session_state.workdir
    card_dir = os.path.join(workdir, "card_zip")
    extracted_dir = os.path.join(workdir, "extracted")

    uploads = st.file_uploader("ไฟล์ zip ของชุดการ์ด หรือ ReportCardIsClosedDaily.xlsx", type=["zip", "xlsx"],
                               accept_multiple_files=True, key=f"up_{st.session_state.get('up_n', 0)}")
    # unpack once per new set of files: PDFs -> card_dir, xlsx/csv -> extracted_dir (zip by zip, so names can repeat)
    _sig = tuple((u.name, u.size) for u in uploads)
    if _sig != st.session_state.get("up_sig"):
        st.session_state.up_sig = _sig
        st.session_state.report = None
        shutil.rmtree(card_dir, ignore_errors=True)
        shutil.rmtree(extracted_dir, ignore_errors=True)
        os.makedirs(card_dir, exist_ok=True)
        os.makedirs(extracted_dir, exist_ok=True)
        for _i, _u in enumerate(uploads):
            _sub = os.path.join(extracted_dir, f"{_i:02d}")
            os.makedirs(_sub, exist_ok=True)
            if _u.name.lower().endswith(".xlsx"):
                with open(os.path.join(_sub, _u.name), "wb") as _f:
                    _f.write(_u.getvalue())
                continue
            try:
                with zipfile.ZipFile(_u) as z:
                    z.extractall(_sub)
            except zipfile.BadZipFile:
                st.error(f"{_u.name}: ไม่ใช่ไฟล์ zip")
                continue
            for _root, _dirs, _files in os.walk(_sub):
                for fn in _files:
                    if fn.lower().endswith(".pdf"):
                        shutil.move(os.path.join(_root, fn), os.path.join(card_dir, f"{_i:02d}_{fn}"))
    _xlsx = sorted(glob.glob(os.path.join(extracted_dir, "**", "*.xlsx"), recursive=True))
    _xlsx = [p for p in _xlsx if not os.path.basename(p).startswith("~$")]
    _csvs = sorted(glob.glob(os.path.join(extracted_dir, "**", "*.csv"), recursive=True))
    _has_cards = os.path.isdir(card_dir) and any(f.lower().endswith(".pdf") for f in os.listdir(card_dir))

    # ---------------------------------------------------------------- step 1: closing report (monthly workbook)
    st.subheader("ขั้นที่ 1 · รายงานการปิดการ์ดนำร่อง")
    _ctx = report_page.setup(_store)
    if not uploads:
        pass
    elif not _xlsx:
        st.error("ไม่พบ ReportCardIsClosedDaily.xlsx ในไฟล์ที่วาง")
    elif _ctx:
        _files = []
        for _p in _xlsx:
            with open(_p, "rb") as _f:
                _files.append((os.path.basename(_p), _f.read()))
        report_page.step1(_ctx, _files)

    # G.R.T./N.R.T. of every uploaded card -> sheet collection "tonnage" (used by รายงานสถิติเรือ in บันทึกเรือ)
    if _ctx and _has_cards:
        _sig = tuple(sorted(os.listdir(card_dir)))
        if st.session_state.get("ton_sig") != _sig:
            try:
                _ton = nc.card_tonnage(card_dir)
                _old = _ctx["db"].load_col("tonnage") if _ton else {}
                _new = {k: v for k, v in _ton.items()
                        if any(str((_old.get(k) or {}).get(f)) != str(v[f]) for f in ("grt", "nrt", "name"))}
                if _new:
                    _ctx["db"].put_docs("tonnage", _new)
                st.session_state.ton_sig = _sig
                st.session_state.ton_msg = (f"⚓ G.R.T./N.R.T. จากการ์ด {len(_ton)} ลำ"
                                            + (f" · บันทึกใหม่/อัปเดต {len(_new)} ลำ" if _new else " · มีครบแล้ว"))
            except Exception as e:
                st.session_state.ton_msg = f"⚠️ บันทึก G.R.T./N.R.T. ไม่สำเร็จ: {e}"
        if st.session_state.get("ton_msg"):
            st.caption(st.session_state.ton_msg)

    # ---------------------------------------------------------------- step 2: merge the navigation cards
    st.divider()
    st.subheader("ขั้นที่ 2 · รวมการ์ดนำร่อง (PDF)")
    if uploads and not _has_cards:
        st.caption("ไม่มีไฟล์การ์ด (PDF) ในที่วาง — ข้ามขั้นนี้ หรือวาง zip ชุดการ์ด")

    if _store is None:
        st.caption("⏳ กำลังอ่านความยาวเรือจากเครื่องคิดเลข...")
    elif _store.get("error"):
        st.warning("อ่านข้อมูลความยาวเรือจากเบราว์เซอร์ไม่ได้ — ใส่ไฟล์ CSV ใน zip หรือกรอกเองด้านล่างแทน")
    else:
        st.caption(f"🧮 ความยาวเรือที่จำไว้ในเครื่องคิดเลข: **{len(_ship_memory)}** ลำ"
                   + ("" if _ship_memory else " — ยังไม่มี: เพิ่มในเครื่องคิดเลขด้านขวา หรือนำเข้าที่ 📒 บันทึกเรือ › ตั้งค่า"))

    col_a, col_b, col_c = st.columns([1, 1, 1])
    with col_a:
        analyze_clicked = st.button("📋 ตรวจสอบความครบถ้วน", type="primary", disabled=not (_has_cards and _xlsx))
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

    if analyze_clicked and _has_cards and _xlsx:
        report = nc.analyze_batch(card_dir, _xlsx, _csvs, ship_memory=_ship_memory)
        st.session_state.report = report
        st.session_state.upload_dt = nc.thai_now()
        st.session_state.remarks = {}
        st.session_state.remark_texts = {}
        st.session_state.loa_overrides = {}
        st.session_state.data_fixes = {}
        st.session_state.auto_off = set()
        st.session_state.row_overrides = {}

    if recheck_clicked and st.session_state.report is not None:
        if _xlsx and _has_cards:
            st.session_state.report = nc.analyze_batch(card_dir, _xlsx, _csvs, ship_memory=_ship_memory)
            st.success("ตรวจสอบใหม่แล้ว (ใช้ความยาวเรือล่าสุดจากเครื่องคิดเลข)")
        else:
            st.error("ไม่พบไฟล์เดิมบนเซิร์ฟเวอร์แล้ว — กรุณาวาง zip ใหม่")

    # a ship just saved in the ×3.2808 calculator: re-check by itself (no refresh / no button needed)
    if (not recheck_clicked and st.session_state.report is not None and _xlsx and _has_cards
            and st.session_state.report.get("unmatched_loa_ships")):
        _mem = {nc.normalize_name(k) for k in _ship_memory}
        _now = [nm for _cn, nm in st.session_state.report["unmatched_loa_ships"] if nc.normalize_name(nm) in _mem]
        if _now and st.session_state.get("_auto_loa") != (tuple(_now), len(_mem)):
            st.session_state._auto_loa = (tuple(_now), len(_mem))
            st.session_state.report = nc.analyze_batch(card_dir, _xlsx, _csvs, ship_memory=_ship_memory)
            st.toast("พบความยาวเรือใหม่จากเครื่องคิดเลข: " + ", ".join(dict.fromkeys(_now)))

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
                st.caption("เพิ่มในเครื่องคิดเลขด้านขวา แล้วกลับมากด “ตรวจสอบอีกครั้ง (ไฟล์เดิม)” "
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
        # typed Remarks: folded away by default (automatic Remarks below); click to open
        with st.expander("✏️ เพิ่ม Remark เอง (ถ้ามี) — กดเพื่อแสดง/ซ่อน", expanded=bool(st.session_state.remarks)):
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

        # automatic Remarks for the special cases (CAP / ยาวเกิน 173 ม. / แยกใบแจ้งหนี้ / ลากบาส)
        _auto, _auto_warn = nc.auto_remarks(report, st.session_state.loa_overrides)
        _off = st.session_state.setdefault("auto_off", set())
        st.subheader("🤖 Remark อัตโนมัติ")
        if _auto:
            for cn, texts in _auto.items():
                c1, c2 = st.columns([5, 1])
                _manual = cn in st.session_state.remarks
                _state = " (ใช้ที่พิมพ์เองแทน)" if _manual else (" (ปิดอยู่)" if cn in _off else "")
                c1.markdown(f"**{cn}** — {report['ship_names'].get(cn, '')}{_state}")
                c1.text("\n".join(texts))
                if cn in _off:
                    if c2.button("ใช้", key=f"auto_on_{cn}"):
                        _off.discard(cn); st.rerun()
                elif c2.button("ไม่ใช้", key=f"auto_off_{cn}"):
                    _off.add(cn); st.rerun()
        else:
            st.caption("ไม่มีการ์ดเข้ากรณีพิเศษ")
        for _w in _auto_warn:
            st.warning("⚠️ " + _w)

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
                remarks={**{cn: [ln for t in texts for ln in nc.wrap_thai(t, 100)]
                            for cn, texts in _auto.items() if cn not in _off},
                         **st.session_state.remarks},
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

    # ---------------------------------------------------------------- monthly workbook + signer (less often)
    st.divider()
    if _ctx:
        st.subheader("📁 ไฟล์รายงานการปิดการ์ดประจำเดือน")
        report_page.month_and_settings(_ctx)
