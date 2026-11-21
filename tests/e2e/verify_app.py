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

            # Mock Gemini API response for KI-Tutor E2E test
            def handle_gemini(route):
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

            # Modules view: 5-box Leitner + Gemini KI-Tutor
            page.click('.rail-nav-btn[data-nav="toolkit"]')
            page.wait_for_selector(".module-pill-grid")
            assert "Heute fällig (3)" in page.inner_text("body"), "GET I should start with 3 due cards"
            page.click('[data-action="card-rate"][data-result="good"]')
            assert "Heute fällig (2)" in page.inner_text("body"), "Due count should decrement to 2 after good rating"
            assert "F2: 1" in page.inner_text(".leitner-strip"), "Card should advance to Leitner box F2"

            # Test Gemini KI-Tutor inline key setup + card generation + accept
            page.fill('[data-form="save-gemini-key"] input[name="apiKey"]', "AIzaSyTestLocalKey123456789")
            page.click('[data-form="save-gemini-key"] button[type="submit"]')
            page.wait_for_selector('[data-form="tutor-run"]')
            page.fill("#tutor-prompt", "Grundlagen Gleichstrom")
            page.click('[data-form="tutor-run"] button[type="submit"]')
            page.wait_for_selector('[data-action="tutor-accept-cards"]')
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

            # Settings modal: Drive sync, Remember login, Gemini Tutor, HSD semester config
            page.click('.rail-footer [data-action="open-modal"][data-modal="settings"]')
            page.wait_for_selector(".modal-sheet")
            settings_text = page.inner_text(".modal-sheet")
            assert "Google Drive App-Ordner" in settings_text, "Missing Drive sync option in settings"
            assert "Anmeldung merken" in settings_text, "Missing remember login option in settings"
            assert "KI-Tutor (Gemini API" in settings_text, "Missing Gemini settings section"
            assert "HSD-Semesterzeiten" in settings_text, "Missing Semester config section"
            page.screenshot(path=os.path.join(SCRATCH_DIR, "v3_desktop_settings.png"), full_page=True)
            page.click('[data-action="close-modal"]')

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

            # 3. iPad Portrait (768x1024) verification
            ipad_ctx = browser.new_context(viewport={"width": 768, "height": 1024})
            ipad = ipad_ctx.new_page()
            ipad_errors = []
            ipad.on("pageerror", lambda err: ipad_errors.append(str(err)))
            ipad.route("https://accounts.google.com/**", lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))

            ipad.goto(base_url, wait_until="domcontentloaded")
            ipad.wait_for_selector(".sidebar-rail")
            assert_no_horizontal_overflow(ipad, "iPad Today")
            ipad.click('.rail-nav-btn[data-nav="timetable"]')
            ipad.wait_for_selector(".week-grid")
            assert_no_horizontal_overflow(ipad, "iPad Timetable")
            assert len(ipad_errors) == 0, f"iPad errors: {ipad_errors}"
            ipad_ctx.close()

            browser.close()
            print("ALL PLAYWRIGHT E2E CHECKS PASSED (Desktop, Pixel 8, iPad) — 0 errors, 0 overflow!")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    run_tests()
