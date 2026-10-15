"""Streamlit page: 📑 รายงานการปิดการ์ดนำร่อง (monthly workbook from ReportCardIsClosedDaily.xlsx)."""
from datetime import date, timedelta

import streamlit as st

import report_core as rc


def _cfg(store):
    try:
        sec = st.secrets.get("sync", {})
        if sec.get("url"):
            return str(sec["url"]), str(sec.get("key", ""))
    except Exception:
        pass
    c = (store or {}).get("cfg")
    if c and c.get("url"):
        return c["url"], c.get("key", "")
    return None


def _load(db, force=False):
    if force or "rep_days" not in st.session_state:
        st.session_state.rep_days, st.session_state.rep_sig = db.load()
    return st.session_state.rep_days, st.session_state.rep_sig


def _label(iso):
    return rc.tab_name(iso)


def _moves(card):
    return " · ".join(e[0].replace(" : ", " ")[:8] for e in card["ev"])


def _month_key(iso):
    return iso[:7]


def _month_title(ym):
    y, m = (int(x) for x in ym.split("-"))
    return rc.month_file_name(y, m)[:-5]


def render(ship_store):
    st.title("📑 รายงานการปิดการ์ดนำร่อง")
    store = ship_store(key="rep_store", default=None)
    cfg = _cfg(store)
    if cfg is None:
        if store is None:
            st.caption("⏳ กำลังอ่านการเชื่อมต่อ Google Sheet ของเครื่องนี้…")
        else:
            st.error("ยังไม่ได้เชื่อมต่อ Google Sheet — ไปที่เมนู 📒 บันทึกเรือ › ตั้งค่า › เชื่อมต่อ Google Sheet ก่อน "
                     "(รายงานเก็บไว้ในชีตเดียวกัน ทุกเครื่องเห็นเหมือนกัน)")
        return
    db = rc.SheetStore(*cfg)
    try:
        days, sig = _load(db)
    except Exception as e:
        st.error(f"อ่านข้อมูลจาก Google Sheet ไม่ได้: {e}")
        if st.button("ลองอีกครั้ง"):
            st.session_state.pop("rep_days", None)
            st.rerun()
        return

    if st.session_state.get("rep_msg"):
        st.success(st.session_state.pop("rep_msg"))

    # ------------------------------------------------------------ 1) add a daily export
    st.subheader("1. วางไฟล์ ReportCardIsClosedDaily")
    up = st.file_uploader("ReportCardIsClosedDaily.xlsx", type=["xlsx"],
                          key=f"rep_up_{st.session_state.get('rep_up_n', 0)}", label_visibility="collapsed")
    if up is not None:
        try:
            d0, d1, cards = rc.parse_daily(up.getvalue())
        except Exception as e:
            st.error(str(e))
            cards = None
        if cards:
            span = [(date.fromisoformat(d0) + timedelta(days=i)).isoformat()
                    for i in range((date.fromisoformat(d1) - date.fromisoformat(d0)).days + 1)]
            if len(span) == 1:
                assign = [d1] * len(cards)
                st.caption(f"ไฟล์วันที่ {_label(d1)} · {len(cards)} การ์ด")
            else:
                st.info(f"ไฟล์นี้ครอบคลุม {len(span)} วัน ({_label(d0)} ถึง {_label(d1)}) — เลือกว่าการ์ดไหนเป็นของแท็บวันไหน "
                        "(ระบบเดาให้จากวันที่เรือออก/เคลื่อนไหวล่าสุด +1 วัน แก้ได้ในคอลัมน์ แท็บ)")
                sugg = rc.suggest_days(d0, d1, cards)
                labels = [_label(x) for x in span]
                rows = [{"การ์ด": c["no"], "เรือ": c["ship"].strip(), "การเคลื่อนไหว": _moves(c), "แท็บ": _label(s)}
                        for c, s in zip(cards, sugg)]
                ed = st.data_editor(rows, key=f"rep_split_{up.name}_{d0}_{d1}", hide_index=True, width="stretch",
                                    disabled=["การ์ด", "เรือ", "การเคลื่อนไหว"],
                                    column_config={"แท็บ": st.column_config.SelectboxColumn("แท็บ", options=labels,
                                                                                         required=True, width="small")})
                lab2iso = dict(zip(labels, span))
                assign = [lab2iso[r["แท็บ"]] for r in ed]

            groups = {}
            for c, d in zip(cards, assign):
                groups.setdefault(d, []).append(c)
            known = {c["no"]: iso for iso, t in days.items() for c in t.get("cards", [])}
            for d, cs in sorted(groups.items()):
                n, en, sa, sh = rc.counts(cs)
                warn = ""
                if d in days:
                    warn = f" · ⚠ แท็บนี้มีอยู่แล้ว ({len(days[d].get('cards', []))} การ์ด) จะถูกแทนที่"
                st.markdown(f"**แท็บ {_label(d)}** — {len(cs)} การ์ด: {cs[0]['no']} ({cs[0]['ship'].strip()}) "
                            f"ถึง {cs[-1]['no']} ({cs[-1]['ship'].strip()}) · {n} ลำ เข้า {en} ออก {sa} เลื่อน {sh}{warn}")
            dup = sorted({f"{c['no']} (อยู่ในแท็บ {_label(known[c['no']])})" for d, cs in groups.items() for c in cs
                          if c["no"] in known and known[c["no"]] != d})
            if dup:
                st.warning("การ์ดเหล่านี้มีอยู่แล้วในแท็บอื่น: " + ", ".join(dup))
            if st.button("บันทึกลงรายงาน", type="primary"):
                try:
                    db.put_days([{"date": d, "sent": False, "cards": cs} for d, cs in sorted(groups.items())])
                    st.session_state.rep_up_n = st.session_state.get("rep_up_n", 0) + 1
                    st.session_state.rep_msg = "บันทึกแล้ว: แท็บ " + ", ".join(_label(d) for d in sorted(groups))
                    _load(db, force=True)
                    st.rerun()
                except Exception as e:
                    st.error(f"บันทึกไม่สำเร็จ: {e}")

    # ------------------------------------------------------------ 2) the month file
    st.subheader("2. ไฟล์รายงานประจำเดือน")
    months = sorted({_month_key(d) for d in days}, reverse=True)
    if not months:
        st.caption("ยังไม่มีข้อมูล — วางไฟล์ด้านบน หรือ นำเข้าไฟล์เดือนเดิม (ข้อ 3)")
    else:
        ym = st.selectbox("เดือน", months, format_func=_month_title, key="rep_month")
        mdays = sorted(d for d in days if d.startswith(ym))
        rows = []
        for d in mdays:
            t = days[d]
            rows.append({"แท็บ": _label(d), "การ์ด": len(t.get("cards", [])),
                         "สรุป": rc.counts_text(t.get("cards", [])).replace("รวมทั้งหมด ", ""),
                         "ส่งการเงินแล้ว (แท็บเขียว)": bool(t.get("sent"))})
        ed = st.data_editor(rows, key=f"rep_tabs_{ym}", hide_index=True, width="stretch",
                            disabled=["แท็บ", "การ์ด", "สรุป"])
        changed = [dict(days[d], sent=r["ส่งการเงินแล้ว (แท็บเขียว)"]) for d, r in zip(mdays, ed)
                   if bool(days[d].get("sent")) != r["ส่งการเงินแล้ว (แท็บเขียว)"]]
        if changed:
            try:
                db.put_days(changed)
                for t in changed:
                    days[t["date"]] = t
            except Exception as e:
                st.error(f"บันทึกสถานะไม่สำเร็จ: {e}")
        y, m = (int(x) for x in ym.split("-"))
        fname = rc.month_file_name(y, m)
        if sig is None:
            st.warning("ยังไม่มีรูปลายเซ็น — ไฟล์จะมีชื่อผู้เซ็นแต่ไม่มีลายเซ็น (เพิ่มได้ในข้อ 3)")
        st.download_button(f"⬇️ ดาวน์โหลด {fname}", data=rc.build_month([days[d] for d in mdays], sig),
                           file_name=fname, type="primary",
                           mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        with st.expander("ลบแท็บ"):
            dsel = st.selectbox("แท็บที่จะลบ", mdays, format_func=_label, key="rep_del_sel")
            ok = st.checkbox(f"ยืนยันลบแท็บ {_label(dsel)}", key="rep_del_ok")
            if st.button("ลบแท็บนี้", disabled=not ok):
                db.delete_day(dsel)
                st.session_state.rep_msg = f"ลบแท็บ {_label(dsel)} แล้ว"
                _load(db, force=True)
                st.rerun()

    # ------------------------------------------------------------ 3) one-time import + signature
    st.subheader("3. นำเข้าไฟล์เดือนเดิม / ลายเซ็น")
    with st.expander("นำเข้าไฟล์รายงานเดือนเดิม (เช่น ต.ค.69.xlsx) — ใช้ครั้งแรก"):
        st.caption("อ่านทุกแท็บ (d-m) พร้อมสถานะแท็บเขียว = ส่งการเงินแล้ว และรูปลายเซ็นในไฟล์ แท็บวันที่ซ้ำจะถูกแทนที่")
        mf = st.file_uploader("ไฟล์รายงานเดือน", type=["xlsx"], key="rep_month_up", label_visibility="collapsed")
        if mf is not None:
            try:
                tabs, msig = rc.parse_month(mf.getvalue())
            except Exception as e:
                st.error(f"อ่านไฟล์ไม่ได้: {e}")
                tabs, msig = [], None
            if tabs:
                st.write(f"พบ {len(tabs)} แท็บ: " + ", ".join(_label(t["date"]) + ("✅" if t["sent"] else "")
                                                            for t in sorted(tabs, key=lambda t: t["date"]))
                         + (" · มีรูปลายเซ็น" if msig else " · ไม่พบรูปลายเซ็น"))
                if st.button("นำเข้า", type="primary", key="rep_import"):
                    try:
                        db.put_days(tabs)
                        if msig:
                            db.put_signature(msig)
                        st.session_state.rep_msg = f"นำเข้าแล้ว {len(tabs)} แท็บ"
                        _load(db, force=True)
                        st.rerun()
                    except Exception as e:
                        st.error(f"นำเข้าไม่สำเร็จ: {e}")
    with st.expander("รูปลายเซ็น"):
        if sig:
            st.image(sig, width=260)
        sf = st.file_uploader("เปลี่ยนรูปลายเซ็น (PNG/JPG เฉพาะส่วนลายเซ็น)", type=["png", "jpg", "jpeg"], key="rep_sig_up")
        if sf is not None and st.button("บันทึกรูปลายเซ็น"):
            try:
                db.put_signature(rc.shrink_signature(sf.getvalue()))
                st.session_state.rep_msg = "บันทึกรูปลายเซ็นแล้ว"
                _load(db, force=True)
                st.rerun()
            except Exception as e:
                st.error(str(e))
    if st.button("🔄 โหลดข้อมูลจากชีตใหม่"):
        _load(db, force=True)
        st.rerun()
