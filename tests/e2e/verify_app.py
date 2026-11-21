import json
import os
import subprocess
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

SCRATCH_DIR = os.environ.get(
    "STUDIA_SHOT_DIR",
    "/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p_devbox/06bdfc46-9ca1-432c-8660-01e361811e13/scratch",
)
os.makedirs(SCRATCH_DIR, exist_ok=True)


def wait_for_server(url, timeout=15):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"Preview server did not start at {url}")


def assert_no_horizontal_overflow(page, label):
    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    assert overflow <= 1, f"[{label}] Horizontal overflow detected: {overflow}px"


def run_tests():
    port = 4179
    base_url = f"http://127.0.0.1:{port}"
    proc = subprocess.Popen(
        ["npx", "vite", "preview", "--host", "127.0.0.1", "--port", str(port), "--strictPort"],
        cwd="/home/antigravity/studia",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        wait_for_server(base_url)

        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path="/usr/bin/google-chrome",
                headless=True,
                args=["--no-sandbox", "--disable-gpu"],
            )

            # 1. Desktop (1280x860) full feature verification
            context = browser.new_context(viewport={"width": 1280, "height": 860})
            page = context.new_page()

            errors = []
            page.on("pageerror", lambda err: errors.append(f"pageerror: {err}"))
            page.on(
                "console",
                lambda msg: errors.append(f"console.error: {msg.text}")
                if msg.type == "error" and "accounts.google.com" not in msg.text
                else None,
            )

            # Block external GIS / font network waits to keep tests deterministic
            page.route("https://accounts.google.com/**", lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))

            # Mock Gemini API response and verify gemini-4-neon + thinkingLevel request
            gemini_requests = []

            def handle_gemini(route):
                gemini_requests.append(
                    {
                        "url": route.request.url,
                        "body": route.request.post_data_json,
                    }
                )
                payload = {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "text": (
                                            "Was ist ein elektrischer Widerstand? :: Maß für die Hemmung des elektrischen Stroms (R = U / I).\n"
                                            "Einheit der elektrischen Ladung? :: Coulomb (1 C = 1 A·s)."
                                        )
                                    }
                                ]
                            }
                        }
                    ]
                }
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(payload),
                )

            page.route("https://generativelanguage.googleapis.com/**", handle_gemini)

            page.goto(base_url, wait_until="domcontentloaded")
            page.wait_for_selector(".today-hero")
            assert_no_horizontal_overflow(page, "Desktop Today")

            # Test collapsible left sidebar on Desktop (click toggle button -> 72px rail, persists across reload)
            rail = page.locator(".sidebar-rail")
            expanded_box = rail.bounding_box()
            assert expanded_box["width"] >= 230, f"Expected expanded sidebar >= 230px, got {expanded_box['width']}"
            page.click('.brand-toggle-btn[data-action="toggle-sidebar"]')
            assert "collapsed" in (rail.get_attribute("class") or ""), "Sidebar should have collapsed class"
            page.wait_for_timeout(240)
            collapsed_box = rail.bounding_box()
            assert collapsed_box["width"] <= 80, f"Expected collapsed sidebar <= 80px, got {collapsed_box['width']}"
            assert_no_horizontal_overflow(page, "Desktop Sidebar Collapsed")
            page.screenshot(path=os.path.join(SCRATCH_DIR, "v4_desktop_sidebar_collapsed.png"), full_page=True)

            # Verify collapsed state persists after reload, then re-expand by clicking brand-trigger
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector(".sidebar-rail.collapsed")
            page.click('.brand-trigger[data-action="toggle-sidebar"]')
            assert "collapsed" not in (page.locator(".sidebar-rail").get_attribute("class") or ""), "Sidebar should re-expand via brand click"

            # Today view checks: semester countdown, due cards CTA, weekly goal
            body_text = page.inner_text("body")
            assert "Heute fällig:" in body_text, "Missing Today due-cards CTA"
            assert "vorlesungswochen" in body_text.lower() or "weihnachtsferien" in body_text.lower(), "Missing semester countdown"
            assert "wochenziel" in body_text.lower(), "Missing weekly goal stat"
            page.screenshot(path=os.path.join(SCRATCH_DIR, "v3_desktop_today.png"), full_page=True)

            # Timetable view: semester strip
            page.click('.rail-nav-btn[data-nav="timetable"]')
            page.wait_for_selector(".week-grid")
            tt_text = page.inner_text("body")
            assert "22.01.2027" in tt_text, "Missing HSD WS 26/27 lecturesEnd in timetable banner"
            assert_no_horizontal_overflow(page, "Desktop Timetable")

            # Calendar view: check Weihnachtsferien (2026-12-25) hides lectures
            page.click('.rail-nav-btn[data-nav="calendar"]')
            page.wait_for_selector(".cal-grid")
            # Navigate to December 2026
            for _ in range(12):
                if "Dezember 2026" in page.inner_text(".cal-month-title"):
                    break
                page.click('[data-action="cal-next-month"]')
            assert "Dezember 2026" in page.inner_text(".cal-month-title")
            dec25 = page.locator('.cal-cell[data-date="2026-12-25"]')
            assert "is-holiday" in (dec25.get_attribute("class") or ""), "Dec 25 should have is-holiday class"
            dec25.click()
            cal_agenda = page.inner_text('[aria-label="Tagesagenda"]')
            assert "Weihnachtsferien" in cal_agenda, "Holiday notice missing on Dec 25"
            assert "Grundlagen der Elektrotechnik I" not in cal_agenda, "Lecture should be hidden on Christmas holiday"

            # Modules view: 5-box Leitner + Gemini 4 Neon KI-Tutor
            page.click('.rail-nav-btn[data-nav="toolkit"]')
            page.wait_for_selector(".module-pill-grid")
            assert "Heute fällig (3)" in page.inner_text("body"), "GET I should start with 3 due cards"
            page.click('[data-action="card-rate"][data-result="good"]')
            assert "Heute fällig (2)" in page.inner_text("body"), "Due count should decrement to 2 after good rating"
            assert "F2: 1" in page.inner_text(".leitner-strip"), "Card should advance to Leitner box F2"

            # Verify Gemini 4 Neon is default and Gemini Pro App handoff button exists even before key
            assert page.locator('[data-action="change-gemini-model"]').input_value() == "gemini-4-neon"
            assert "In Gemini Pro (Neon) öffnen" in page.inner_text("body")
            page.select_option('[data-action="change-gemini-thinking"]', "high")

            # Test Gemini 4 Neon API key setup + card generation + accept
            page.fill('[data-form="save-gemini-key"] input[name="apiKey"]', "AIzaSyTestLocalKey123456789")
            page.click('[data-form="save-gemini-key"] button[type="submit"]')
            page.wait_for_selector('[data-form="tutor-run"] button[type="submit"]')
            page.fill("#tutor-prompt", "Grundlagen Gleichstrom")
            page.click('[data-form="tutor-run"] button[type="submit"]')
            page.wait_for_selector('[data-action="tutor-accept-cards"]')
            assert len(gemini_requests) == 1 and "models/gemini-4-neon:generateContent" in gemini_requests[0]["url"]
            assert gemini_requests[0]["body"]["generationConfig"]["thinkingConfig"]["thinkingLevel"] == "high"
            page.screenshot(path=os.path.join(SCRATCH_DIR, "v3_desktop_modules_tutor.png"), full_page=True)
            page.click('[data-action="tutor-accept-cards"]')
            assert "Heute fällig (4)" in page.inner_text("body"), "2 generated cards should be added to GET I due queue"

            # Abgaben view: reminders banner & holiday-aware schedule
            page.click('[data-action="set-toolkit-sub"][data-value="tasks"]')
            page.wait_for_selector(".recurring-card")
            tasks_text = page.inner_text("body")
            assert "Native Handy-Erinnerungen" in tasks_text, "Missing recurring reminder banner"
            assert ".ics Erinnerungen" in tasks_text or "Alle in Google" in tasks_text

            # Bib-Fokus view: Study stats, streak, weekly goal, 7-day bars
            page.click('[data-action="set-toolkit-sub"][data-value="focus"]')
            page.wait_for_selector(".week-bars")
            focus_text = page.inner_text("body")
            assert "Wochenziel" in focus_text and "Streak" in focus_text and "Balance-Tipp" in focus_text
            page.click('[data-action="set-weekly-goal"][data-minutes="900"]')
            assert "Wochenziel (15 Std.)" in page.inner_text("body"), "Weekly goal should update to 15h"
            page.click('[data-action="log-manual-study"][data-minutes="15"]')
            page.screenshot(path=os.path.join(SCRATCH_DIR, "v3_desktop_focus_stats.png"), full_page=True)

            # Settings modal: Dauer-Sync Bridge, Apps-Script copy, Gemini 4 Neon, HSD semester config
            page.click('.rail-footer [data-action="open-modal"][data-modal="settings"]')
            page.wait_for_selector(".modal-sheet")
            settings_text = page.inner_text(".modal-sheet")
            assert "Dauer-Sync (Ohne Neuanmeldung)" in settings_text, "Missing Dauer-Sync section in settings"
            assert "Apps-Script-Code kopieren" in settings_text, "Missing Apps Script copy button"
            assert "Gemini 4 Neon" in settings_text, "Missing Gemini 4 Neon section in settings"
            assert "HSD-Semesterzeiten" in settings_text, "Missing Semester config section"
            page.screenshot(path=os.path.join(SCRATCH_DIR, "v4_desktop_settings_bridge.png"), full_page=True)
            page.click('[data-action="close-modal"]')

            # Personal Dauer-Sync Bridge 1-Tap Magic Pairing Link (#bridge=...) on a fresh 2nd device (zero OAuth!)
            import base64
            bridge_url = "https://script.google.com/macros/s/test-bridge/exec"
            bridge_secret = "std_TestBridgeToken12345678"
            bridge_calls = []

            sync_ctx = browser.new_context(viewport={"width": 1280, "height": 860})
            sync_page = sync_ctx.new_page()
            sync_errors = []
            sync_page.on("pageerror", lambda err: sync_errors.append(f"pageerror: {err}"))
            sync_page.on(
                "console",
                lambda msg: sync_errors.append(f"console.error: {msg.text}")
                if msg.type == "error" and "accounts.google.com" not in msg.text
                else None,
            )
            sync_page.route("https://accounts.google.com/**", lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))

            def handle_bridge(route):
                raw_body = route.request.post_data or "{}"
                req_json = json.loads(raw_body)
                bridge_calls.append(req_json)
                assert req_json.get("secret") == bridge_secret, "Bridge secret mismatch"
                remote_state = req_json.get("state") or {}
                if req_json.get("action") == "sync":
                    synced_tasks = list(remote_state.get("tasks") or [])
                    synced_tasks.insert(
                        0,
                        {
                            "id": "tk_from_pixel8",
                            "title": "Abgabe synchronisiert vom Pixel 8",
                            "course": "GET I",
                            "due": "2026-12-04",
                            "dueTime": "12:00",
                            "done": False,
                            "recurrence": "once",
                        },
                    )
                    remote_state["tasks"] = synced_tasks
                    remote_state["updatedAt"] = "2099-01-01T12:00:00.000Z"
                    resp_obj = {
                        "ok": True,
                        "email": "student@hs-duesseldorf.de",
                        "stateAction": "downloaded",
                        "remoteState": remote_state,
                        "calendars": [
                            {
                                "id": "student@hs-duesseldorf.de",
                                "summary": "Uni Hauptkalender",
                                "primary": True,
                                "backgroundColor": "#1a73e8",
                                "accessRole": "owner",
                            }
                        ],
                        "events": [
                            {
                                "id": "gcal_bridge_exam_1",
                                "googleEventId": "bridge_exam_1",
                                "calendarId": "student@hs-duesseldorf.de",
                                "title": "Klausur Höhere Mathematik I (Bridge)",
                                "date": "2027-02-05",
                                "start": "09:00",
                                "end": "11:00",
                                "location": "Geb. 5 · Audimax",
                                "notes": "Formelsammlung erlaubt",
                                "htmlLink": "",
                                "source": "google",
                                "calendarName": "Google · Uni Hauptkalender",
                                "color": "google",
                            }
                        ],
                    }
                    route.fulfill(status=200, content_type="text/plain;charset=utf-8", body=json.dumps(resp_obj))
                else:
                    route.fulfill(status=200, content_type="text/plain;charset=utf-8", body=json.dumps({"ok": True}))

            sync_page.route("https://script.google.com/macros/s/test-bridge/exec", handle_bridge)
            pair_payload = json.dumps({"u": bridge_url, "s": bridge_secret}).encode("utf-8")
            pair_token = base64.urlsafe_b64encode(pair_payload).decode("ascii").rstrip("=")
            sync_page.goto(f"{base_url}/#bridge={pair_token}", wait_until="domcontentloaded")
            sync_page.wait_for_selector(".today-hero")
            sync_page.wait_for_timeout(450)

            assert "#bridge=" not in sync_page.url, "Pairing hash should be stripped immediately from URL"
            assert len(bridge_calls) >= 1 and bridge_calls[0]["action"] == "sync", "Pairing link should auto-sync immediately"
            assert "Dauer-Sync aktiv" in sync_page.inner_text(".sync-status-btn"), "Sidebar should show Dauer-Sync aktiv"
            assert "Abgabe synchronisiert vom Pixel 8" in sync_page.inner_text("body"), "Remote synced task should appear on Today"

            # Verify remote Google Calendar Klausur appeared in Exams tab without OAuth login!
            sync_page.click('.rail-nav-btn[data-nav="exams"]')
            sync_page.wait_for_selector(".exam-grid")
            assert "Höhere Mathematik I (Bridge)" in sync_page.inner_text("body"), "Remote Google Calendar exam should appear via Bridge"

            # Verify Settings modal now shows paired Active state & Geräte-Link button
            sync_page.click('.rail-footer [data-action="open-modal"][data-modal="settings"]')
            sync_page.wait_for_selector('[data-action="bridge-copy-pair-link"]')
            assert "Geräte-Link für Handy & iPad kopieren" in sync_page.inner_text(".modal-sheet")
            sync_page.screenshot(path=os.path.join(SCRATCH_DIR, "v4_desktop_settings_bridge_active.png"), full_page=True)
            assert len(sync_errors) == 0, f"Bridge Sync device errors: {sync_errors}"
            sync_ctx.close()

            # Web Share Target test via URL query params
            page.goto(
                f"{base_url}/?share_title=Zweierkomplement&share_text=Zweierkomplement%20::%20Bits%20invertieren%20und%201%20addieren",
                wait_until="domcontentloaded",
            )
            page.wait_for_selector('[data-modal-submit="share-import"]')
            # Verify auto-matched module is mod_it and target is flashcards
            selected_mod = page.locator("#sh-mod").input_value()
            selected_target = page.locator("#sh-target").input_value()
            assert selected_mod == "mod_it", f"Expected auto-matched mod_it, got {selected_mod}"
            assert selected_target == "flashcards", f"Expected flashcards target, got {selected_target}"
            page.click('button[form="studia-modal-form"]')
            page.wait_for_selector(".module-pill-grid")
            assert "share_text" not in page.url, "Share query params should be cleaned from URL"
            assert "Zweierkomplement" in page.inner_text("body"), "Shared card should appear in module"

            assert len(errors) == 0, f"Desktop console/page errors: {errors}"
            context.close()

            # 2. Pixel 8 (412x915) responsive & overflow verification (light & dark)
            p8_ctx = browser.new_context(viewport={"width": 412, "height": 915})
            p8 = p8_ctx.new_page()
            p8_errors = []
            p8.on("pageerror", lambda err: p8_errors.append(str(err)))
            p8.route("https://accounts.google.com/**", lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))

            p8.goto(base_url, wait_until="domcontentloaded")
            p8.wait_for_selector(".mobile-bottom-nav")
            assert_no_horizontal_overflow(p8, "Pixel 8 Today")
            p8.screenshot(path=os.path.join(SCRATCH_DIR, "v3_pixel8_today.png"), full_page=True)

            p8.click('.m-nav-btn[data-nav="toolkit"]')
            p8.wait_for_selector(".leitner-strip")
            assert_no_horizontal_overflow(p8, "Pixel 8 Modules")
            p8.screenshot(path=os.path.join(SCRATCH_DIR, "v3_pixel8_modules.png"), full_page=True)

            p8.click('[data-action="set-toolkit-sub"][data-value="focus"]')
            p8.wait_for_selector(".week-bars")
            assert_no_horizontal_overflow(p8, "Pixel 8 Focus Stats")

            p8.click('.mobile-topbar [data-action="toggle-theme"]')
            p8.click('.m-nav-btn[data-nav="timetable"]')
            p8.wait_for_selector(".day-pills")
            assert_no_horizontal_overflow(p8, "Pixel 8 Timetable Dark")
            p8.screenshot(path=os.path.join(SCRATCH_DIR, "v3_pixel8_timetable_dark.png"), full_page=True)

            assert len(p8_errors) == 0, f"Pixel 8 errors: {p8_errors}"
            p8_ctx.close()

            # 3. iPad Portrait (768x1024) verification + collapsible sidebar
            ipad_ctx = browser.new_context(viewport={"width": 768, "height": 1024})
            ipad = ipad_ctx.new_page()
            ipad_errors = []
            ipad.on("pageerror", lambda err: ipad_errors.append(str(err)))
            ipad.route("https://accounts.google.com/**", lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))

            ipad.goto(base_url, wait_until="domcontentloaded")
            ipad.wait_for_selector(".sidebar-rail")
            assert_no_horizontal_overflow(ipad, "iPad Today")
            ipad.click('.brand-toggle-btn[data-action="toggle-sidebar"]')
            ipad.wait_for_timeout(240)
            assert ipad.locator(".sidebar-rail.collapsed").bounding_box()["width"] <= 80
            ipad.click('.rail-nav-btn[data-nav="timetable"]')
            ipad.wait_for_selector(".week-grid")
            assert_no_horizontal_overflow(ipad, "iPad Timetable Collapsed Sidebar")
            ipad.screenshot(path=os.path.join(SCRATCH_DIR, "v4_ipad_sidebar_collapsed.png"), full_page=True)
            assert len(ipad_errors) == 0, f"iPad errors: {ipad_errors}"
            ipad_ctx.close()

            browser.close()
            print("ALL PLAYWRIGHT E2E CHECKS PASSED (Desktop, Pixel 8, iPad, Sidebar Collapse, Dauer-Sync Bridge) — 0 errors, 0 overflow!")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    run_tests()
