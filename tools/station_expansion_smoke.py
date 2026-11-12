"""Station rendering and real UI interactions with prepared room positions.

The separate command journey verifies continuous traversal without preparation.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL=os.environ.get('BASE_URL','http://127.0.0.1:3000')
ROOT=Path(__file__).resolve().parent.parent
ARTIFACTS=ROOT/'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
IDS=[f'V{i:02d}' for i in range(5,17)]

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':900})
    errors,failed=[],[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
    page.goto(URL+'/?debug=1')
    page.wait_for_function('() => window.__game && document.getElementById("loading").hidden')
    assert '43 / 66' in page.locator('#world-count').inner_text()
    page.click('#guide-play')
    page.wait_for_function('() => __game.mode === "tactical" && __game.guide.forecast')
    for room in IDS:
        page.evaluate('''id => {
          __game.loadRoom(id, id==='V09'?'from.V03':id==='V13'?'from.V14':'start');
          __setMode('tactical');
        }''',room)
        page.wait_for_function('(id) => document.getElementById("room-name").textContent === __game.rooms.get(id).name',arg=room)
        page.wait_for_timeout(100)
        page.screenshot(path=str(ARTIFACTS/f'station-{room}-desktop.png'))

    page.evaluate('''() => {
      __game.loadRoom('V08');
      __game.guide.state.inventory={rations:2,beans:1};
      __game.guide.state.needs.satiety=25;
      __game.guide.state.caffeine=null;
    }''')
    for action in ['food','coffee','donate']:
        page.evaluate('''action => {
          const g=__game,e=g.room.entities.find(e=>e.type==='care'&&e.action===action);
          Object.assign(g.player,{x:e.x-55,y:e.y-44,vx:0,vy:0,grounded:true});
          g.snapCamera();g.nearby=g.findNearby();
          g.guide.commands.enqueue('interact',{targetId:e.id});
        }''',action)
        before=page.evaluate('JSON.stringify(__game.guide.state.inventory)')
        page.wait_for_timeout(200)
        assert before==page.evaluate('JSON.stringify(__game.guide.state.inventory)'), 'forecast spent real stock'
        page.keyboard.press('Space')
        page.wait_for_function('() => __game.mode === "playing" && !__game.guide.commands.items.length')
        page.keyboard.press('Space')
        page.wait_for_function('() => __game.mode === "tactical"')
    assert page.evaluate('__game.guide.state.inventory')=={'rations':0,'beans':0}
    assert page.evaluate('__game.flags.includes("story.station_meal")')
    assert page.evaluate('__game.guide.state.caffeine.state')=='armed'
    assert page.evaluate('__game.guide.state.needs.satiety')>79
    page.screenshot(path=str(ARTIFACTS/'station-canteen-after-care.png'))
    page.evaluate('''() => {
      const g=__game;
      g.guide.commands.enqueue('interact',{targetId:'care.station_basket'});
    }''')
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.guide.commands.result?.status === "failed"')
    assert 'уже передан' in page.evaluate('__game.guide.commands.result.reason')
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode === "tactical"')
    page.evaluate('''() => {
      const g=__game;g.loadRoom('V07');const e=g.room.entities.find(e=>e.type==='npc');
      Object.assign(g.player,{x:e.x-55,y:e.y-44,vx:0,vy:0,grounded:true});
      g.guide.commands.enqueue('interact',{targetId:e.id});
    }''')
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode === "dialogue"')
    assert 'Твой паёк' in page.locator('#dialogue-text').inner_text()
    page.screenshot(path=str(ARTIFACTS/'station-server-after-help.png'))
    page.click('#dialogue-close')
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode === "tactical"')
    page.click('#guide-journal')
    page.click('[data-journal-tab="places"]')
    for room in IDS:
        page.click(f'[data-page-id="{room}"]')
        assert len(page.locator('#journal-text').inner_text())>100
    assert page.locator('[data-page-id="R10"]').count()==0
    page.screenshot(path=str(ARTIFACTS/'station-journal.png'))
    page.click('#journal-close')
    page.click('#map-button')
    page.screenshot(path=str(ARTIFACTS/'station-map.png'))
    page.click('#close-map')
    page.reload()
    page.locator('#guide-play').click()
    page.wait_for_function('() => window.__game?.mode === "tactical"')
    assert page.evaluate('__game.flags.includes("story.station_meal")')
    assert page.evaluate('__game.guide.state.inventory')=={'rations':0,'beans':0}
    page.close()
    for width,height,room in [(390,844,'V08'),(844,390,'V10'),(320,568,'V13')]:
        mobile=browser.new_page(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
        mobile.on('pageerror',lambda e:errors.append(str(e)))
        mobile.goto(URL+'/?debug=1')
        mobile.locator('#guide-play').tap()
        mobile.wait_for_function('() => window.__game?.mode === "tactical" && __game.guide.forecast')
        mobile.evaluate('''id=>{__game.loadRoom(id);__setMode('tactical');}''',room)
        mobile.locator('#guide-journal').tap()
        mobile.locator('[data-journal-tab="places"]').tap()
        mobile.locator(f'[data-page-id="{room}"]').tap()
        assert len(mobile.locator('#journal-text').inner_text())>100
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
        mobile.screenshot(path=str(ARTIFACTS/f'station-{room}-touch-{width}.png'))
        mobile.close()
    assert not errors and not failed,(errors,failed)
    browser.close()
(ARTIFACTS/'station-browser-results.json').write_text(json.dumps({
    'rooms':IDS,'physicalCare':'passed','oracleInventoryIsolation':'passed',
    'aidDialogue':'passed','reload':'passed','touch':['390x844','844x390','320x568'],
    'preparedPositions':True,'pageErrors':errors,'failedRequests':failed,
},ensure_ascii=False,indent=2)+'\n')
print('STATION EXPANSION DESKTOP / TOUCH PASS')
