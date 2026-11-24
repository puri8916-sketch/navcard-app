# navcard-app — notes for Claude (handoff)

Songkhla pilot web app "SKP·Port Premium" (Streamlit Cloud, deploys from `main`). Owner works in Thai; replies in Thai, dense (tables/bullets), big readable fonts in UIs.

## Working rules (agreed with the owner)
- Commit every change straight to `main` and push; end commit messages with the attribution lines the session gives.
- Test every change with Playwright before committing (mock the Apps Script API at `https://mock.test/**`, see "Testing"); find and fix bugs proactively — the owner does not want to be the one who finds them.
- Ask before ambiguous or behaviour-changing work (offer 2–4 ranked options); small cosmetic edits: just do them.
- Use installed skills (superpowers) only where worth the tokens: hard/multi-device bugs, big features. Not for small edits.
- Never put secrets (sheet KEYS, passwords) in the repo. `apps_script/Navcard.gs` keeps placeholder KEYS; the owner's copy has real ones.
- No paid AI/OCR services (owner declined image recognition that costs money).

## Files / menus
| Menu (app.py `_PAGES`) | File | Notes |
|---|---|---|
| จัดตารางเรือ | `schedule.html` (tabs: แก้ไข = LINE board, จัดตาราง = print grid, ทะเบียนเรือ, ผก.&เวร) | huge single file; embedded via `components.html` |
| สมุดบันทึกเรือ | `pilot_log.html` + `sync_client.js` | SyncStore collections: calls, vessels, calcShips, prefs |
| ปิดการ์ด | `app.py` (+ `nav_core.py`, `report_core.py`, `report_page.py`) | merged card PDF, monthly report, e-mail copy box |
| แจ้งเรือขาดย้ายท่า | `schedule.html` notice mode | |
| แจ้งเรืออย. | `pilot_log.html` with `window.__ONLY__='ay'` | tick legs → LINE text |
| Server | `apps_script/Navcard.gs` (one script, one Google Sheet "ระบบจัดตารางเรือ") | schedule API (token+action) + sync API (key+ops) |

## Behaviour decided with the owner (keep)
- Schedule day D = D 17:00 → D+1 16:59 (cutoff 17:00). Separator row when consecutive ships are ≥ 1 h 30 min apart (1 h: no separator); none between ships from 20:00 to midnight. Same time → berth order `BERTH_ORDER`.
- Auto placement (แก้ไข + จัดตาราง): a ship whose time is typed/changed moves to its place (time → berth) when you leave its row; berth edit re-orders only among same-time ships; Drf edits never move. Rows moved by hand are pinned 📌 (tap to unpin). Right-click จัดอัตโนมัติ re-arranges all.
- แก้ไข → สมุด: ships taken off the board are offered for the log when "คัดลอกส่งLINE" is pressed. The board's `sent` snapshot is refreshed on every edit (latest Drf/time kept) and late (พ) ships are tracked from the moment they have name + time. Out leg with a different agent than the open inbound record → pre-ticked "แยกใบแจ้งหนี้" (inbound gets ATD + แยกใบแจ้งหนี้, new out-only record gets inbound ETA + แยกใบแจ้งหนี้).
- A day table on แก้ไข whose ships were all deleted (all cells empty) is removed automatically; ↶ or ＋ เพิ่มตาราง brings it back.
- Sync: the sheet's clock is the version (device clocks differ). Board saves carry `base`; on conflict the server returns its table and the page does a 3-way cell merge (latest editor wins per cell). Log sync: last write to arrive wins, server-stamped.
- Mobile: right-click menus become a bottom toolbar (`body.touch .mbar`).
- ปิดการ์ด: file name/e-mail subject use the closing date range (e.g. `การ์ดประจำวันที่ 21-23 พ.ย. 69 (รวม).pdf`, subject `รายงานการปิดการ์ดนำร่อง วันที่ 21-23 พ.ย. 2569`, To: พี่ปลา การเงินนำร่อง); download + e-mail box stay until the menu changes; single card PDFs can be added to the upload.
- สมุด: SGZ card No. typed on the first ship of a closing sequence (18/1) fills the later ones by their /n; LOA > 173 m → LOA (m) from the ×3.2808 calculator + Remark "เรือยาวเกินกำหนด …" (warn if not in calculator); shifts can be re-ordered (⠿ / ▲▼).
- จัดตาราง toolbar: ปริ้น (dark green), ดาวน์โหลด PDF + นำเข้าตารางPSB (dark red, white text), Email (light blue) copies the e-mail list (⚙ edits it, stored in sync `prefs/mailTo`).

## Pending (owner action)
- Paste the latest `apps_script/Navcard.gs` into the sheet's Apps Script (keep the owner's own `KEYS` / `OLD_LOG_SHEET_ID` lines) → Deploy › Manage deployments › ✏️ › New version. Needed for server-stamped versions, board conflict merge and the fast `boards` poll. The page falls back gracefully with the old script.

## Testing (Playwright, Chromium preinstalled)
- `schedule.html`: `addInitScript(()=>{window.__SCHED__={url:'https://mock.test/x',key:'t'}})`, route `https://mock.test/**` answering `action=init` (`{ships,berths,agents,pilots,duty,fixed,settings,snapshots,boards,layouts}`), `movements`, `saveBoard` (`{updated}` or `{conflict,board}`), `load` (sync docs), POST `ops`.
- `pilot_log.html`: `addInitScript({path:'sync_client.js'})` runs local (no sheet); seed with `SyncStore.put('calls', id, doc)`; `window.__ONLY__='ay'` for แจ้งเรืออย.
- Streamlit: `streamlit run app.py --server.port 8599 --server.headless true` (no `[users]` secret = no login); stop with `pgrep -f "streamlit[ ]run" | xargs -r kill` (a plain `pkill -f` pattern kills the shell).
- Sample inputs the owner shared earlier: NavigationCard.zip (blank sample cards, no card numbers) + ReportCardIsClosedDaily1.xlsx.
