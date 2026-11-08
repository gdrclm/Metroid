"""Measure real music output across bars, boss entry, pause, mute, and victory.

Requires the dev server, Python Playwright, and Chromium, like atmosphere_smoke.
The analyser connects to the music bus, so ambience cannot hide a silent score.
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
    browser = p.chromium.launch(
        executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
        headless=True, args=['--no-sandbox'],
    )
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL + '/?debug=1')
    page.wait_for_function('() => window.__game && window.__audio')
    page.locator('#play').click()
    page.wait_for_function("() => __audio.ctx.state === 'running'")
    page.evaluate("""() => {
      window.__musicLog = [];
      const voice = __audio.voice.bind(__audio);
      __audio.voice = options => {
        const result = voice(options);
        if (result && options.channel === 'music') __musicLog.push({
          theme: __audio.musicTheme, instrument: options.instrument,
          at: __audio.ctx.currentTime, score: options.score,
        });
        return result;
      };
      window.__musicMeter = __audio.ctx.createAnalyser();
      __musicMeter.fftSize = 2048;
      __audio.buses.music.connect(__musicMeter);
      window.__masterMeter = __audio.ctx.createAnalyser();
      __audio.master.connect(__masterMeter);
    }""")

    def measure(seconds, audible=True, master=False):
        result = page.evaluate("""async ({seconds, master}) => {
          const meter = master ? __masterMeter : __musicMeter;
          const data = new Float32Array(meter.fftSize), peaks = [];
          let maxVoices = 0, maxQueue = 0;
          for (let window = 0; window < seconds * 2; window++) {
            let peak = 0;
            for (let sample = 0; sample < 5; sample++) {
              await new Promise(r => setTimeout(r, 100));
              meter.getFloatTimeDomainData(data);
              peak = Math.max(peak, Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length));
              maxVoices = Math.max(maxVoices, __audio.voices.size);
              maxQueue = Math.max(maxQueue, __audio.queue.length);
            }
            peaks.push(peak);
          }
          return {minRms: Math.min(...peaks), maxRms: Math.max(...peaks),
            windows: peaks.length, maxVoices, maxQueue};
        }""", {'seconds': seconds, 'master': master})
        if audible:
            assert result['minRms'] > 0.00001, result
        else:
            assert result['maxRms'] < 0.00001, result
        assert result['maxVoices'] <= 24, result
        assert result['maxQueue'] <= 64, result
        print(json.dumps(result), flush=True)
        return result

    # Multiple complete bars, well past the reported 4–5 second cutoff.
    exploration = measure(18)
    instruments = page.evaluate("[...new Set(__musicLog.filter(n => n.score).map(n => n.instrument))]")
    assert set(instruments) == {'piano', 'violin'}, instruments
    exploration_rate = page.evaluate("__musicLog.filter(n => n.score).length / 18")

    # Use the real arena trigger; invulnerability only keeps this audio fixture alive.
    page.evaluate("""() => {
      const g = __game; g.loadRoom('R07'); g.debug.god = true;
      const e = g.enemies[0];
      Object.assign(g.player, {x: e.x - 200, y: e.y + e.h - 44});
      g.snapCamera();
    }""")
    page.wait_for_function("() => __game.arenaActive && __audio.musicTheme === 'boss'")
    boss = measure(10)
    battle_rate = page.evaluate("__musicLog.filter(n => n.score && n.theme === 'boss').length / 10")
    assert battle_rate > exploration_rate * 2, (exploration_rate, battle_rate)
    assert page.evaluate("['piano', 'violin'].every(i => __musicLog.some(n => n.theme === 'boss' && n.instrument === i))")

    page.keyboard.press('Escape')
    page.wait_for_function("() => __game.mode === 'pause'")
    before = page.evaluate('__musicLog.length')
    page.wait_for_timeout(1200)
    assert page.evaluate('__musicLog.length') == before
    page.locator('#resume').click()
    resumed = measure(3)

    page.evaluate('__game.progress.settings.sound = false; __audio.update()')
    page.wait_for_timeout(1600)
    muted = measure(1, audible=False, master=True)
    page.evaluate('__game.progress.settings.sound = true; __audio.unlock()')
    unmuted = measure(3)

    # Win through the actual attack path, and verify the battle score retires.
    page.evaluate("""() => {
      const g = __game, e = g.enemies[0]; e.hp = 1;
      Object.assign(e, {state: 'recovery', timer: 2, vx: 0});
      Object.assign(g.player, {x: e.x - 62, y: e.y + e.h - 44, vx: 0, vy: 0, facing: 1});
      g.snapCamera();
    }""")
    page.keyboard.press('j')
    page.wait_for_function("() => __game.flags.includes('boss.courtyard_keeper') && __audio.musicTheme === 'quarter'")
    # The story intentionally leaves three seconds of silence after victory.
    # Check that this bounded pause ends, rather than treating it as a dropout.
    page.wait_for_function(
        '() => __audio.ctx.currentTime > __audio.quietUntil + 0.2', timeout=5000,
    )
    victory = measure(3)
    page.evaluate("__game.loadRoom('V02')")
    page.wait_for_function("() => __audio.musicTheme === 'station'")
    station = measure(3)
    page.evaluate("__game.debug.god = false; __game.die()")
    page.wait_for_function('() => __audio.musicTheme === null')
    page.wait_for_timeout(400)
    assert page.evaluate("[...__audio.voices].every(v => v.channel !== 'music')")
    page.locator('#respawn').click()
    retry = measure(3)

    assert not errors, errors
    result = dict(exploration=exploration, boss=boss, instruments=instruments,
                  explorationNotesPerSecond=exploration_rate,
                  bossNotesPerSecond=battle_rate, pauseResume=resumed,
                  muted=muted, unmuted=unmuted, victory=victory,
                  station=station, respawn=retry, pageErrors=errors)
    (ARTIFACTS / 'music-results.json').write_text(json.dumps(result, indent=2) + '\n')
    print('CONTINUOUS PIANO / VIOLIN AND BOSS MUSIC PASS')
    browser.close()
