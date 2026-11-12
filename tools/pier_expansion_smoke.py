"""Prepared room fixtures for rendering, new dialogue and journal on desktop/touch.

This is not a traversal test; test:guide-expanded performs the continuous route.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get('BASE_URL', 'http://127.0.0.1:3000')
ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
NEW_IDS = [f'P{i}' for i in range(10, 19)]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors, failed = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('response', lambda r: failed.append(r.url) if r.status >= 400 else None)
    page.goto(URL + '/?debug=1')
    page.wait_for_function('() => window.__game && document.getElementById("loading").hidden')
    assert f'{page.evaluate("__game.world.rooms.length")} / 66' in page.locator('#world-count').inner_text()
    page.click('#guide-play')
    page.wait_for_function('() => __game.mode === "tactical" && __game.guide.forecast')

    for room in NEW_IDS + ['R08']:
        page.evaluate('''id => {
          const g = __game;
          g.flag('ability.dash'); g.flag('ability.wall_grip');
          g.loadRoom(id, id==='P13' ? 'from.P18' : id==='P18' ? 'from.P08' : 'start');
          __setMode('tactical');
        }''', room)
        page.wait_for_function('(id) => document.getElementById("room-name").textContent === __game.rooms.get(id).name', arg=room)
        page.wait_for_timeout(120)
        page.screenshot(path=str(ARTIFACTS / f'pier-{room}-desktop.png'))
    page.evaluate('''() => {
      const g=__game; g.loadRoom('P10');
      const npc=g.room.entities.find(e=>e.id==='npc.customs_keeper');
      Object.assign(g.player,{x:npc.x-45,y:npc.y-44,grounded:true,vx:0,vy:0});
      g.nearby=g.findNearby();
      g.guide.commands.enqueue('interact',{targetId:npc.id});
    }''')
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode === "dialogue"')
    first = page.locator('#dialogue-text').inner_text()
    assert 'груз' in first.lower()
    page.click('#dialogue-close')
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode === "tactical"')
    page.evaluate('''() => {
      __game.guide.state.needs.energy=5;
      __game.guide.commands.enqueue('interact',{targetId:'npc.customs_keeper'});
    }''')
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode === "dialogue"')
    assert page.locator('#dialogue-text').inner_text() != first
    assert 'одном усилии' in page.locator('#dialogue-text').inner_text()
    page.screenshot(path=str(ARTIFACTS / 'pier-npc-reaction.png'))
    page.click('#dialogue-close')
    page.keyboard.press('Space')
    page.click('#guide-journal')
    page.click('[data-journal-tab="places"]')
    for room in NEW_IDS:
        page.click(f'[data-page-id="{room}"]')
        assert len(page.locator('#journal-text').inner_text()) > 100
    assert page.locator('[data-page-id="V05"]').count() == 0
    page.screenshot(path=str(ARTIFACTS / 'pier-journal.png'))
    page.click('#journal-close')
    page.click('#map-button')
    page.screenshot(path=str(ARTIFACTS / 'pier-map.png'))
    page.click('#close-map')
    assert not errors and not failed, (errors, failed)
    page.close()

    for width, height, room in [(390, 844, 'P15'), (844, 390, 'P13'), (320, 568, 'P17')]:
        mobile = browser.new_page(viewport={'width': width, 'height': height}, is_mobile=True, has_touch=True)
        mobile.on('pageerror', lambda e: errors.append(str(e)))
        mobile.goto(URL + '/?debug=1')
        mobile.locator('#guide-play').tap()
        mobile.wait_for_function('() => window.__game?.mode === "tactical" && __game.guide.forecast')
        mobile.evaluate('''id => {__game.loadRoom(id,id==='P13'?'from.P18':'start');__setMode('tactical');}''', room)
        mobile.locator('#guide-journal').tap()
        mobile.locator('[data-journal-tab="places"]').tap()
        mobile.locator(f'[data-page-id="{room}"]').tap()
        assert len(mobile.locator('#journal-text').inner_text()) > 100
        mobile.screenshot(path=str(ARTIFACTS / f'pier-{room}-touch-{width}.png'))
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
        mobile.close()
    browser.close()
    assert not errors, errors

(ARTIFACTS / 'pier-browser-results.json').write_text(json.dumps({
    'renderedRooms': NEW_IDS + ['R08'], 'npcFirstRepeatFatigue': 'passed',
    'placePages': 9, 'touchSizes': ['390x844', '844x390', '320x568'],
    'preparedPositions': True, 'pageErrors': errors, 'failedRequests': failed,
}, ensure_ascii=False, indent=2) + '\n')
print('PIER EXPANSION DESKTOP / TOUCH PASS')
