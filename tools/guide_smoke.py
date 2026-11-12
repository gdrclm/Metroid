"""Guide Act I integration: real inputs, worker, pause, safehouse and touch layout."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL=os.environ.get('BASE_URL','http://127.0.0.1:3000')
ROOT=Path(__file__).resolve().parent.parent
ARTIFACTS=ROOT/'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':900})
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL+'/?debug=1')
    page.wait_for_function('() => (window.__game && document.getElementById("loading").hidden)')
    page.click('#guide-play')
    page.wait_for_function('() => (__game.mode==="tactical" && __game.guide.forecast)')
    assert page.evaluate('__game.guide.enabled && __game.guide.obedience===1')
    page.keyboard.press('Tab')
    page.wait_for_function('() => __game.mode==="journal"')
    assert page.locator('#journal-title').inner_text()=='Голос над водой'
    frozen=page.evaluate('JSON.stringify([__game.time,__game.player,__game.enemies,__game.projectiles,__game.guide.state.needs])')
    page.wait_for_timeout(250)
    assert frozen==page.evaluate('JSON.stringify([__game.time,__game.player,__game.enemies,__game.projectiles,__game.guide.state.needs])')
    page.click('[data-journal-tab="places"]')
    assert page.locator('#journal-pages button').count()==1
    assert 'Тихая пристань' in page.locator('#journal-pages').inner_text()
    assert 'Двор смотрителя' not in page.locator('#journal-pages').inner_text()
    page.click('[data-journal-tab="help"]')
    page.click('[data-page-id="limbs"]')
    assert 'четыре секунды' in page.locator('#journal-text').inner_text()
    page.screenshot(path=str(ARTIFACTS/'guide-journal-help.png'))
    page.keyboard.press('Escape')
    page.wait_for_function('() => __game.mode==="tactical"')
    page.keyboard.press('ArrowUp')
    page.wait_for_function('() => __game.guide.commands.current?.direction===0')
    page.click('#guide-clear')
    before=page.evaluate('JSON.stringify({time:__game.time,player:__game.player,needs:__game.guide.state.needs,particles:__game.particles})')
    page.wait_for_timeout(250)
    assert before==page.evaluate('JSON.stringify({time:__game.time,player:__game.player,needs:__game.guide.state.needs,particles:__game.particles})')
    for action in ['jump','guard','roll']:
        page.click(f'[data-command="{action}"]')
    page.click('[data-command="wait"]')
    assert page.evaluate('__game.guide.commands.items.length')==3
    page.get_by_role('button',name='Отменить приказ 2',exact=True).click()
    assert page.evaluate('__game.guide.commands.items.map(c=>c.type)')==['jump','roll']
    page.click('#guide-clear')
    page.keyboard.press('z')
    page.wait_for_function('() => (__game.guide.commands.items.length===1)')
    page.wait_for_function('() => (__game.guide.forecast && __game.guide.forecast.queue.points.some(p=>p.y<570))')
    predicted=page.evaluate('__game.guide.forecast.queue.endpoint')
    page.keyboard.press('Space')
    page.wait_for_function('() => (__game.mode==="playing" && __game.guide.commands.items.length===0)')
    page.wait_for_timeout(800)
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode==="tactical"')
    assert abs(page.evaluate('__game.player.x')-predicted['x'])<2
    page.screenshot(path=str(ARTIFACTS/'guide-tactical.png'))
    # World-space pointer mapping accounts for the dock and contain letterboxing.
    point=page.evaluate('''() => {
      const c=document.getElementById('game'),r=c.getBoundingClientRect(),g=__game;
      const s=Math.min(r.width/c.width,r.height/c.height);
      return {x:r.x+(r.width-c.width*s)/2+(350-g.camera.x)*s,y:r.y+(r.height-c.height*s)/2+(450-g.camera.y)*s};
    }''')
    page.click('[data-tool="platform"]')
    page.mouse.click(point['x'],point['y'])
    placed=page.evaluate('__game.guide.tools.structures[0]')
    assert abs(placed['x']-290)<1 and abs(placed['y']-450)<1
    ttl=placed['life']
    page.wait_for_timeout(200)
    assert page.evaluate('__game.guide.tools.structures[0].life')==ttl
    # Leave a safehouse through the ordinary queued interaction, not direct UI calls.
    page.evaluate('''() => {const g=__game;g.loadRoom('P02');const e=g.room.entities.find(e=>e.type==='rest');Object.assign(g.player,{x:e.x-12,y:e.y-44,grounded:true,vx:0,vy:0});g.nearby=g.findNearby();}''')
    page.keyboard.press('e')
    page.keyboard.press('Space')
    page.wait_for_function('() => (__game.mode==="safehouse")')
    for action in ['bed','food','wash','coffee']:
        page.click(f'[data-rest="{action}"]')
    assert page.evaluate('__game.guide.state.caffeine.state')=='armed'
    assert page.evaluate('__game.guide.state.needs.corruption')==0
    inventory=page.evaluate('JSON.stringify(__game.guide.state.inventory)')
    page.click('#safehouse-journal')
    page.wait_for_function('() => __game.mode==="journal"')
    page.click('#journal-close')
    assert page.evaluate('__game.mode')=='safehouse'
    assert inventory==page.evaluate('JSON.stringify(__game.guide.state.inventory)')
    page.screenshot(path=str(ARTIFACTS/'guide-safehouse.png'))
    page.click('#safehouse-leave')
    assert page.evaluate('__game.mode')=='tactical'
    page.keyboard.press('Escape')
    page.wait_for_function('() => __game.mode==="pause"')
    page.click('#to-title')
    guide_save=page.evaluate('localStorage.getItem("last-harbour.guide.v1")')
    page.click('#play')
    assert page.evaluate('__game.guide.enabled') is False
    page.keyboard.press('d')
    page.keyboard.press('Escape')
    page.wait_for_function('() => __game.mode==="pause"')
    page.click('#to-title')
    assert page.evaluate('localStorage.getItem("last-harbour.guide.v1")')==guide_save
    page.click('#guide-play')
    assert page.evaluate('__game.guide.enabled') is True
    assert 'wake' in page.evaluate('__game.guide.story.state.read')
    # Field stock requires an actual queued interaction and persists after restart.
    page.evaluate('''() => {const g=__game;g.loadRoom('P03');const e=g.guide.supplies.available[0];Object.assign(g.player,{x:e.x-12,y:e.y-44,grounded:true,vx:0,vy:0});g.nearby=g.findNearby();}''')
    stock=page.evaluate('__game.guide.state.inventory.rations')
    cache_point=page.evaluate('''() => {const c=document.getElementById('game'),r=c.getBoundingClientRect(),g=__game,e=g.guide.supplies.available[0],s=Math.min(r.width/c.width,r.height/c.height);return {x:r.x+(r.width-c.width*s)/2+(e.x-g.camera.x)*s,y:r.y+(r.height-c.height*s)/2+(e.y-16-g.camera.y)*s};}''')
    page.mouse.click(cache_point['x'],cache_point['y'])
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.guide.state.collectedSupplies.includes("guide.cache.p03")')
    assert page.evaluate('__game.guide.state.inventory.rations')==stock+1
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode==="tactical"')
    page.evaluate('''() => {const g=__game;g.loadRoom('P01');g.guide.commands.enqueue('move',{x:740});}''')
    page.wait_for_function('() => __game.guide.forecast?.recommendation')
    page.locator('#guide-accept-oracle').click()
    assert page.evaluate('__game.guide.commands.items.map(c=>c.type)')==['move','jump','move']
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode==="playing" && __game.guide.commands.items.length===0')
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode==="tactical"')
    assert abs(page.evaluate('__game.player.x+12')-740)<20
    # Approaching a rest zone opens management without an interaction command.
    page.evaluate('''() => {const g=__game;g.loadRoom('P02');g.guide.commands.enqueue('move',{x:430});}''')
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode==="safehouse"')
    page.click('#safehouse-leave')
    page.keyboard.press('Space')
    page.wait_for_timeout(150)
    assert page.evaluate('__game.mode')=='playing'
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode==="tactical"')
    page.evaluate('''() => {Object.assign(__game.guide.state.needs,{satiety:10,energy:2,stress:90});__guideUI.sync();}''')
    assert page.locator('[data-condition="hunger"]').is_visible()
    assert page.locator('[data-condition="sleep"]').is_visible()
    assert page.locator('[data-condition="panic"]').is_visible()
    page.screenshot(path=str(ARTIFACTS/'guide-conditions.png'))
    page.evaluate('''() => Object.assign(__game.guide.state.needs,{satiety:80,energy:80,stress:10})''')
    page.evaluate('''() => {const g=__game;g.flag('boss.courtyard_keeper');g.flag('mechanism.tower_bridge');g.loadRoom('R08');const e=g.room.entities.find(e=>e.type==='ending');Object.assign(g.player,{x:e.x-12,y:e.y-44,grounded:true,vx:0,vy:0});g.nearby=g.findNearby();}''')
    page.keyboard.press('e')
    page.keyboard.press('Space')
    page.wait_for_function('() => __game.mode==="complete"')
    assert page.locator('#completion-eyebrow').inner_text() == 'АКТ I · ПЕРВЫЙ СВЕТ'
    ending=page.evaluate('JSON.stringify(__game.guide.story.state.ending)')
    page.click('#completion-journal')
    page.wait_for_function('() => __game.mode==="journal"')
    page.screenshot(path=str(ARTIFACTS/'guide-journal-ending.png'))
    page.click('#journal-close')
    assert page.evaluate('__game.mode')=='complete'
    assert ending==page.evaluate('JSON.stringify(__game.guide.story.state.ending)')
    assert not errors,errors
    context.close()

    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
    page=mobile.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL+'/?debug=1')
    page.wait_for_function('() => (window.__game && document.getElementById("loading").hidden)')
    page.tap('#guide-play')
    page.wait_for_function('() => (__game.guide.forecast && __game.mode==="tactical")')
    for w,h in [(390,844),(844,390),(320,568)]:
        page.set_viewport_size({'width':w,'height':h})
        page.wait_for_timeout(200)
        page.wait_for_function('() => __guideUI.oracle.resultStamp===__guideUI.oracle.stamp()')
        layout=page.evaluate('''() => {const d=document.getElementById('guide-dock').getBoundingClientRect(),c=document.getElementById('game').getBoundingClientRect();return {dock:d.toJSON(),canvas:c.toJSON(),width:document.documentElement.scrollWidth,height:innerHeight};}''')
        assert layout['canvas']['bottom']<=layout['dock']['top']+1,layout
        assert layout['dock']['bottom']<=h+1,layout
        assert layout['width']==w,layout
        page.tap('[data-command="jump"]')
        assert page.evaluate('__game.guide.commands.items.length')==1
        page.tap('#guide-clear')
        page.tap('#guide-jump-up')
        assert page.evaluate('__game.guide.commands.current.direction')==0
        page.tap('#guide-clear')
        page.screenshot(path=str(ARTIFACTS/f'guide-{w}x{h}.png'))
        page.tap('#guide-journal')
        page.wait_for_function('() => __game.mode==="journal"')
        page.tap('[data-journal-tab="help"]')
        page.tap('[data-page-id="supplies"]')
        assert page.locator('#journal-title').inner_text()=='Передать помощь'
        selected=page.locator('[data-page-id="supplies"]').bounding_box()
        assert selected['x']<w and selected['x']+selected['width']>0
        assert page.locator('#journal-page').bounding_box()['height']>40
        footer=page.locator('.journal-footer').bounding_box()
        assert footer['y']+footer['height']<=h+1
        page.screenshot(path=str(ARTIFACTS/f'guide-journal-{w}x{h}.png'))
        page.tap('#journal-close')
        assert page.evaluate('__game.mode')=='tactical'
    page.tap('#guide-time')
    page.wait_for_function('() => (__game.mode==="playing")')
    page.evaluate('window.dispatchEvent(new Event("blur"))')
    assert page.evaluate('__game.mode')=='pause'
    page.tap('#resume')
    assert page.evaluate('__game.mode')=='playing'
    assert not errors,errors
    mobile.close();browser.close()
print(json.dumps({'guide':'passed','sizes':['1440x900','390x844','844x390','320x568'],'errors':errors},ensure_ascii=False))
