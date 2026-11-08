"""Continuous held music, exclusive room transitions, slow boss and lift cue.

The analyser reads music only: ambience cannot hide a gap or a stale composition.
Requires a running dev server, Python Playwright and Chromium.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = os.environ.get('BASE_URL', 'http://127.0.0.1:3000').rstrip('/')
ARTIFACTS = ROOT / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
                                headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL + '/?debug=1')
    page.wait_for_function('() => window.__game && window.__audio')
    page.locator('#play').click()
    page.wait_for_function("() => __audio.ctx.state === 'running' && __audio.sampleState === 'ready'", timeout=15000)
    page.evaluate("""() => {
      window.__musicLog = []; window.__instrumentMeters = {}; window.__compositionMeters = {};
      const voice = __audio.voice.bind(__audio);
      __audio.voice = options => {
        const result = voice(options);
        if (result && options.channel === 'music') {
          __musicLog.push({theme: result.compositionKey?.split(':')[0], key: result.compositionKey,
            instrument: options.instrument, at: result.startsAt, createdAt: __audio.ctx.currentTime,
            duration: result.endsAt-result.startsAt-.03, score: options.score,
            frequency: options.frequency, sample: result.sample,
            sourceType: result.source.constructor.name});
          for (const [meters,key] of [[__instrumentMeters,options.instrument],[__compositionMeters,result.compositionKey]]) {
            if (!key) continue;
            const meter = meters[key] ??= __audio.ctx.createAnalyser();
            meter.fftSize=512; result.gain.connect(meter);
          }
        }
        return result;
      };
      window.__musicMeter=__audio.ctx.createAnalyser(); __musicMeter.fftSize=2048;
      __audio.buses.music.connect(__musicMeter);
      window.__masterMeter=__audio.ctx.createAnalyser(); __audio.master.connect(__masterMeter);
    }""")

    def settled():
        page.wait_for_function('() => __audio.ctx.currentTime > __audio.musicReadyAt + 2.3')

    def measure(seconds, audible=True, master=False):
        result = page.evaluate("""async ({seconds,master}) => {
          const meter=master?__masterMeter:__musicMeter, data=new Float32Array(meter.fftSize), peaks=[];
          let maxVoices=0,maxQueue=0; const instrumentRms={};
          for(let window=0;window<seconds*2;window++) {
            let peak=0;
            for(let sample=0;sample<5;sample++) {
              await new Promise(r=>setTimeout(r,100)); meter.getFloatTimeDomainData(data);
              peak=Math.max(peak,Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length));
              maxVoices=Math.max(maxVoices,__audio.voices.size);maxQueue=Math.max(maxQueue,__audio.queue.length);
              for(const [instrument,analyser] of Object.entries(__instrumentMeters)) {
                const values=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(values);
                const rms=Math.sqrt(values.reduce((s,v)=>s+v*v,0)/values.length);
                instrumentRms[instrument]=Math.max(instrumentRms[instrument]||0,rms);
              }
            }
            peaks.push(peak);
          }
          return {minRms:Math.min(...peaks),maxRms:Math.max(...peaks),windows:peaks.length,
            silentWindows:peaks.filter(v=>v<.00001).length,maxVoices,maxQueue,instrumentRms};
        }""", dict(seconds=seconds,master=master))
        if audible == 'some':
            assert result['maxRms'] > .00001, result
        elif audible:
            assert result['minRms'] > .00001, result
        else:
            assert result['maxRms'] < .00001, result
        assert result['maxVoices'] <= 24 and result['maxQueue'] <= 64, result
        print(json.dumps(result), flush=True)
        return result

    def begin_transition_monitor():
        page.evaluate("""() => {
          window.__transitionTrace=[];
          window.__transitionTimer=setInterval(()=>{
            const active=[];
            for(const [key,meter] of Object.entries(__compositionMeters)) {
              const values=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(values);
              const rms=Math.sqrt(values.reduce((s,v)=>s+v*v,0)/values.length);
              if(rms>.00001)active.push(key);
            }
            __transitionTrace.push({at:__audio.ctx.currentTime,active});
          },25);
        }""")

    def end_transition_monitor(expected):
        trace = page.evaluate('() => { clearInterval(__transitionTimer); return __transitionTrace; }')
        assert len(trace) > 30, trace
        mixed = [x for x in trace if len(x['active']) > 1]
        assert not mixed, mixed[:5]
        assert any(expected in x['active'] for x in trace[-60:]), (expected, trace[-10:])
        return dict(samples=len(trace), overlappingCompositions=0, final=expected)

    page.evaluate("__game.loadRoom('P02')")
    page.wait_for_function("() => __audio.musicKey === 'pier:P02'")
    settled()
    exploration = measure(38)
    exploration_notes = page.evaluate("__musicLog.filter(n=>n.score&&n.key==='pier:P02')")
    assert 5 <= len(exploration_notes) <= 10, exploration_notes
    assert any(n['at'] > exploration_notes[0]['at'] + 30 for n in exploration_notes)
    assert {'piano','violin'} <= set(n['instrument'] for n in exploration_notes)

    # Include a long scene voice and future motif, which previously survived a room change.
    begin_transition_monitor()
    change_at = page.evaluate("""() => {
      __audio.voice({instrument:'violin',frequency:110,duration:18,sustain:true,channel:'music',gain:.025});
      __audio.motif('warm',4,null,'P02');
      const at=__audio.ctx.currentTime;__game.loadRoom('V02');return at;
    }""")
    page.wait_for_function("() => __audio.musicKey === 'station:V02'")
    settled(); page.wait_for_timeout(1400)
    transition = end_transition_monitor('station:V02')
    assert not page.evaluate('at=>__musicLog.some(n=>n.key==="pier:P02"&&n.createdAt>at+.05)',change_at)

    # Rapidly passing through rooms must select only the final destination.
    begin_transition_monitor()
    page.evaluate("__game.loadRoom('R02')");page.wait_for_timeout(180)
    page.evaluate("__game.loadRoom('P03')")
    page.wait_for_function("() => __audio.musicKey === 'pier:P03'")
    settled();page.wait_for_timeout(1200)
    rapid = end_transition_monitor('pier:P03')

    # The actual lift changes rooms halfway through its 2.4 s travel.
    page.evaluate("__game.flag('mechanism.pier_lift');__game.loadRoom('P08')")
    page.wait_for_function("() => __audio.musicKey === 'pier:P08'");settled()
    lifts = []
    for target in ['V01','P08']:
        before = page.evaluate('__musicLog.length')
        begin_transition_monitor()
        page.evaluate("target=>__game.tryExit(__game.room.exits.find(e=>e.type==='lift'&&e.targetRoomId===target))",target)
        page.wait_for_function("() => __audio.musicTheme === 'lift'")
        page.wait_for_function('target=>__game.room.roomId===target&&!__game.transition',arg=target)
        settled();page.wait_for_timeout(600)
        expected = ('station:' if target=='V01' else 'pier:')+target
        lifts.append(end_transition_monitor(expected))
        heard = page.evaluate('before=>__musicLog.slice(before).filter(n=>n.theme==="lift")',before)
        assert len(heard) >= 8 and all(n['instrument']=='piano' for n in heard), heard
        assert len(set(n['key'] for n in heard)) == 1, heard

    page.evaluate("""() => {
      const g=__game;g.loadRoom('R07');g.debug.god=true;
      const e=g.enemies[0];Object.assign(g.player,{x:e.x-200,y:e.y+e.h-44});g.snapCamera();
    }""")
    page.wait_for_function("() => __game.arenaActive&&__audio.musicTheme==='boss'");settled()
    boss = measure(25)
    for instrument in ['guitar','bass','kick','snare','cymbal']:
        assert boss['instrumentRms'].get(instrument,0) > .0001, (instrument,boss)
    battle_notes = page.evaluate("__musicLog.filter(n=>n.score&&n.theme==='boss')")
    assert all(n['sample'] and n['sourceType']=='AudioBufferSourceNode' for n in battle_notes)
    chords = []
    for n in sorted((n for n in battle_notes if n['instrument']=='guitar'),key=lambda n:n['at']):
        if not chords or n['at']-chords[-1]>1:chords.append(n['at'])
    gaps = [b-a for a,b in zip(chords,chords[1:])]
    assert 2 <= len(chords) <= 3 and min(gaps) > 18.5, chords
    assert min(n['duration'] for n in battle_notes if n['instrument']=='guitar') > 21, battle_notes
    assert page.evaluate("""() => {
      __audio.play('keeperWaveReady');return __audio.voices.size<=24&&[...__audio.voices].some(v=>v.priority===100);
    }""")

    page.keyboard.press('Escape');page.wait_for_function("()=>__game.mode==='pause'")
    before=page.evaluate('__musicLog.length');page.wait_for_timeout(1200)
    assert page.evaluate('__musicLog.length') == before
    page.locator('#resume').click();settled();resumed=measure(3)
    page.evaluate('__game.progress.settings.sound=false;__audio.update()');page.wait_for_timeout(1600)
    muted=measure(1,audible=False,master=True)
    page.evaluate('__game.progress.settings.sound=true;__audio.unlock()');settled();unmuted=measure(3)

    page.evaluate("""() => {
      const g=__game,e=g.enemies[0];e.hp=1;Object.assign(e,{state:'recovery',timer:2,vx:0});
      Object.assign(g.player,{x:e.x-62,y:e.y+e.h-44,vx:0,vy:0,facing:1});g.snapCamera();
    }""")
    page.keyboard.press('j')
    page.wait_for_function("()=>__game.flags.includes('boss.courtyard_keeper')&&__audio.musicTheme==='quarter'")
    page.wait_for_function('()=>__audio.ctx.currentTime>Math.max(__audio.quietUntil,__audio.musicReadyAt)+2.3')
    victory=measure(4)
    assert page.evaluate("()=>[...__audio.voices].every(v=>!['guitar','bass','kick','snare','cymbal'].includes(v.instrument))")
    page.evaluate("__game.loadRoom('V02')");page.wait_for_function("()=>__audio.musicKey==='station:V02'");settled()
    station=measure(4)
    page.evaluate('__game.debug.god=false;__game.die()');page.wait_for_function('()=>__audio.musicTheme===null')
    page.wait_for_timeout(400)
    assert page.evaluate("()=>[...__audio.voices].every(v=>v.channel!=='music')")
    page.locator('#respawn').click();settled();retry=measure(3)

    assert not errors,errors
    result=dict(exploration=exploration,transition=transition,rapidTransitions=rapid,lifts=lifts,
                boss=boss,chordGaps=gaps,recordedBossVoices=True,attackWarning='passed',
                pauseResume=resumed,muted=muted,unmuted=unmuted,victory=victory,
                station=station,respawn=retry,pageErrors=errors)
    (ARTIFACTS/'music-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print('CONTINUOUS HELD MUSIC / EXCLUSIVE TRANSITIONS / 12 BPM BOSS / PLAYFUL LIFT PASS')
    browser.close()
