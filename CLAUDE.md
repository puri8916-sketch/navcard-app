# navcard-app — notes for Claude (handoff)

Songkhla pilot web app "SKP·Port Premium" (Streamlit Cloud, deploys from `main`). Owner works in Thai; replies in Thai, dense (tables/bullets), big readable fonts in UIs.

## Working rules (agreed with the owner)
- Commit every change straight to `main` and push; end commit messages with the attribution lines the session gives.
- Test every change with Playwright before committing (mock the Apps Script API at `https://mock.test/**`, see "Testing"); find and fix bugs proactively — the owner does not want to be the one who finds them.
- Ask before ambiguous or behaviour-changing work (offer 2–4 ranked options); small cosmetic edits: just do them.
- Use installed skills (superpowers) only where worth the tokens: hard/multi-device bugs, big features. Not for small edits.
- Never put secrets (sheet KEYS, passwords) in the repo. `apps_script/Navcard.gs` keeps placeholder KEYS; the owner's copy has real ones.
- No paid AI/OCR services (owner declined image recognition that costs money).

## Autonomous runs (scheduled task, 5×/day 01:44 05:44 09:44 13:44 17:44 Asia/Bangkok)
- Owner wants the weekly usage quota used fully: each run does up to 3 tasks (one PR each); bigger multi-file features/UX redesigns are welcome if split into reviewable PRs.
- Roles per task: Designer (pick the task) → Developer (build + Playwright test) → Reviewer (a separate subagent that did not see the build; can veto).
- Autonomous work NEVER touches `main`: branch `auto/<yyyymmdd>-<slug>`, open a PR with label `auto-patch`. Owner merges = approve, closes = reject, PR comment = change request. (Work the owner asks for in chat still goes straight to `main`.)
- Open PRs = the pending-approval list. Max 8 open `auto-patch` PRs; when full, only handle owner comments on them and rebase onto `main` — no new PR.
- Task source order: owner comments on open auto PRs → `IDEAS.md` ลำดับความสำคัญ → บั๊กที่เจอ → own idea (add it under "ไอเดียที่ AI เสนอ" in the PR).
- Not allowed autonomously: changes to `apps_script/Navcard.gs` that need a redeploy unless the PR body says so in bold at the top; deleting/renaming menus; changing sync data formats without a migration; anything listed under "Behaviour decided with the owner" (propose it as an idea instead).
- PR body in Thai: ทำอะไร / ทำไม / ภาพก่อน-หลัง (screenshots committed under `.auto/screens/`, linked via raw.githubusercontent.com) / ผลทดสอบ / ผลตรวจของ Reviewer / ความเสี่ยง / วิธีย้อนกลับ.
- GitHub GraphQL is blocked in sessions: use `gh api repos/puri8916-sketch/navcard-app/...` (REST) for PRs, labels, comments.

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

## Server script
- The owner's sheet runs the latest `apps_script/Navcard.gs` (deployed; writes are server-stamped `updated == seq`). After changing `Navcard.gs`, send the owner the full file with their own `KEYS` / `OLD_LOG_SHEET_ID` lines (never commit those) and ask for Deploy › Manage deployments › ✏️ › New version.

## Testing (Playwright, Chromium preinstalled)
- `schedule.html`: `addInitScript(()=>{window.__SCHED__={url:'https://mock.test/x',key:'t'}})`, route `https://mock.test/**` answering `action=init` (`{ships,berths,agents,pilots,duty,fixed,settings,snapshots,boards,layouts}`), `movements`, `saveBoard` (`{updated}` or `{conflict,board}`), `load` (sync docs), POST `ops`.
- `pilot_log.html`: `addInitScript({path:'sync_client.js'})` runs local (no sheet); seed with `SyncStore.put('calls', id, doc)`; `window.__ONLY__='ay'` for แจ้งเรืออย.
- Streamlit: `streamlit run app.py --server.port 8599 --server.headless true` (no `[users]` secret = no login); stop with `pgrep -f "streamlit[ ]run" | xargs -r kill` (a plain `pkill -f` pattern kills the shell).
- Sample inputs the owner shared earlier: NavigationCard.zip (blank sample cards, no card numbers) + ReportCardIsClosedDaily1.xlsx.
