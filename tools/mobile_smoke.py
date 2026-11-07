"""Real multi-touch swipe controls and quest map checks in Chromium emulation."""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
BASE_URL = os.environ.get('BASE_URL', 'http://127.0.0.1:3000').rstrip('/')
Path('artifacts').mkdir(exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width, height in [(390, 844), (844, 390), (320, 568)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=True, has_touch=True)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE_URL + '/?debug=1')
        page.wait_for_function('window.__game')
        assert page.locator('#tutorial').count() == 0
        page.locator('#play').click()
        page.wait_for_timeout(300)
        assert page.locator('[data-action=left], [data-action=right]').count() == 0
        for selector in ['#swipe-zone'] + ['[data-action=' + a + ']' for a in ['up', 'down', 'jump', 'attack', 'dash', 'interact']]:
            box = page.locator(selector).bounding_box()
            assert box['x'] >= 0 and box['y'] >= 0 and box['x'] + box['width'] <= width + 1 and box['y'] + box['height'] <= height + 1, (selector, box)
        zone = page.locator('#swipe-zone').bounding_box()
        jump = page.locator('[data-action=jump]').bounding_box()
        def point(box, pointer_id, dx=0):
            return {'x': box['x'] + box['width'] / 2 + dx, 'y': box['y'] + box['height'] / 2, 'id': pointer_id}
        cdp = context.new_cdp_session(page)
        def touches(kind, points):
            cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': points})
        start_x = page.evaluate('__game.player.x')
        touches('touchStart', [point(zone, 1)])
        page.wait_for_timeout(100)
        assert page.evaluate('__game.player.x') == start_x  # touching alone must not move
        touches('touchMove', [point(zone, 1, 45)])
        page.wait_for_timeout(180)
        touches('touchStart', [point(zone, 1, 45), point(jump, 2)])
        page.wait_for_timeout(200)
        assert page.evaluate('__game.player.x') > start_x + 30
        assert page.evaluate('__game.player.y') < 540
        touches('touchEnd', [])
        page.wait_for_timeout(350)
        stopped_x = page.evaluate('__game.player.x')
        page.wait_for_timeout(180)
        assert abs(page.evaluate('__game.player.x') - stopped_x) < 2
        touches('touchStart', [point(zone, 3)])
        touches('touchMove', [point(zone, 3, -45)])
        page.wait_for_timeout(230)
        assert page.evaluate('__game.player.x') < stopped_x - 15
        touches('touchCancel', [])
        page.wait_for_timeout(150)
        cancelled_x = page.evaluate('__game.player.x')
        page.wait_for_timeout(150)
        assert abs(page.evaluate('__game.player.x') - cancelled_x) < 2
        # A swipe can start on the left half of the world as well as in the thumb zone.
        world_box = page.locator('#game').bounding_box()
        world_touch = {'x': world_box['x'] + world_box['width'] * .2, 'y': world_box['y'] + world_box['height'] * .45, 'id': 4}
        touches('touchStart', [world_touch])
        touches('touchMove', [{**world_touch, 'x': world_touch['x'] + 45}])
        page.wait_for_timeout(120)
        assert page.evaluate('__game.player.vx') > 0
        touches('touchEnd', [])
        page.wait_for_timeout(200)
        page.screenshot(path=f'artifacts/mobile-play-{width}.png')
        page.locator('#pause-button').click()
        page.locator('#open-settings').click()
        page.locator('#close-settings').click()
        page.locator('#resume').click()
        # This is the reported point of confusion: R04 must be marked before it is visited.
        page.evaluate("""() => {const g=__game;g.progress.flags=['ability.dash','shortcut.pier_gate','mechanism.pier_lift'];g.loadRoom('V02');}""")
        page.locator('#map-button').click()
        page.wait_for_function("document.getElementById('world-map').dataset.questRoom==='R04'")
        assert 'Дом без лестниц' in page.locator('#map-goal-title').inner_text()
        assert 'Городские ворота' in page.locator('#map-goal-route').inner_text()
        assert page.locator('#world-map').get_attribute('data-next-room') == 'V04'
        assert not page.evaluate("__game.progress.visited.includes('R04')")
        page.screenshot(path=f'artifacts/quest-map-{width}.png')
        page.locator('#zoom-in').click()
        page.locator('#zoom-out').click()
        page.locator('#map-center').click()
        page.evaluate("__game.flag('ability.wall_grip')")
        page.wait_for_function("document.getElementById('world-map').dataset.questRoom==='R07'")
        page.locator('#close-map').click()
        if width == 390:
            page.set_viewport_size({'width': 844, 'height': 390})
            page.wait_for_timeout(250)
            assert page.evaluate('__game.viewport.h') == 540
            assert page.evaluate('__game.player.x>=__game.camera.x && __game.player.x<__game.camera.x+__game.viewport.w')
        assert not errors, errors
        results.append({'viewport': [width, height], 'swipe': 'passed', 'multitouchJump': 'passed', 'releaseCancel': 'passed', 'questR04': 'passed', 'markerUpdate': 'passed', 'pageErrors': errors})
        print(json.dumps(results[-1], ensure_ascii=False), flush=True)
        context.close()
    browser.close()
Path('artifacts/mobile-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
