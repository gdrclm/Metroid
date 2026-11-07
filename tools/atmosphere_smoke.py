"""Four integrated scenes, real Web Audio output/budgets and interruption recovery."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
os.chdir(ROOT)
URL=os.environ.get('BASE_URL','http://127.0.0.1:3000').rstrip('/')
Path('artifacts').mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':720})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def boot():
        page.goto(URL+'/?debug=1')
        page.wait_for_function('window.__game && window.__audio')
        page.evaluate("""()=>{window.__soundLog=[];const play=__audio.play.bind(__audio);__audio.play=(name,options)=>{__soundLog.push(name);return play(name,options)}}""")
        page.locator('#play').click()
    def place(room,entity=None,exit=None):
        page.evaluate("""({room,entity,exit})=>{const g=__game;g.loadRoom(room);let e=entity?g.room.entities.find(e=>e.id===entity):exit?g.room.exits.find(e=>e.targetRoomId===exit):null;if(e)Object.assign(g.player,{x:e.x-12,y:e.y-44,vx:0,vy:0,grounded:true});g.snapCamera()}""",{'room':room,'entity':entity,'exit':exit})
        page.wait_for_timeout(120)
    boot()
    page.wait_for_timeout(200)
    assert page.evaluate("__audio.ctx.state==='running'")
    page.screenshot(path='artifacts/scene-boat-departing.png')
    assert page.evaluate("__game.progress.scenes['scene.boat_departed']")
    # Measure samples after the master bus: this exercises the browser audio graph.
    page.evaluate("""()=>{window.__meter=__audio.ctx.createAnalyser();__meter.fftSize=2048;__audio.master.connect(__meter)}""")
    def rms():
        return page.evaluate("""async()=>{let peak=0;const data=new Float32Array(__meter.fftSize);for(let i=0;i<12;i++){await new Promise(r=>requestAnimationFrame(r));__meter.getFloatTimeDomainData(data);peak=Math.max(peak,Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length));}return peak}""")
    audible=rms()
    assert audible>.00001,audible
    # Reload during the departure; the endpoint survives without another boat cue.
    page.reload();page.wait_for_function('window.__game');page.locator('#play').click()
    assert page.evaluate("__game.atmosphere.phase('scene.boat_departed')===1")
    assert page.evaluate("!__game.atmosphere.active.has('scene.boat_departed')")
    page.screenshot(path='artifacts/scene-boat-after-reload.png')
    place('P02','rest.pier')
    page.screenshot(path='artifacts/scene-house-before.png')
    page.keyboard.press('e');page.wait_for_timeout(1700)
    assert page.evaluate("__game.progress.scenes['scene.warm_house']")
    assert page.evaluate("__game.mode==='playing'")
    page.screenshot(path='artifacts/scene-house-after.png')
    page.evaluate("__game.flag('mechanism.pier_lift')")
    place('P08',exit='V01');page.keyboard.press('e')
    page.wait_for_function('()=>Boolean(__game.transition)')
    page.wait_for_timeout(1500)
    page.screenshot(path='artifacts/scene-lift-in-motion.png')
    page.wait_for_function("()=>__game.room.roomId==='V01'&&!__game.transition")
    assert page.evaluate("__game.progress.scenes['scene.first_ascent']")
    page.wait_for_timeout(1500)
    page.screenshot(path='artifacts/scene-station-arrival.png')
    place('R07')
    page.evaluate("__game.flag('boss.courtyard_keeper');__game.enemies=[]")
    place('R07','lever.fire_stairs')
    page.keyboard.press('e');page.wait_for_timeout(230)
    assert page.evaluate("__game.progress.scenes['scene.fire_ladder']")
    assert page.evaluate("__game.particles.some(p=>p.kind==='rust')")
    page.screenshot(path='artifacts/scene-ladder-rust.png')
    place('R02');page.wait_for_timeout(400)
    assert page.evaluate("__game.atmosphere.phase('scene.fire_ladder')>0")
    page.screenshot(path='artifacts/scene-kitchen-after.png')
    # Saturating ambience cannot suppress an attack warning, or exceed the cap.
    cap=page.evaluate("""()=>{for(let i=0;i<90;i++)__audio.play('crockery',{channel:'ambience',priority:15,gain:.02});__audio.play('keeperWaveReady');return{voices:__audio.voices.size,warning:[...__audio.voices].some(v=>v.priority===100),mix:Object.keys(__audio.buses)}}""")
    assert cap['voices']<=24 and cap['warning'] and len(cap['mix'])==4,cap
    # Repeated room changes retire old loop sources, including their fade tails.
    for i in range(20):
        page.evaluate("id=>__game.loadRoom(id)",'V01' if i%2 else 'P02')
        page.wait_for_timeout(80)
        assert page.evaluate('__audio.voices.size')<=24
    page.wait_for_timeout(1300)
    assert page.evaluate('__audio.voices.size')<12
    page.evaluate("__game.progress.settings.sound=false;__audio.update()")
    page.wait_for_timeout(1700)
    page.evaluate("window.__meter=__audio.ctx.createAnalyser();__audio.master.connect(__meter)")
    muted=rms();assert muted<.00001,muted
    page.evaluate("__game.progress.settings.sound=true;__audio.update()")
    page.locator('#pause-button').click()
    page.locator('#open-settings').click()
    page.locator('.sound-mix summary').click()
    page.locator('#mix-music').focus()
    page.keyboard.press('Home');page.keyboard.press('ArrowRight')
    page.locator('#particle-quality').select_option('low')
    page.locator('#close-settings').click()
    page.reload();page.wait_for_function('()=>window.__game')
    page.locator('#play').click()
    assert page.evaluate('__game.progress.settings.mix.music')==.01
    assert page.evaluate('__game.progress.settings.particleQuality')=='low'
    # Preview is visual only: it must leave the permanent save untouched.
    page.keyboard.press('Backquote')
    snapshot=page.evaluate('JSON.stringify(__game.progress.scenes)')
    page.locator('#atmosphere-preview').select_option('before')
    page.locator('#atmosphere-preview').select_option('after')
    assert snapshot==page.evaluate('JSON.stringify(__game.progress.scenes)')
    page.locator('[data-atmosphere=audioSources]').check()
    page.locator('[data-atmosphere=emitters]').check()
    page.screenshot(path='artifacts/atmosphere-debug.png')
    page.locator('#atmosphere-preview').select_option('live')
    assert not errors,errors
    result={'scenes':['boat','warm house','lift arrival','fire ladder'],'realAudioOutputRms':audible,'mutedRms':muted,'voiceCap':cap,'reloadRecovery':'passed','mixAndQualityPersistence':'passed','debugPreview':'passed','pageErrors':errors}
    Path('artifacts/atmosphere-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('ATMOSPHERE PASS',json.dumps(result,ensure_ascii=False),flush=True)
    browser.close()
