import { overlaps } from "../core.js";
import { lineBlocked } from "../physics.js";

// Hearing gives a warning, never an exact hidden target or a navigable surface.
export function perceive(g) {
  const p = g.player,
    eye = { x: p.x + p.w / 2, y: p.y + p.h / 2 },
    range = 380;
  const view = {
    x: g.camera.x,
    y: g.camera.y,
    w: g.viewport.w,
    h: g.viewport.h,
  };
  const inView = (e) =>
    overlaps({ x: e.x - 2, y: e.y - 2, w: e.w || 4, h: e.h || 4 }, view);
  const nearby = (e) => Math.hypot(e.x - eye.x, e.y - eye.y) < range;
  const seen = (e) =>
    nearby(e) &&
    inView(e) &&
    !lineBlocked(
      eye,
      { x: e.x + (e.w || 0) / 2, y: e.y + (e.h || 0) / 2 },
      g.surfaces,
    );
  const surfaces = g.surfaces
    .filter(
      (s) =>
        overlaps(s, {
          x: eye.x - range,
          y: eye.y - range,
          w: range * 2,
          h: range * 2,
        }) && overlaps(s, view),
    )
    .map((s) => ({ ...s }));
  const enemies = g.enemies
    .filter((e) => e.hp > 0 && seen(e))
    .map((e) => ({
      id: e.id,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
      vx: e.vx,
      vy: e.vy,
      state: e.state,
      timer: e.timer,
      enemyType: e.enemyType,
    }));
  const projectiles = g.projectiles
    .filter(seen)
    .map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h, vx: s.vx, vy: s.vy }));
  const objects = g.room.entities
    .filter(
      (e) =>
        !["enemy", "ability", "pickup"].includes(e.type) &&
        seen({ ...e, y: e.y - 22, h: 22 }),
    )
    .map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, title: e.title }));
  const heard = g.enemies
    .filter(
      (e) =>
        e.hp > 0 &&
        ["windup", "attack", "lunge"].includes(e.state) &&
        nearby(e) &&
        !enemies.some((v) => v.id === e.id),
    )
    .map((e) => ({ id: e.id, kind: "attack_warning" }));
  return { surfaces, enemies, projectiles, objects, heard, view, eye, range };
}

export function immediateThreat(g, sense) {
  const p = g.player,
    cx = p.x + p.w / 2,
    cy = p.y + p.h / 2,
    candidates = [];
  for (const s of sense.projectiles) {
    if (Math.abs(s.vx) < 1) continue;
    const t = (cx - s.x) / s.vx;
    if (
      t < 0 ||
      t > 0.55 ||
      Math.abs(s.y + s.vy * t - cy) > p.h / 2 + (s.h || 8)
    )
      continue;
    candidates.push({
      kind: "projectile",
      x: s.x,
      time: t,
      score: 140 - t * 100,
    });
  }
  for (const e of sense.enemies) {
    const dx = e.x + e.w / 2 - cx,
      dy = Math.abs(e.y + e.h - p.y - p.h);
    if (dy > 70) continue;
    if (["attack", "lunge"].includes(e.state) && Math.abs(dx) < 220)
      candidates.push({
        kind: "attack",
        x: e.x + e.w / 2,
        time: 0.05,
        score: 150,
      });
    else if (e.state === "windup" && e.timer < 0.6 && Math.abs(dx) < 240)
      candidates.push({
        kind: "windup",
        x: e.x + e.w / 2,
        time: e.timer,
        score: 110 - e.timer * 30,
      });
    else if (Math.abs(dx) < 145)
      candidates.push({ kind: "enemy", x: e.x + e.w / 2, time: 1, score: 50 });
  }
  return candidates.sort((a, b) => b.score - a.score)[0] || null;
}
