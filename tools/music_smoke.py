"""Verify sparse exploration phrases and slow, recorded boss instruments.

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
    page.wait_for_function("() => __audio.sampleState === 'ready'", timeout=15000)
    page.evaluate("""() => {
      window.__musicLog = [];
      window.__instrumentMeters = {};
      const voice = __audio.voice.bind(__audio);
      __audio.voice = options => {
        const result = voice(options);
        if (result && options.channel === 'music') {
          __musicLog.push({
            theme: __audio.musicTheme, instrument: options.instrument,
            at: __audio.ctx.currentTime, score: options.score,
            frequency: options.frequency, duration: options.duration,
            sample: result.sample, sourceType: result.source.constructor.name,
          });
          if (options.instrument) {
            const meter = __instrumentMeters[options.instrument] ??= __audio.ctx.createAnalyser();
            result.gain.connect(meter);
          }
        }
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
          const instrumentRms = {};
          for (let window = 0; window < seconds * 2; window++) {
            let peak = 0;
            for (let sample = 0; sample < 5; sample++) {
              await new Promise(r => setTimeout(r, 100));
              meter.getFloatTimeDomainData(data);
              peak = Math.max(peak, Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length));
              maxVoices = Math.max(maxVoices, __audio.voices.size);
              maxQueue = Math.max(maxQueue, __audio.queue.length);
              for (const [instrument, analyser] of Object.entries(__instrumentMeters)) {
                analyser.getFloatTimeDomainData(data);
                const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
                instrumentRms[instrument] = Math.max(instrumentRms[instrument] || 0, rms);
              }
            }
            peaks.push(peak);
          }
          return {minRms: Math.min(...peaks), maxRms: Math.max(...peaks),
            silentWindows: peaks.filter(v => v < 0.00001).length,
            windows: peaks.length, maxVoices, maxQueue, instrumentRms};
        }""", {'seconds': seconds, 'master': master})
        if audible == 'sparse':
            assert result['maxRms'] > 0.00001 and result['silentWindows'] >= 6, result
        elif audible == 'some':
            assert result['maxRms'] > 0.00001, result
        elif audible:
            assert result['minRms'] > 0.00001, result
        else:
            assert result['maxRms'] < 0.00001, result
        assert result['maxVoices'] <= 24, result
        assert result['maxQueue'] <= 64, result
        print(json.dumps(result), flush=True)
        return result

    # Intentional silence must return between phrases, and music must recur.
    page.evaluate("__game.loadRoom('P02'); __audio.setScore(null)")
    exploration = measure(34, audible='sparse')
    instruments = page.evaluate("[...new Set(__musicLog.filter(n => n.score).map(n => n.instrument))]")
    assert set(instruments) == {'piano', 'violin'}, instruments
    exploration_notes = page.evaluate("__musicLog.filter(n => n.score)")
    assert 4 <= len(exploration_notes) <= 5, exploration_notes
    assert exploration_notes[-1]['at'] - exploration_notes[0]['at'] > 27
    exploration_rate = len(exploration_notes) / 34

    # Use the real arena trigger; invulnerability only keeps this audio fixture alive.
    page.evaluate("""() => {
      const g = __game; g.loadRoom('R07'); g.debug.god = true;
      const e = g.enemies[0];
      Object.assign(g.player, {x: e.x - 200, y: e.y + e.h - 44});
      g.snapCamera();
    }""")
    page.wait_for_function("() => __game.arenaActive && __audio.musicTheme === 'boss'")
    boss = measure(12)
    metal_instruments = ['guitar', 'bass', 'kick', 'snare', 'hihat', 'cymbal']
    for instrument in metal_instruments:
        assert boss['instrumentRms'].get(instrument, 0) > 0.0001, (instrument, boss)
    # The dense mix must still give attack warnings priority over music.
    assert page.evaluate("""() => {
      __audio.play('keeperWaveReady');
      return __audio.voices.size <= 24 && [...__audio.voices].some(v => v.priority === 100);
    }""")
    battle_notes = page.evaluate("__musicLog.filter(n => n.score && n.theme === 'boss')")
    assert all(n['sample'] and n['sourceType'] == 'AudioBufferSourceNode' for n in battle_notes), battle_notes
    chord_times = []
    for n in sorted((n for n in battle_notes if n['instrument'] == 'guitar'), key=lambda n: n['at']):
        if not chord_times or n['at'] - chord_times[-1] > 0.12:
            chord_times.append(n['at'])
    assert 4 <= len(chord_times) <= 7, chord_times
    chord_gaps = [b-a for a, b in zip(chord_times, chord_times[1:])]
    assert min(chord_gaps) > 1.2, chord_gaps
    assert max(n['duration'] for n in battle_notes if n['instrument'] == 'guitar') > 2.8

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
    victory = measure(6, audible='some')
    assert page.evaluate("""() => [...__audio.voices].every(v =>
      !['guitar', 'bass', 'kick', 'snare', 'hihat', 'cymbal'].includes(v.instrument))""")
    page.evaluate("__game.loadRoom('V02')")
    page.wait_for_function("() => __audio.musicTheme === 'station'")
    station = measure(4, audible='some')
    page.evaluate("__game.debug.god = false; __game.die()")
    page.wait_for_function('() => __audio.musicTheme === null')
    page.wait_for_timeout(400)
    assert page.evaluate("[...__audio.voices].every(v => v.channel !== 'music')")
    page.locator('#respawn').click()
    retry = measure(3, audible='some')

    assert not errors, errors
    result = dict(exploration=exploration, boss=boss, instruments=instruments,
                  metalInstruments=metal_instruments, attackWarning='passed',
                  explorationNotesPerSecond=exploration_rate,
                  slowChordGaps=chord_gaps, recordedBossVoices=True, pauseResume=resumed,
                  muted=muted, unmuted=unmuted, victory=victory,
                  station=station, respawn=retry, pageErrors=errors)
    (ARTIFACTS / 'music-results.json').write_text(json.dumps(result, indent=2) + '\n')
    print('SPARSE EXPLORATION / SLOW RECORDED BOSS MUSIC PASS')
    browser.close()
