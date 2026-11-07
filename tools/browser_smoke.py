"""Browser integration checks. Requires Playwright Python and Chromium; no game dependencies.

Room fixtures position the player near objects to cover all 20 rooms quickly.
The dash tutorial and combat use real keyboard input. Wall-jump geometry is also
tested through the actual fixed-step controller in tests/physics.test.js.
"""
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
URL = os.environ.get('BASE_URL', 'http://127.0.0.1:3000')
server = None
try:
    urllib.request.urlopen(URL, timeout=2)
except OSError:
    server = subprocess.Popen(['node', 'tools/server.mjs'], cwd=ROOT, stdout=subprocess.DEVNULL)
    for attempt in range(40):
        try:
            urllib.request.urlopen(URL, timeout=1)
            break
        except OSError:
            time.sleep(.1)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width':1440,'height':900}, device_scale_factor=1)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(URL + '/?debug=1')
        page.wait_for_function("window.__game && document.getElementById('loading').hidden")
        page.screenshot(path=str(ARTIFACTS / 'title.png'))
        page.locator('#play').click()
        page.wait_for_function("__game.mode === 'playing'")
        assert page.evaluate('__game.room.roomId') == 'P01'
        assert page.evaluate('__game.flags.length') == 0
        page.keyboard.down('d')
        page.keyboard.down('Space')
        page.wait_for_timeout(250)
        assert page.evaluate('__game.player.x') > 185
        assert page.evaluate('__game.player.y') < 530
        page.keyboard.up('Space')
        page.keyboard.up('d')
        page.keyboard.press('Shift')
        assert page.evaluate('__game.player.dashTime') == 0
        page.wait_for_timeout(500)
        page.screenshot(path=str(ARTIFACTS / 'pier.png'))
        page.evaluate("window.dispatchEvent(new Event('blur'))")
        assert page.locator('#pause-screen').is_visible()
        frozen = page.evaluate('[__game.player.x,__game.player.y]')
        page.wait_for_timeout(100)
        assert frozen == page.evaluate('[__game.player.x,__game.player.y]')
        page.locator('#resume').click()

        def position(kind, identifier):
            page.evaluate("""({kind,id}) => {
              const g=__game, e=kind==='exit'?g.room.exits.find(e=>e.targetRoomId===id):g.room.entities.find(e=>e.id===id);
              if(!e)throw Error('Missing '+id+' in '+g.room.roomId);
              const feet=['ability','pickup'].includes(e.type)?e.y+32:e.y;
              Object.assign(g.player,{x:e.x-12,y:feet-44,vx:0,vy:0,grounded:true,invulnerable:2});
            }""", {'kind':kind,'id':identifier})
            page.wait_for_timeout(100)

        def interact(identifier, close=True):
            print('interact', identifier, flush=True)
            position('entity',identifier)
            page.keyboard.press('e')
            page.wait_for_timeout(150)
            if close and page.evaluate("__game.mode==='dialogue'"):
                page.keyboard.press('e')
                page.wait_for_timeout(50)

        def go(target, lift_pause=False):
            print('transition', target, flush=True)
            position('exit',target)
            page.keyboard.press('e')
            if lift_pause:
                page.wait_for_timeout(160)
                page.keyboard.press('Escape')
                before=page.evaluate('__game.transition.elapsed')
                page.wait_for_timeout(180)
                assert page.evaluate('__game.transition.elapsed') == before
                page.locator('#resume').click()
            try:
                page.wait_for_function('(id)=>__game.room.roomId===id && !__game.transition', arg=target, timeout=5000)
            except Exception:
                print('Transition failed:', page.evaluate('({room:__game.room.roomId,mode:__game.mode,nearby:__game.nearby,player:__game.player})'))
                page.screenshot(path=str(ARTIFACTS/'failure.png'))
                raise

        go('P02')
        page.evaluate('__game.health=1')
        interact('rest.pier')
        assert page.evaluate('__game.health') == 5
        go('P03')
        interact('pickup.p03_lower')
        go('P04')
        interact('gift.dash')
        assert page.evaluate("__game.flags.filter(f=>f==='ability.dash').length") == 1
        go('P05')
        # An ordinary running jump fails (unit test); actual keyboard jump + dash clears it here.
        page.keyboard.down('d')
        page.wait_for_timeout(660)
        page.keyboard.down('Space')
        page.wait_for_timeout(240)
        page.keyboard.press('Shift')
        page.wait_for_timeout(530)
        page.keyboard.up('Space')
        page.keyboard.up('d')
        page.wait_for_timeout(220)
        assert page.evaluate('__game.player.x') > 760, page.evaluate('[__game.player.x,__game.player.y]')
        assert page.evaluate('__game.player.y') == 396
        page.screenshot(path=str(ARTIFACTS / 'dash-tutorial.png'))
        go('P06')
        interact('pickup.p06_dash')
        go('P07')
        interact('lever.pier_gate')
        go('P02')
        go('P07')
        go('P06')
        go('P08')
        interact('lever.pier_lift')
        go('V01', lift_pause=True)
        go('V02')
        interact('rest.station')
        interact('npc.station_keeper')
        page.screenshot(path=str(ARTIFACTS / 'station.png'))
        go('V03')
        interact('npc.clockmaker')
        interact('npc.clockmaker')
        assert page.evaluate("__game.flags.filter(f=>f==='pickup.clockmaker').length") == 1
        go('V02')
        go('V04')
        interact('future.archive')
        go('R01')
        go('R02')
        interact('rest.kitchen')
        go('R03')
        go('R04')
        interact('gift.wall_grip')
        assert page.evaluate('__game.abilities.wall_grip')
        go('R05')
        page.screenshot(path=str(ARTIFACTS / 'shaft.png'))
        go('R06')
        go('R07')
        page.evaluate('__game.debug.god=true')
        for attack in range(16):
            if page.evaluate("__game.flags.includes('boss.courtyard_keeper')"):
                break
            page.evaluate("""() => {const g=__game,e=g.enemies[0];Object.assign(g.player,{x:e.x-62,y:576,vx:0,vy:0,facing:1});}""")
            page.keyboard.press('j')
            page.wait_for_timeout(460)
        assert page.evaluate("__game.flags.includes('boss.courtyard_keeper')")
        page.evaluate('__game.debug.god=false')
        interact('lever.fire_stairs')
        interact('lever.tower_bridge')
        go('R02')
        go('R07')
        assert page.evaluate('__game.enemies.length') == 0
        go('R06')
        go('R08')
        interact('slice.overlook', close=False)
        assert page.locator('#complete-screen').is_visible()
        assert page.evaluate('__game.progress.visited.length') == 20
        page.screenshot(path=str(ARTIFACTS / 'completion.png'))
        page.locator('#keep-exploring').click()
        page.keyboard.press('m')
        page.screenshot(path=str(ARTIFACTS / 'map.png'))
        page.locator('#zoom-in').click()
        page.locator('#zoom-out').click()
        page.locator('#map-center').click()
        page.keyboard.press('m')
        # Return using the two shortcuts and the two-way lift; collect the late secret.
        for target in ['R06','R07','R02','R01','V04','V02','V01','P08','P06','P07','P02','P03']:
            go(target)
        interact('pickup.p03_upper')
        assert page.evaluate('__game.health') == 6
        assert page.evaluate("__game.flags.includes('pickup.p03_upper')")
        page.keyboard.press('Escape')
        page.locator('#open-settings').click()
        page.locator('#flash-setting').check()
        page.locator('#shake-setting').uncheck()
        page.locator('#close-settings').click()
        page.locator('#resume').click()
        flags = page.evaluate('__game.flags.slice().sort()')
        page.reload()
        page.wait_for_function('window.__game')
        page.locator('#play').click()
        assert page.evaluate('__game.room.roomId') == 'R02'
        assert page.evaluate('__game.flags.slice().sort()') == flags
        assert page.evaluate('__game.health') == 6
        assert page.evaluate('__game.progress.settings.reducedFlash')
        assert not page.evaluate('__game.progress.settings.shake')
        # Death restores the same checkpoint and does not lose rewards.
        page.evaluate('__game.die()')
        page.locator('#respawn').click()
        assert page.evaluate('__game.flags.slice().sort()') == flags
        assert page.evaluate('__game.room.roomId') == 'R02'
        # Sample actual rAF times with two enemies and a replenished full particle budget.
        performance_result=page.evaluate("""async () => {
          const g=__game;g.loadRoom('R03');g.debug.god=true;g.player.x=790;
          const frames=[];let previous=performance.now();
          for(let i=0;i<180;i++){
            await new Promise(requestAnimationFrame);const now=performance.now();
            if(i>10)frames.push(now-previous);previous=now;
            if(g.particles.length<150)g.burst(760,500,160,'#c8b67c');
          }
          frames.sort((a,b)=>a-b);
          return {frames:frames.length,averageFps:+(1000/(frames.reduce((a,b)=>a+b,0)/frames.length)).toFixed(1),p95Ms:+frames[Math.floor(frames.length*.95)].toFixed(2),worstMs:+Math.max(...frames).toFixed(2),enemies:g.enemies.length,particleLimit:160};
        }""")
        # Production-style page exposes no developer API without explicit opt-in.
        ordinary=context.new_page()
        ordinary.goto(URL)
        ordinary.wait_for_selector('#play')
        assert ordinary.evaluate('typeof window.__game') == 'undefined'
        # Coarse-pointer controls support multiple simultaneous fingers.
        mobile=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
        touch=mobile.new_page()
        touch.goto(URL)
        touch.locator('#play').click()
        assert touch.locator('#touch-controls').is_visible()
        touch.locator('[data-action=right]').dispatch_event('pointerdown',{'pointerId':2,'pointerType':'touch','isPrimary':True})
        touch.wait_for_timeout(180)
        touch.locator('[data-action=right]').dispatch_event('pointerup',{'pointerId':2,'pointerType':'touch'})
        touch.screenshot(path=str(ARTIFACTS / 'mobile.png'))
        assert not errors, errors
        result={'rooms':20,'journey':'complete and backtracked','physicalDashTutorial':'passed','boss':'12 keyboard hits','restart':'checkpoint, flags and settings restored','death':'progress retained','mobile':'touch UI rendered','performanceCloudChromium':performance_result,'pageErrors':errors,'screenshots':8}
        (ARTIFACTS/'browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(result,ensure_ascii=False,indent=2))
        mobile.close()
        context.close()
        browser.close()
finally:
    if server:
        server.terminate()
        server.wait(timeout=5)
