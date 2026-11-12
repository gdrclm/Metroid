"""Serve dist under /Metroid/ and exercise the public interface without debug access."""
import functools
import http.server
import json
import os
import tempfile
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
with tempfile.TemporaryDirectory(prefix='metroid-pages-', dir='/tmp') as directory:
    Path(directory, 'Metroid').symlink_to(ROOT / 'dist', target_is_directory=True)
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=directory))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            for mobile in [False, True]:
                page = browser.new_page(viewport={'width': 390 if mobile else 1280, 'height': 844 if mobile else 720}, is_mobile=mobile, has_touch=mobile)
                errors, failed = [], []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('response', lambda r: failed.append(r.url) if r.status >= 400 else None)
                page.goto(f'http://127.0.0.1:{server.server_port}/Metroid/?debug=1')
                page.locator('#play').wait_for(state='visible')
                assert page.locator('meta[name=build-mode]').get_attribute('content') == 'production'
                assert page.evaluate("typeof window.__game === 'undefined'")
                assert page.locator('#debug-editor').count() == 0
                page.locator('#play').click()
                page.wait_for_function("""() => performance.getEntriesByType('resource')
                  .filter(r => r.name.includes('/assets/audio/boss/')).length === 9""")
                page.keyboard.down('d')
                page.wait_for_timeout(400)
                page.keyboard.up('d')
                page.locator('#map-button').click()
                page.locator('#map-center').click()
                assert 'Крановая' in page.locator('#map-goal-title').inner_text()
                page.locator('#close-map').click()
                page.locator('#pause-button').click()
                page.locator('#resume').click()
                page.screenshot(path=f'artifacts/production-{"mobile" if mobile else "desktop"}.png')
                page.locator('#pause-button').click()
                page.locator('#to-title').click()
                page.locator('#guide-play').click()
                page.locator('#guide-dock').wait_for(state='visible')
                page.locator('#guide-journal').click()
                page.locator('#journal-screen').wait_for(state='visible')
                assert 'Голос над водой' in page.locator('#journal-title').inner_text()
                page.locator('[data-journal-tab="help"]').click()
                assert page.locator('#journal-pages button').count()==8
                page.locator('#journal-close').click()
                page.wait_for_function("() => document.getElementById('guide-oracle').textContent.includes('За 6 секунд')")
                page.locator('[data-command="move"]').click()
                assert 'Идти' in page.locator('#guide-queue').inner_text()
                page.keyboard.press('Space')
                page.wait_for_function("() => document.getElementById('app').dataset.mode === 'playing'")
                page.wait_for_timeout(800)
                page.keyboard.press('Space')
                page.wait_for_function("() => document.getElementById('app').dataset.mode === 'tactical'")
                page.screenshot(path=f'artifacts/production-guide-{"mobile" if mobile else "desktop"}.png')
                assert not errors and not failed, (errors, failed)
                page.close()
            browser.close()
        Path('artifacts/production-results.json').write_text(json.dumps({'subpath': '/Metroid/', 'desktop': 'passed', 'mobile': 'passed', 'guide': 'passed', 'oracleWorker': 'passed', 'debug': 'disabled', 'pageErrors': [], 'failedRequests': []}, indent=2)+'\n')
        print('PRODUCTION /Metroid/ DESKTOP AND MOBILE PASS')
    finally:
        server.shutdown()
