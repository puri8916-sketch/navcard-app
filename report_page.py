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
        st.session_state.rep_days, st.session_state.rep_signer, st.session_state.rep_pngs = db.load()
    return st.session_state.rep_days, st.session_state.rep_signer, st.session_state.rep_pngs


def _sref(signer):
    return {"id": signer.get("id", ""), "rank": signer["rank"], "name": signer["name"]}


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
        days, signer, pngs = _load(db)
        sig = signer.get("png")
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
            # which tab days does this file cover? the file's own range, widened back to the day after the
            # last saved tab when days were skipped (weekend / days not closed)
            last = max((d for d in days if d < d0), default=None)
            start0 = date.fromisoformat(d0)
            if last and 1 < (start0 - date.fromisoformat(last)).days <= 10:
                start0 = date.fromisoformat(last) + timedelta(days=1)
            k = f"{up.name}_{up.size}"
            c1, c2 = st.columns(2)
            ds = c1.date_input("แท็บตั้งแต่วันที่", value=start0, key=f"rep_ds_{k}", format="DD/MM/YYYY")
            de = c2.date_input("ถึงวันที่", value=date.fromisoformat(d1), key=f"rep_de_{k}", format="DD/MM/YYYY")
            if de < ds:
                ds, de = de, ds
            span = [(ds + timedelta(days=i)).isoformat() for i in range((de - ds).days + 1)]
            n = len(cards)
            if len(span) == 1:
                assign = [span[0]] * n
            else:
                st.info(f"แยกการ์ดเป็น {len(span)} แท็บ ({_label(span[0])} ถึง {_label(span[-1])}) — "
                        "เลือกลำแรกของแต่ละวัน ระบบเลือกไว้ให้ก่อน (เดาจากวันที่เรือเคลื่อนไหวล่าสุด) ตรวจ/แก้ได้")
                sugg = rc.suggest_days(span[0], span[-1], cards)
                opts = list(range(n + 1))
                fmt = lambda i: "(ไม่มีการ์ดวันนี้)" if i == n else f"{i + 1}. {cards[i]['no']}  {cards[i]['ship'].strip()}  ·  {_moves(cards[i])}"
                starts = [0]
                st.caption(f"แท็บ {_label(span[0])} เริ่มที่ลำแรกของไฟล์: {fmt(0)}")
                for jj, d in enumerate(span[1:], 1):
                    dflt = next((i for i, x in enumerate(sugg) if x >= d), n)
                    dflt = max(dflt, starts[-1])
                    starts.append(st.selectbox(f"แท็บ {_label(d)} เริ่มที่ลำ", opts, index=dflt, format_func=fmt,
                                               key=f"rep_st_{k}_{d}"))
                if any(b < a for a, b in zip(starts, starts[1:])):
                    st.error("ลำดับไม่ถูกต้อง: ลำแรกของวันหลังต้องอยู่ถัดจากลำแรกของวันก่อน")
                    return
                assign = []
                for jj, d in enumerate(span):
                    end = starts[jj + 1] if jj + 1 < len(starts) else n
                    assign += [d] * (end - starts[jj])

            groups = {}
            for c, d in zip(cards, assign):
                groups.setdefault(d, []).append(c)
            known = {c["no"]: iso for iso, t in days.items() for c in t.get("cards", [])}
            for d, cs in sorted(groups.items()):
                nn, en, sa, sh = rc.counts(cs)
                warn = ""
                if d in days:
                    warn = f" · ⚠ แท็บนี้มีอยู่แล้ว ({len(days[d].get('cards', []))} การ์ด) จะถูกแทนที่"
                st.markdown(f"**แท็บ {_label(d)}** — {len(cs)} การ์ด: {cs[0]['no']} ({cs[0]['ship'].strip()}) "
                            f"ถึง {cs[-1]['no']} ({cs[-1]['ship'].strip()}) · {nn} ลำ เข้า {en} ออก {sa} เลื่อน {sh}{warn}")
            empty = [d for d in span if d not in groups]
            if empty:
                st.caption("ไม่มีการ์ด (ไม่สร้างแท็บ): " + ", ".join(_label(d) for d in empty))
            dup = sorted({f"{c['no']} (อยู่ในแท็บ {_label(known[c['no']])})" for d, cs in groups.items() for c in cs
                          if c["no"] in known and known[c["no"]] != d})
            if dup:
                st.warning("การ์ดเหล่านี้มีอยู่แล้วในแท็บอื่น: " + ", ".join(dup))
            if st.button("บันทึกลงรายงาน", type="primary"):
                try:
                    db.put_days([{"date": d, "sent": False, "cards": cs, "signer": _sref(signer)}
                                 for d, cs in sorted(groups.items())])
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
        nsent = sum(r["ส่งการเงินแล้ว (แท็บเขียว)"] for r in rows)
        with st.expander(f"รายการแท็บ ({len(rows)} แท็บ · ส่งการเงินแล้ว {nsent} · ยังไม่ส่ง {len(rows) - nsent})"):
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
            st.warning("ยังไม่มีรูปลายเซ็น — ไฟล์จะมีชื่อผู้เซ็นแต่ไม่มีลายเซ็น (เพิ่มได้ในข้อ 3 ผู้เซ็น)")
        st.download_button(f"⬇️ ดาวน์โหลด {fname}", data=rc.build_month([days[d] for d in mdays], sig, signer, pngs),
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

    # ------------------------------------------------------------ 3) signer + one-time import
    st.subheader("3. ผู้เซ็น / นำเข้าไฟล์เดือนเดิม")
    with st.expander(f"ผู้เซ็นท้ายรายงาน: {signer['rank']} ({signer['name']})" + ("" if sig else " · ยังไม่มีรูปลายเซ็น")):
        c1, c2 = st.columns([1, 3])
        if sig:
            c1.image(sig, width=200)
        else:
            c1.caption("ยังไม่มีรูปลายเซ็น")
        rank = c2.text_input("คำนำหน้า (ยศ)", value=signer["rank"], key="rep_rank")
        name = c2.text_input("ชื่อ-สกุล (ในวงเล็บ)", value=signer["name"], key="rep_name")
        c2.caption("ตำแหน่ง: หัวหน้าสำนักงานนำร่องสงขลา (คงที่)")
        sf = st.file_uploader("รูปลายเซ็นใหม่ (PNG/JPG เฉพาะส่วนลายเซ็น) — เว้นว่างถ้าใช้รูปเดิม",
                              type=["png", "jpg", "jpeg"], key="rep_sig_up")
        unsent = sorted(d for d, t in days.items() if not t.get("sent"))
        also = st.checkbox(f"ใช้กับแท็บที่ยังไม่ส่งการเงินด้วย ({', '.join(_label(d) for d in unsent) or 'ไม่มี'})",
                           value=False, key="rep_sig_also", disabled=not unsent)
        st.caption("แท็บที่บันทึกไปแล้วจะเก็บผู้เซ็นของแท็บนั้นไว้ เปลี่ยนผู้เซ็นแล้วมีผลกับแท็บที่บันทึกต่อจากนี้")
        if st.button("บันทึกผู้เซ็น", type="primary", key="rep_sig_save"):
            try:
                png = rc.shrink_signature(sf.getvalue()) if sf is not None else None
                sid = db.put_signer(rank.strip(), name.strip(), png, signer.get("id", ""))
                if also and unsent:
                    ref = {"id": sid, "rank": rank.strip(), "name": name.strip()}
                    db.put_days([dict(days[d], signer=ref) for d in unsent])
                st.session_state.rep_msg = "บันทึกผู้เซ็นแล้ว"
                _load(db, force=True)
                st.rerun()
            except Exception as e:
                st.error(str(e))
    with st.expander("นำเข้าไฟล์รายงานเดือนเดิม (เช่น ต.ค.69.xlsx) — ใช้ครั้งแรก"):
        st.caption("อ่านทุกแท็บ (d-m) พร้อมสถานะแท็บเขียว = ส่งการเงินแล้ว, ผู้เซ็นของแต่ละแท็บ และรูปลายเซ็นในไฟล์ "
                   "แท็บวันที่ซ้ำจะถูกแทนที่")
        mf = st.file_uploader("ไฟล์รายงานเดือน", type=["xlsx"], key="rep_month_up", label_visibility="collapsed")
        if mf is not None:
            try:
                tabs, msig = rc.parse_month(mf.getvalue())
            except Exception as e:
                st.error(f"อ่านไฟล์ไม่ได้: {e}")
                tabs, msig = [], None
            if tabs:
                last = (sorted(tabs, key=lambda t: t["date"])[-1].get("signer") or rc.DEFAULT_SIGNER)
                st.write(f"พบ {len(tabs)} แท็บ: " + ", ".join(_label(t["date"]) + ("✅" if t["sent"] else "")
                                                            for t in sorted(tabs, key=lambda t: t["date"]))
                         + f" · ผู้เซ็น {last['rank']} ({last['name']})"
                         + (" · มีรูปลายเซ็น" if msig else " · ไม่พบรูปลายเซ็น"))
                if st.button("นำเข้า", type="primary", key="rep_import"):
                    try:
                        sid = signer.get("id", "")
                        if msig:
                            sid = db.put_signer(last["rank"], last["name"], msig, sid)
                        for t in tabs:
                            t["signer"] = dict(rc.DEFAULT_SIGNER, **(t.get("signer") or {}), id=sid)
                        db.put_days(tabs)
                        st.session_state.rep_msg = f"นำเข้าแล้ว {len(tabs)} แท็บ"
                        _load(db, force=True)
                        st.rerun()
                    except Exception as e:
                        st.error(f"นำเข้าไม่สำเร็จ: {e}")
    if st.button("🔄 โหลดข้อมูลจากชีตใหม่"):
        _load(db, force=True)
        st.rerun()
