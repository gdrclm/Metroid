import { overlaps } from "./core.js";

export const PARTICLE_LIMIT = 160;
const palette = {
  spray: "#a9c8bf",
  drip: "#83b7b7",
  dust: "#c6bc92",
  steam: "#b8c7b4",
  soot: "#34494a",
  rust: "#b38b59",
  fiber: "#bab79b",
  spark: "#e9c68b",
  dash: "#8ec3c2",
  recharge: "#b4d9c6",
  hurt: "#c78e78",
  impact: "#dfc38c",
};
const settings = {
  spray: [100, 150, 2],
  drip: [130, 30, 1.5],
  dust: [-2, 8, 1.5],
  steam: [-16, -8, 5],
  soot: [-22, 0, 2.5],
  rust: [95, 210, 2],
  fiber: [-4, 12, 3],
  spark: [70, 170, 2],
  dash: [0, 0, 2],
  recharge: [-18, 0, 2],
  hurt: [0, 100, 3],
  impact: [70, 150, 2],
};
export class Particles {
  constructor(game, random = Math.random) {
    this.game = game;
    this.random = random;
    this.clocks = new Map();
  }
  load() {
    this.clocks.clear();
  }
  range(a, b) {
    return a + (b - a) * this.random();
  }
  visible(e) {
    const g = this.game;
    return overlaps(
      {
        x: e.x - 120,
        y: e.y - 120,
        w: (e.area?.w || 0) + 240,
        h: (e.area?.h || 0) + 240,
      },
      { ...g.camera, ...g.viewport },
    );
  }
  emit(e, count = 1, priority = 0) {
    if (!priority && !this.visible(e)) return;
    const g = this.game,
      low = g.progress.settings.particleQuality === "low";
    const amount = Math.max(
      priority ? 1 : 0,
      Math.round(count * (low ? (priority ? 0.7 : 0.35) : 1)),
    );
    for (let i = 0; i < amount; i++) {
      const decorative = g.particles.filter((p) => !p.priority).length;
      if (!priority && decorative >= (low ? 32 : 88)) break;
      if (g.particles.length >= PARTICLE_LIMIT) {
        const oldest = g.particles.findIndex(
          (p) => (p.priority || 0) < priority,
        );
        if (oldest < 0) break;
        g.particles.splice(oldest, 1);
      }
      const kind = e.effect || "dust",
        spec = settings[kind] || settings.impact;
      const speed = this.range(...(e.speed || [12, 42]));
      const angle = e.spread === 0 ? 0 : this.range(-1, 1) * (e.spread ?? 0.8);
      const direction = e.direction || { x: 0, y: -1 };
      const dx = direction.x * Math.cos(angle) - direction.y * Math.sin(angle);
      const dy = direction.x * Math.sin(angle) + direction.y * Math.cos(angle);
      const life = this.range(...(e.life || [0.45, 1.1]));
      g.particles.push({
        x: e.x + this.range(0, e.area?.w || 0),
        y: e.y + this.range(0, e.area?.h || 0),
        vx: dx * speed,
        vy: dy * speed + (kind === "drip" ? 65 : spec[0]),
        gravity: e.gravity ?? spec[1],
        life,
        maxLife: life,
        size: e.size || spec[2],
        color: e.color || palette[kind] || palette.dust,
        kind,
        priority,
        layer: e.layer || (priority ? "gameplay" : "back"),
        bounds:
          kind === "dust"
            ? { x: e.x, y: e.y, w: e.area?.w || 120, h: e.area?.h || 180 }
            : null,
        floor: e.floor,
        drag: kind === "steam" ? 0.7 : 0.12,
      });
    }
  }
  burst(effect, x, y, count, extra = {}) {
    this.emit({ effect, x, y, ...extra }, count, extra.priority ?? 2);
  }
  update(dt) {
    const g = this.game;
    for (const e of g.room.emitters || []) {
      if (
        e.mode === "burst" ||
        !g.atmosphere.condition(e.requires) ||
        !this.visible(e)
      )
        continue;
      let clock = (this.clocks.get(e.id) ?? this.range(0.05, 0.7)) - dt;
      if (clock <= 0) {
        this.emit(e, 1);
        clock += this.range(0.6, 1.4) / Math.max(0.1, e.rate || 1);
      }
      this.clocks.set(e.id, clock);
    }
    const wind = g.atmosphere.wind.x;
    for (const p of g.particles) {
      p.vx +=
        (["fiber", "steam", "soot", "dust", "spray", "dash"].includes(p.kind)
          ? wind * 0.32
          : wind * 0.03) * dt;
      p.vx *= Math.exp(-(p.drag || 0) * dt);
      p.vy += (p.gravity ?? 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (
        p.bounds &&
        !overlaps({ x: p.x, y: p.y, w: p.size, h: p.size }, p.bounds)
      )
        p.life = 0;
      if (p.floor !== undefined && p.y >= p.floor) p.life = 0;
    }
    g.particles = g.particles.filter((p) => p.life > 0);
  }
}

export function drawParticles(c, game, layer) {
  const reduced = game.progress.settings.reducedFlash;
  for (const p of game.particles) {
    if ((p.layer || "gameplay") !== layer) continue;
    // Ambient detail yields to the hero and never masks a combat telegraph.
    if (
      !p.priority &&
      (overlaps({ x: p.x - 8, y: p.y - 8, w: 16, h: 16 }, game.player) ||
        game.enemies.some(
          (e) =>
            ["windup", "attack"].includes(e.state) &&
            overlaps({ x: p.x - 18, y: p.y - 18, w: 36, h: 36 }, e),
        ))
    )
      continue;
    const fade = Math.min(1, p.life / Math.min(0.4, p.maxLife || 0.4));
    c.save();
    c.globalAlpha = fade * (p.priority ? (reduced ? 0.45 : 0.8) : 0.28);
    c.fillStyle = p.color;
    c.strokeStyle = p.color;
    if (["drip", "spray", "spark", "dash"].includes(p.kind)) {
      c.lineWidth = p.size;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x - p.vx * 0.035, p.y - Math.max(p.vy * 0.035, 3));
      c.stroke();
    } else if (p.kind === "steam") {
      const age = 1 - p.life / p.maxLife;
      c.beginPath();
      c.ellipse(
        p.x,
        p.y,
        p.size * (1 + age * 2),
        p.size * (2 + age),
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
    } else c.fillRect(p.x, p.y, p.size, p.size);
    c.restore();
  }
}
