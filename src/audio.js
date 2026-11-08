import { clamp } from "./core.js";
import { lineBlocked } from "./physics.js";
import { musicBar } from "./music.js";

export const VOICE_LIMIT = 24;
export const CHANNELS = ["music", "ambience", "actions", "interface"];
export function audibility(source, listener, surfaces) {
  const distance = Math.hypot(source.x - listener.x, source.y - listener.y);
  const radius = source.radius || 420;
  const blocked = distance < radius && lineBlocked(listener, source, surfaces);
  return {
    gain:
      Math.pow(Math.max(0, 1 - distance / radius), 2) * (blocked ? 0.22 : 1),
    pan: clamp((source.x - listener.x) / radius, -0.85, 0.85),
    blocked,
  };
}
const sounds = {
  jump: [260, 420, 0.12, "sine"],
  land: [100, 65, 0.09, "triangle"],
  dash: [560, 95, 0.19, "sawtooth"],
  wallGrip: [160, 220, 0.1, "triangle"],
  wallJump: [280, 530, 0.1, "triangle"],
  attack: [320, 70, 0.09, "triangle"],
  hit: [130, 45, 0.14, "square"],
  hurt: [90, 38, 0.23, "sawtooth"],
  rest: [330, 660, 0.65, "sine"],
  ability: [440, 880, 0.65, "sine"],
  lever: [180, 340, 0.45, "triangle"],
  pickup: [650, 1100, 0.4, "sine"],
  dashRecharge: [700, 950, 0.07, "sine"],
  step: [80, 60, 0.06, "triangle"],
  death: [150, 30, 0.8, "sine"],
  keeperWave: [72, 34, 0.45, "sawtooth"],
  keeperLunge: [220, 90, 0.2, "triangle"],
  keeperWaveReady: [95, 60, 0.6, "triangle"],
  keeperLungeReady: [280, 380, 0.5, "sine"],
  horizonGardens: [600, 820, 0.8, "sine"],
  horizonForge: [60, 110, 0.8, "triangle"],
  horizonArchive: [160, 95, 1.1, "sine"],
  rope: [145, 75, 0.48, "triangle"],
  hull: [75, 48, 0.75, "sine"],
  bell: [440, 435, 2.3, "sine"],
  clock: [900, 730, 0.035, "triangle"],
  board: [420, 280, 0.045, "square"],
  coupling: [90, 50, 0.8, "sawtooth"],
  crockery: [1100, 760, 0.13, "sine"],
  cloth: [110, 90, 0.2, "triangle"],
  shutter: [140, 60, 0.3, "triangle"],
  pipe: [210, 145, 0.35, "sine"],
  kettle: [1100, 1300, 0.45, "sine"],
  footstepsAbove: [115, 95, 0.09, "triangle"],
  boat: [120, 45, 5, "sine"],
  fire: [80, 55, 0.15, "triangle"],
  greeting: [250, 330, 0.25, "sine"],
  liftStart: [55, 120, 1.1, "sawtooth"],
  liftStop: [120, 50, 0.7, "triangle"],
  grate: [135, 45, 0.8, "sawtooth"],
  ladder: [180, 55, 0.95, "triangle"],
  roomBloom: [100, 160, 1.4, "sine"],
  ui: [560, 700, 0.045, "sine"],
};
const scores = {
  arrival: [220, 261.63, 329.63],
  warm: [220, 261.63, 329.63, 293.66],
  ability: [329.63, 440, 523.25, 659.25],
  return: [293.66, 261.63, 220, 329.63],
  ascent: [146.83, 220, 293.66, 329.63],
  quarter: [220, 293.66, 261.63],
  victory: [261.63, 329.63, 440, 392],
  panorama: [220, 261.63, 329.63, 293.66, 220, 392, 329.63, 440],
};
const noiseKinds = new Set([
  "water",
  "wind",
  "ventilation",
  "stove",
  "steam",
  "murmur",
  "rain",
]);
export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.voices = new Set();
    this.beds = [];
    this.local = new Map();
    this.deadlines = new Map();
    this.recent = new Map();
    this.queue = [];
    this.duckUntil = 0;
    this.quietUntil = 0;
    this.roomId = null;
    this.musicTheme = null;
    this.musicCursor = 0;
    this.musicBar = 0;
    this.waveforms = new Map();
    this.driveCurves = new Map();
    this.elapsed = 0;
    this.debugSources = [];
    this.dropped = 0;
    this.paused = false;
    this.strings = new Map();
  }
  unlock() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const c = this.ctx;
        this.master = c.createGain();
        this.master.connect(c.destination);
        this.buses = {};
        for (const channel of CHANNELS) {
          const node = c.createGain();
          node.connect(this.master);
          this.buses[channel] = node;
        }
        const n = c.sampleRate * 3,
          buffer = c.createBuffer(1, n, c.sampleRate),
          data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < n; i++) {
          last = (last + (Math.random() * 2 - 1) * 0.04) / 1.02;
          data[i] = last;
        }
        this.noise = buffer;
        this.percussionNoise = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const percussion = this.percussionNoise.getChannelData(0);
        for (let i = 0; i < percussion.length; i++)
          percussion[i] = Math.random() * 2 - 1;
        const impulse = c.createBuffer(1, c.sampleRate * 1.6, c.sampleRate),
          a = impulse.getChannelData(0);
        for (let i = 0; i < a.length; i++)
          a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / a.length, 3) * 0.35;
        this.reverb = c.createConvolver();
        this.reverb.buffer = impulse;
        this.reverbGain = c.createGain();
        this.reverbGain.gain.value = 0.04;
        this.buses.actions.connect(this.reverb);
        this.reverb.connect(this.reverbGain);
        this.reverbGain.connect(this.master);
      }
      this.ctx.resume().catch(() => {});
      this.update(this.paused);
    } catch {
      /* Visual cues remain available when audio is unsupported. */
    }
  }
  update(paused = this.paused) {
    if (!this.master) return;
    const now = this.ctx.currentTime,
      duck = now < this.duckUntil ? (this.musicTheme === "boss" ? 0.6 : 0.28) : 1;
    if (paused && !this.paused) this.pausedAt = now;
    if (!paused && this.paused) {
      const delta = now - (this.pausedAt ?? now);
      for (const note of this.queue) note.at += delta;
      this.musicCursor += delta;
      this.quietUntil += delta;
      this.duckUntil += delta;
    }
    this.paused = paused;
    this.master.gain.setTargetAtTime(
      this.settings.sound ? (paused ? 0.12 : 0.45) * this.settings.volume : 0,
      now,
      0.12,
    );
    for (const name of CHANNELS)
      this.buses[name].gain.setTargetAtTime(
        (this.settings.mix?.[name] ?? (name === "music" ? 0.65 : 0.85)) *
          (name === "music" || name === "ambience" ? duck : 1),
        now,
        0.08,
      );
  }
  variant(name) {
    const recent = this.recent.get(name) || [],
      available = [0.86, 0.96, 1.07, 1.16].filter((v) => !recent.includes(v));
    const chosen = available[Math.floor(Math.random() * available.length)];
    this.recent.set(name, [...recent.slice(-1), chosen]);
    return chosen;
  }
  release(v, fade = 0) {
    if (v.released && fade) return;
    v.released = true;
    if (fade && this.ctx) {
      v.gain.gain.cancelAndHoldAtTime(this.ctx.currentTime);
      v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
      try {
        v.source.stop(this.ctx.currentTime + fade);
      } catch {}
    } else {
      this.voices.delete(v);
      try {
        v.source.stop();
      } catch {}
      v.cleanup();
    }
  }
  pluckedString(frequency, duration) {
    const key = frequency + ":" + duration;
    if (this.strings.has(key)) return this.strings.get(key);
    const c = this.ctx,
      buffer = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
    const data = buffer.getChannelData(0),
      delay = new Float32Array(Math.round(c.sampleRate / frequency));
    for (let i = 0; i < delay.length; i++)
      delay[i] = (Math.random() * 2 - 1) * 0.5;
    for (
      let i = 0, head = 0;
      i < data.length;
      i++, head = (head + 1) % delay.length
    ) {
      data[i] = delay[head];
      delay[head] = (delay[head] + delay[(head + 1) % delay.length]) * 0.497;
    }
    if (this.strings.size >= 16)
      this.strings.delete(this.strings.keys().next().value);
    this.strings.set(key, buffer);
    return buffer;
  }
  instrumentWave(instrument) {
    if (!this.waveforms.has(instrument)) {
      // Struck piano, bowed violin and picked strings remain procedural.
      const partials = {
        piano: [0, 1, 0.48, 0.22, 0.12, 0.055, 0.025],
        violin: [0, 1, 0.6, 0.42, 0.3, 0.2, 0.14, 0.1, 0.07],
        guitar: [0, 1, 0.65, 0.5, 0.32, 0.27, 0.2, 0.16, 0.12, 0.1],
        bass: [0, 1, 0.6, 0.25, 0.12],
      }[instrument];
      this.waveforms.set(
        instrument,
        this.ctx.createPeriodicWave(
          new Float32Array(partials.length),
          new Float32Array(partials),
        ),
      );
    }
    return this.waveforms.get(instrument);
  }
  driveCurve(instrument) {
    if (!this.driveCurves.has(instrument)) {
      const drive = instrument === "guitar" ? 8 : 2.5,
        curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++)
        curve[i] =
          Math.tanh((i * 2 / (curve.length - 1) - 1) * drive) / Math.tanh(drive);
      this.driveCurves.set(instrument, curve);
    }
    return this.driveCurves.get(instrument);
  }
  voice({
    frequency = 120,
    to = frequency,
    duration = 0.2,
    type = "sine",
    channel = "actions",
    priority = 60,
    gain = 0.16,
    noise = false,
    pluck = false,
    loop = false,
    pan = 0,
    filter = 5000,
    when = 0,
    owner = null,
    instrument = null,
    score = false,
  }) {
    if (!this.ctx || !this.settings.sound || this.ctx.state !== "running")
      return null;
    if (this.voices.size >= VOICE_LIMIT) {
      const victim = [...this.voices].sort(
        (a, b) => a.priority - b.priority,
      )[0];
      if (victim.priority > priority) {
        this.dropped++;
        return null;
      }
      this.release(victim);
    }
    const percussion = ["snare", "hihat", "cymbal"].includes(instrument),
      distorted = instrument === "guitar" || instrument === "bass",
      c = this.ctx,
      at = c.currentTime + when,
      source = noise || pluck || percussion
        ? c.createBufferSource() : c.createOscillator(),
      volume = c.createGain(),
      lowpass = c.createBiquadFilter(),
      panner = c.createStereoPanner();
    if (noise || pluck || percussion) {
      source.buffer = pluck
        ? this.pluckedString(frequency, duration)
        : percussion
          ? this.percussionNoise
          : this.noise;
      source.loop = loop;
      source.playbackRate.value = pluck || percussion ? 1 : frequency / 120;
    } else {
      if (instrument) source.setPeriodicWave(this.instrumentWave(instrument));
      else source.type = type;
      source.frequency.setValueAtTime(Math.max(20, frequency), at);
      source.frequency.exponentialRampToValueAtTime(
        Math.max(20, to),
        at + Math.max(0.02, duration),
      );
    }
    lowpass.type = "lowpass";
    const cutoff =
      { piano: 4200, guitar: 3500, bass: 900, snare: 6500, hihat: 11000, cymbal: 10000 }[instrument]
      ?? filter;
    lowpass.frequency.setValueAtTime(cutoff, at);
    if (instrument === "piano")
      lowpass.frequency.exponentialRampToValueAtTime(700, at + duration);
    if (instrument === "guitar")
      lowpass.frequency.exponentialRampToValueAtTime(850, at + duration);
    panner.pan.value = pan;
    volume.gain.setValueAtTime(0, at);
    const bowed = instrument === "violin",
      attack = bowed ? Math.min(0.12, duration * 0.25) : loop ? 0.25 : 0.008;
    volume.gain.linearRampToValueAtTime(gain, at + attack);
    if (bowed) {
      volume.gain.setValueAtTime(gain * 0.85, at + duration * 0.65);
      volume.gain.linearRampToValueAtTime(0.0001, at + duration);
    } else if (!loop)
      volume.gain.exponentialRampToValueAtTime(
        0.0001,
        at + Math.max(0.03, duration),
      );
    let drive, highpass;
    if (distorted || percussion) {
      highpass = c.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = {
        guitar: 70, bass: 25, snare: 600, hihat: 6500, cymbal: 3500,
      }[instrument];
      if (distorted) {
        drive = c.createWaveShaper();
        drive.curve = this.driveCurve(instrument);
        drive.oversample = "2x";
        source.connect(drive);
        drive.connect(highpass);
      } else source.connect(highpass);
      highpass.connect(lowpass);
    } else source.connect(lowpass);
    lowpass.connect(volume);
    volume.connect(panner);
    panner.connect(this.buses[channel]);
    let vibrato, vibratoDepth;
    if (bowed) {
      vibrato = c.createOscillator();
      vibratoDepth = c.createGain();
      vibrato.frequency.value = 5.3;
      vibratoDepth.gain.setValueAtTime(0, at);
      vibratoDepth.gain.linearRampToValueAtTime(
        9, at + Math.min(0.3, duration / 2),
      );
      vibrato.connect(vibratoDepth);
      vibratoDepth.connect(source.detune);
      vibrato.start(at);
      vibrato.stop(at + duration + 0.03);
    }
    const v = {
      source,
      gain: volume,
      filter: lowpass,
      panner,
      priority,
      channel,
      owner,
      instrument,
      score,
      loop,
      released: false,
      endsAt: loop ? Infinity : at + duration + 0.03,
      cleanup: () => {
        if (vibrato) {
          try {
            vibrato.stop();
          } catch {}
          vibrato.disconnect();
          vibratoDepth.disconnect();
        }
        source.disconnect();
        drive?.disconnect();
        highpass?.disconnect();
        lowpass.disconnect();
        volume.disconnect();
        panner.disconnect();
      },
    };
    source.onended = () => {
      this.voices.delete(v);
      v.released = true;
      v.cleanup();
    };
    this.voices.add(v);
    source.start(at);
    if (!loop) source.stop(v.endsAt);
    return v;
  }
  motif(name, delay = 0, owner = null) {
    const score = scores[name];
    if (!score || !this.ctx || this.musicTheme === "boss") return;
    const start = this.ctx.currentTime + delay;
    // Bound queued music when events follow each other rapidly.
    const motifs = this.queue.filter((note) => !note.score).slice(-24);
    this.queue = this.queue.filter((note) => note.score || motifs.includes(note));
    score.forEach((frequency, i) =>
      this.queue.push({
        at: start + i * 0.43,
        frequency,
        warm: name === "warm" || name === "quarter",
        owner,
      }),
    );
  }
  play(name, options = {}) {
    if (!this.ctx || !this.settings.sound || this.ctx.state !== "running")
      return;
    if (name.startsWith("music.")) {
      const motif = name.slice(6);
      this.motif(motif, options.delay || 0, options.sceneId);
      return;
    }
    if (name === "silence") {
      this.queue = [];
      this.quietUntil = this.ctx.currentTime + (options.duration || 3);
      return;
    }
    const warning = name.startsWith("keeper"),
      spec = sounds[name];
    if (!spec && !noiseKinds.has(name)) return;
    if (name === "ability") this.motif("ability", 0.05);
    if (warning) {
      this.duckUntil = this.ctx.currentTime + 1.1;
      this.update();
    }
    if (options.duck) {
      this.duckUntil = this.ctx.currentTime + options.duck;
      this.update();
    }
    const [from, to, duration, type] = spec || [120, 120, 0.5, "sine"],
      factor = this.variant(name + (options.material || ""));
    let gain = name === "step" ? 0.1 : warning ? 0.23 : 0.15;
    if (options.gain !== undefined) gain *= options.gain;
    let spatial = { gain: 1, pan: 0, blocked: false };
    if (
      this.listener &&
      options.x !== undefined &&
      (!options.roomId || options.roomId === this.roomId)
    )
      spatial = audibility(
        { ...options, radius: options.radius || 650 },
        this.listener,
        this.surfaces || [],
      );
    const material = options.material || "stone",
      pitched = ["step", "land", "hit"].includes(name);
    const scale = pitched
      ? { wood: 0.8, wetWood: 0.65, metal: 2.1, stone: 0.95 }[material] || 1
      : 1;
    this.voice({
      frequency: from * factor * scale,
      to: to * factor * scale,
      duration: duration * (pitched && material === "metal" ? 1.4 : 1),
      type,
      noise: noiseKinds.has(name) || (pitched && material !== "metal"),
      channel: options.channel || (name === "ui" ? "interface" : "actions"),
      priority: warning ? 100 : options.priority || 60,
      gain: gain * spatial.gain,
      pan: spatial.pan,
      filter: spatial.blocked
        ? 550
        : pitched
          ? { wood: 900, wetWood: 650, metal: 3500, stone: 1800 }[material] ||
            1800
          : 5000,
      owner: options.sceneId,
    });
  }
  setRegion(region) {
    this.region = region;
  }
  resetJourney() {
    this.queue = [];
    for (const voice of this.voices) this.release(voice, 0.1);
    this.local.clear();
    this.beds = [];
    this.deadlines.clear();
    this.roomId = null;
    this.musicTheme = null;
    this.musicCursor = 0;
    this.musicBar = 0;
    this.quietUntil = 0;
    this.duckUntil = 0;
  }
  setScore(theme) {
    if (theme === this.musicTheme) return;
    this.musicTheme = theme;
    this.musicBar = 0;
    this.musicCursor = this.ctx.currentTime + 0.025;
    this.queue = this.queue.filter(
      (note) => !note.score && theme && theme !== "boss",
    );
    for (const voice of this.voices)
      if (
        voice.channel === "music" &&
        (voice.score || !theme || theme === "boss")
      )
        this.release(voice, 0.25);
  }
  scheduleScore(game) {
    const battle =
      game.arenaActive &&
      game.enemies.some((e) => e.enemyType === "keeper" && e.hp > 0);
    this.setScore(battle ? "boss" : game.room.regionId);
    if (!this.settings.sound || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    if (now < this.quietUntil && !battle) {
      this.musicCursor = this.quietUntil;
      return;
    }
    // A backgrounded tab or muted context must not replay a backlog of notes.
    if (this.musicCursor < now - 0.15) {
      this.queue = this.queue.filter((note) => !note.score);
      this.musicCursor = now + 0.025;
    }
    if (this.musicCursor <= now + 0.12) {
      const bar = musicBar(this.musicTheme, this.musicBar++);
      for (const note of bar.notes)
        this.queue.push({
          ...note, at: this.musicCursor + note.offset, score: true,
        });
      this.musicCursor += bar.duration;
    }
  }
  enterRoom(game) {
    const c = this.ctx,
      room = game.room;
    this.roomId = room.roomId;
    this.region = room.regionId;
    for (const v of this.beds) this.release(v, 0.9);
    this.beds = [];
    for (const v of this.local.values()) this.release(v, 0.45);
    this.local.clear();
    this.deadlines.clear();
    const profile = room.atmosphere || {},
      station = room.regionId === "station";
    const noise = this.voice({
      frequency: room.regionId === "pier" ? 85 : station ? 50 : 100,
      duration: 1,
      loop: true,
      noise: true,
      channel: "ambience",
      priority: 8,
      gain: 0,
      filter: room.regionId === "pier" ? 360 : station ? 190 : 500,
    });
    const hum = this.voice({
      frequency: station ? 55 : room.regionId === "quarter" ? 82 : 48,
      duration: 1,
      loop: true,
      channel: "ambience",
      priority: 9,
      gain: 0,
      type: "sine",
    });
    if (noise) {
      noise.gain.gain.setTargetAtTime(
        station ? 0.12 : 0.16,
        c.currentTime,
        0.65,
      );
      this.beds.push(noise);
    }
    if (hum) {
      hum.gain.gain.setTargetAtTime(
        station ? 0.025 : 0.012,
        c.currentTime,
        0.8,
      );
      this.beds.push(hum);
    }
    this.reverbGain.gain.setTargetAtTime(
      profile.reverb ?? (station ? 0.22 : 0.04),
      c.currentTime,
      0.6,
    );
    this.roomEntered = this.elapsed;
  }
  updateScene(game, dt) {
    if (!this.ctx) return;
    this.queue = this.queue.filter(
      (note) => !note.owner || game.atmosphere.active.has(note.owner),
    );
    for (const voice of this.voices)
      if (voice.owner && !game.atmosphere.active.has(voice.owner))
        this.release(voice, 0.18);
    this.listener = { x: game.player.x + 12, y: game.player.y + 22 };
    this.surfaces = game.surfaces;
    if (this.roomId !== game.room.roomId) this.enterRoom(game);
    this.update(!["playing", "title", "complete"].includes(game.mode));
    if (["playing", "complete"].includes(game.mode)) {
      this.scheduleScore(game);
      this.playScoreQueue();
    } else if (["death", "title"].includes(game.mode)) this.setScore(null);
    if (game.mode !== "playing") {
      this.debugSources = (game.room.audioSources || []).map((source) => ({
        ...source,
        ...{
          blocked: audibility(source, this.listener, this.surfaces).blocked,
          audible: 0,
        },
      }));
      return;
    }
    this.elapsed += dt;
    const now = this.ctx.currentTime;
    for (const v of this.voices)
      if (!v.loop && now > v.endsAt + 0.1) this.release(v);
    this.debugSources = [];
    const introduction =
      game.room.roomId === "V01"
        ? clamp((this.elapsed - this.roomEntered - 1) / 2, 0, 1)
        : 1;
    for (const source of game.room.audioSources || []) {
      const enabled = game.atmosphere.condition(source.requires),
        a = audibility(source, this.listener, this.surfaces);
      let fade = 1;
      if (source.sceneFade) fade = 1 - game.atmosphere.phase(source.sceneFade);
      const level = enabled
        ? a.gain * (source.gain ?? 1) * introduction * fade
        : 0;
      this.debugSources.push({ ...source, audible: level, blocked: a.blocked });
      if (source.loop) {
        let voice = this.local.get(source.id);
        if (voice?.released) {
          this.local.delete(source.id);
          voice = null;
        }
        if (level > 0.003 && !voice) {
          voice = this.voice({
            frequency: source.pitch || 120,
            loop: true,
            noise: true,
            channel: "ambience",
            priority: 12,
            gain: 0,
            filter: source.filter || 500,
          });
          if (voice) this.local.set(source.id, voice);
        }
        if (voice) {
          const motion =
            source.sound === "wind"
              ? 0.55 + game.atmosphere.wind.gust * 0.45
              : source.sound === "water"
                ? 0.75 + Math.sin(game.time * 1.7 + source.x) * 0.25
                : source.sound === "murmur"
                  ? 0.5 +
                    Math.abs(
                      Math.sin(game.time * 2.7) * Math.sin(game.time * 1.3),
                    ) *
                      0.5
                  : source.sound === "stove"
                    ? 0.8 + Math.sin(game.time * 7.1) * 0.15
                    : 1;
          voice.gain.gain.setTargetAtTime(level * 0.16 * motion, now, 0.15);
          voice.panner.pan.setTargetAtTime(a.pan, now, 0.15);
          voice.filter.frequency.setTargetAtTime(
            a.blocked ? 250 : source.filter || 700,
            now,
            0.15,
          );
          if (level < 0.001) this.release(voice, 0.4);
        }
      } else {
        const deadline =
          this.deadlines.get(source.id) ??
          this.elapsed + 0.5 + Math.random() * 2;
        if (this.elapsed >= deadline) {
          const interval = source.interval || [4, 9];
          this.deadlines.set(
            source.id,
            this.elapsed +
              interval[0] +
              Math.random() * (interval[1] - interval[0]),
          );
          if (level > 0.003) {
            if (source.duck) this.duckUntil = now + 0.8;
            this.play(source.sound, {
              ...source,
              roomId: game.room.roomId,
              channel: "ambience",
              gain: (source.gain ?? 1) * introduction * fade,
              priority: 20,
            });
          }
        } else this.deadlines.set(source.id, deadline);
      }
    }
  }
  playScoreQueue() {
    const now = this.ctx.currentTime;
    if (!this.settings.sound || this.ctx.state !== "running") {
      this.queue = this.queue.filter((note) => note.at > now);
      return;
    }
    for (const note of this.queue.filter((n) => n.at <= now + 0.12)) {
      if (note.at < now - 0.15) continue;
      this.voice({
        frequency: note.frequency,
        to: note.to ?? note.frequency * 0.999,
        duration: note.duration ?? (note.warm ? 1.8 : 2.4),
        type: note.type || "sine",
        instrument: note.score ? note.instrument : note.warm ? "piano" : "violin",
        gain: note.gain ?? 0.06,
        pan: note.pan || 0,
        channel: "music",
        priority: this.musicTheme === "boss" ? 45 : 35,
        owner: note.owner,
        when: Math.max(0, note.at - now),
        score: !!note.score,
      });
    }
    this.queue = this.queue.filter((n) => n.at > now + 0.12);
  }
  summary() {
    return {
      voices: this.voices.size,
      limit: VOICE_LIMIT,
      byChannel: Object.fromEntries(
        CHANNELS.map((k) => [
          k,
          [...this.voices].filter((v) => v.channel === k).length,
        ]),
      ),
      queuedNotes: this.queue.length,
      musicTheme: this.musicTheme,
      dropped: this.dropped,
      sources: this.debugSources.map((s) => ({
        id: s.id,
        gain: +s.audible.toFixed(3),
        blocked: s.blocked,
      })),
    };
  }
}
