"""Real UI proof of autonomous observation, blocked orders, physical learning and rest.

The first room is used unchanged; only the final tired-safehouse case has a
prepared starting position. Test:guide-expanded verifies the complete route.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL=os.environ.get('BASE_URL','http://127.0.0.1:3000')
ARTIFACTS=Path(__file__).resolve().parent.parent/'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL+'/?debug=1')
    page.locator('#guide-play').click()
    page.wait_for_function('() => window.__game?.mode === "tactical" && __game.guide.forecast')
    start=page.evaluate('__game.player.x')
    page.keyboard.press('Space')
    page.wait_for_function('(x) => __game.player.x > x+120',arg=start)
    assert page.evaluate('__game.guide.commands.items.length')==0
    assert 'Герой:' in page.locator('#guide-brain').inner_text()
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode === "tactical"')
    frozen=page.evaluate('JSON.stringify([__game.player,__game.guide.brain.snapshot()])')
    page.wait_for_timeout(250)
    assert frozen==page.evaluate('JSON.stringify([__game.player,__game.guide.brain.snapshot()])')
    page.screenshot(path=str(ARTIFACTS/'hero-brain-observation.png'))
    # The actual first-step collider, with no fixture geometry or teleportation.
    page.evaluate("__game.guide.commands.enqueue('move',{x:1100})")
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.guide.commands.result?.status === "failed"')
    assert page.evaluate('__game.guide.commands.items.length')==0
    assert 'препятствие' in page.evaluate('__game.guide.commands.result.reason')
    assert page.evaluate('__game.player.x+__game.player.w <= 520.01')
    blocked=page.evaluate('__game.player.x')
    page.wait_for_timeout(350)
    assert abs(page.evaluate('__game.player.x')-blocked)<.01
    assert 'Ждёт нового пути' in page.locator('#guide-brain').inner_text()
    page.screenshot(path=str(ARTIFACTS/'hero-brain-blocked-order.png'))
    for count in [1,2]:
        page.keyboard.press('Space')
        page.wait_for_function('() => __game.mode === "tactical"')
        page.locator('#guide-jump-up' if count==2 else '[data-command="jump"]').click()
        page.keyboard.press('Space')
        page.wait_for_function('(n) => __game.player.grounded && __game.guide.state.autonomy.jumpSuccesses >= n',arg=count)
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode === "tactical"')
    # Re-enter the same authored room; acquired physical skill survives entry.
    page.evaluate("__game.loadRoom('P01')")
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.guide.brain.describe().state === "jump"')
    page.screenshot(path=str(ARTIFACTS/'hero-brain-learned-jump.png'))
    page.wait_for_function('() => __game.player.grounded && __game.player.x > 520')
    assert page.evaluate('__game.health')==5
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode === "tactical"')
    page.evaluate('''() => {
      const g=__game;g.loadRoom('P02');const rest=g.room.entities.find(e=>e.type==='rest');
      Object.assign(g.player,{x:rest.x-270,y:rest.y-44,grounded:true,vx:0,vy:0});
      g.snapCamera();g.guide.brain.roomEntered();g.guide.state.needs.energy=10;
    }''')
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode === "safehouse"')
    page.screenshot(path=str(ARTIFACTS/'hero-brain-seeks-rest.png'))
    page.close()
    for width,height in [(390,844),(844,390),(320,568)]:
        m=browser.new_page(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
        m.on('pageerror',lambda e:errors.append(str(e)))
        m.goto(URL+'/?debug=1')
        m.locator('#guide-play').tap()
        m.wait_for_function('() => window.__game?.mode === "tactical" && __game.guide.forecast')
        assert m.locator('#guide-brain').is_visible()
        assert m.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert m.locator('#guide-journal').bounding_box()['y']<height
        m.screenshot(path=str(ARTIFACTS/f'hero-brain-touch-{width}.png'))
        m.close()
    browser.close()
    assert not errors,errors
(ARTIFACTS/'hero-brain-browser-results.json').write_text(json.dumps({
    'autonomousWalk':'passed','blockedOrderCleared':'passed','realJumpLearning':'passed',
    'safehouseSeeking':'passed','tacticalFreeze':'passed','touchSizes':['390x844','844x390','320x568'],
    'pageErrors':errors,
},indent=2)+'\n')
print('HERO BRAIN DESKTOP / TOUCH PASS')
