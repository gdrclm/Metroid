export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.ambient = null;
  }
  unlock() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        const n = this.ctx.sampleRate * 3,
          buffer = this.ctx.createBuffer(1, n, this.ctx.sampleRate),
          data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < n; i++) {
          last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
          data[i] = last;
        }
        this.ambient = this.ctx.createBufferSource();
        this.ambient.buffer = buffer;
        this.ambient.loop = true;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 340;
        this.ambientFilter = filter;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.24;
        this.ambient.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        this.ambient.start();
      }
      this.ctx.resume().catch(() => {});
      this.update();
    } catch {
      /* Audio is optional; all important cues are also visible. */
    }
  }
  update(paused = false) {
    if (this.master)
      this.master.gain.setTargetAtTime(
        this.settings.sound ? (paused ? 0.12 : 0.32) * this.settings.volume : 0,
        this.ctx.currentTime,
        0.15,
      );
  }
  setRegion(region) {
    if (this.ambientFilter)
      this.ambientFilter.frequency.setTargetAtTime(
        { pier: 340, station: 180, quarter: 510 }[region] || 340,
        this.ctx.currentTime,
        0.8,
      );
  }
  play(name) {
    if (!this.ctx || !this.settings.sound || this.ctx.state !== "running")
      return;
    const notes = {
      jump: [260, 420, 0.12, "sine"],
      land: [100, 65, 0.07, "triangle"],
      dash: [560, 95, 0.19, "sawtooth"],
      wallGrip: [160, 220, 0.1, "triangle"],
      wallJump: [280, 530, 0.1, "triangle"],
      attack: [320, 70, 0.09, "triangle"],
      hit: [130, 45, 0.14, "square"],
      hurt: [90, 38, 0.23, "sawtooth"],
      rest: [330, 660, 0.65, "sine"],
      ability: [440, 880, 1.1, "sine"],
      lever: [180, 340, 0.45, "triangle"],
      pickup: [650, 1100, 0.4, "sine"],
      dashRecharge: [700, 950, 0.07, "sine"],
      step: [80, 60, 0.025, "triangle"],
      death: [150, 30, 0.8, "sine"],
      keeperWave: [72, 34, 0.45, "sawtooth"],
      keeperLunge: [220, 90, 0.2, "triangle"],
      keeperWaveReady: [95, 60, 0.6, "triangle"],
      keeperLungeReady: [280, 380, 0.5, "sine"],
      horizonGardens: [600, 820, 0.8, "sine"],
      horizonForge: [60, 110, 0.8, "triangle"],
      horizonArchive: [160, 95, 1.1, "sine"],
    };
    const [from, to, duration, type] = notes[name] || notes.pickup,
      now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(),
      gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
      name === "step" ? 0.08 : 0.28,
      now + 0.012,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}
