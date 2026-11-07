"""A complete playthrough using actual keyboard events, no teleports or invulnerability.
The policy reads the simulation to choose actions; it never changes health, flags,
position, physics, or time. This is an automated playtest, not a blind human test.
"""
import json,os,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
os.chdir(ROOT)
URL=os.environ.get('BASE_URL','http://127.0.0.1:3000').rstrip('/')
key={'left':'a','right':'d','up':'w','down':'s','jump':'Space','attack':'j','dash':'Shift','interact':'e'}
Path('artifacts').mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':720})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL+'/?debug=1')
    page.wait_for_function('window.__game')
    page.locator('#play').click()
    page.evaluate("""async()=>{const{JourneyPilot}=await import('./tools/pilot.js');window.__pilot=new JourneyPilot();}""")
    held=set();last=-1;started=time.monotonic();last_progress=started
    while time.monotonic()-started<850:
        state=page.evaluate("""()=>({mode:__game.mode,done:__pilot.done,index:__pilot.index,room:__game.room.roomId,health:__game.health,deaths:__game.progress.deaths,god:__game.debug.god,fly:__game.debug.fly})""")
        assert not state['god'] and not state['fly']
        assert state['deaths']<=8,state
        if state['done']:break
        if state['index']!=last:
            print(json.dumps(state,ensure_ascii=False),flush=True)
            last=state['index'];last_progress=time.monotonic()
            if last in [41,43,44,51,54]:page.screenshot(path=f'artifacts/continuous-{last}.png')
        if time.monotonic()-last_progress>75:
            page.screenshot(path='artifacts/continuous-failure.png')
            raise AssertionError(page.evaluate('({task:__pilot.tasks[__pilot.index],room:__game.room.roomId,player:__game.player,state:__pilot.state,nearby:__game.nearby,enemies:__game.enemies})'))
        if state['mode'] in ['dialogue','complete','death']:
            for action in held:page.keyboard.up(key[action])
            held.clear()
            if state['mode']=='dialogue':page.locator('#dialogue-close').click()
            elif state['mode']=='complete':page.locator('#keep-exploring').click()
            else:page.locator('#respawn').click()
            continue
        action=page.evaluate('__pilot.next(__game)')
        wanted=set(action['held'])
        for name in held-wanted:page.keyboard.up(key[name])
        for name in wanted-held:page.keyboard.down(key[name])
        for name in action['pressed']:
            if name in wanted:
                page.keyboard.up(key[name]);page.keyboard.down(key[name])
            else:page.keyboard.press(key[name])
        held=wanted
        page.wait_for_timeout(18)
    else:raise AssertionError('Continuous playthrough timed out')
    for name in held:page.keyboard.up(key[name])
    result=page.evaluate('({completed:__pilot.done,rooms:__game.progress.visited,health:__game.health,deaths:__game.progress.deaths,time:__game.progress.playTime,flags:__game.flags,trace:__pilot.trace,stats:__game.progress.stats})')
    assert result['completed'] and len(result['rooms'])==22,result
    assert 'pickup.p03_upper' in result['flags'] and 'slice.overlook_seen' in result['flags']
    assert not errors,errors
    result['pageErrors']=errors
    Path('artifacts/continuous-browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    page.screenshot(path='artifacts/continuous-finish.png')
    print('CONTINUOUS BROWSER PASS',json.dumps({k:result[k]for k in ['completed','health','deaths','time']}),flush=True)
    browser.close()
