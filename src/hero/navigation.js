import { clamp, overlaps } from "../core.js";
import { updatePlayer } from "../physics.js";
import { heroInput } from "./commands.js";

export function safeFooting(g, sense, x, feet = g.player.y + g.player.h) {
  const p = g.player,
    body = { x: x - p.w / 2, y: feet - p.h, w: p.w, h: p.h },
    knownIds = new Set(sense.surfaces.map((s) => s.id)),
    surfaces = g.surfaces.filter((s) => knownIds.has(s.id));
  if (body.x < 4 || body.x + body.w > g.room.worldBounds.w - 4) return "edge";
  if (
    surfaces.some(
      (s) => s.kind !== "oneWay" && s.kind !== "hazard" && overlaps(body, s),
    )
  )
    return "wall";
  if (
    surfaces.some(
      (s) =>
        s.kind === "hazard" &&
        overlaps({ ...body, x: body.x - 4, w: body.w + 8, h: body.h + 4 }, s),
    )
  )
    return "hazard";
  if (
    g.room.exits.some(
      (e) =>
        e.type === "passage" &&
        overlaps({ ...body, x: body.x - 28, w: body.w + 56 }, e.triggerZone),
    )
  )
    return "edge";
  const supports = surfaces.filter(
    (s) => s.kind !== "hazard" && Math.abs(s.y - feet) < 3,
  );
  if (
    ![x - p.w / 2 + 3, x, x + p.w / 2 - 3].every((px) =>
      supports.some((s) => px >= s.x + 2 && px <= s.x + s.w - 2),
    )
  )
    return "edge";
  if (
    x < sense.view.x + 8 ||
    x > sense.view.x + sense.view.w - 8 ||
    Math.abs(x - sense.eye.x) > sense.range - 16
  )
    return "unknown";
  for (const s of supports) {
    if (!s.id?.startsWith("guide.")) continue;
    const structure = g.guide.tools.structures.find((item) => item.id === s.id);
    if (structure && structure.life < 1) return "edge";
  }
  return null;
}
export function scanWalk(g, sense, target) {
  const start = g.player.x + g.player.w / 2,
    distance = target - start,
    steps = Math.max(1, Math.ceil(Math.abs(distance) / 8));
  let x = start;
  for (let i = 1; i <= steps; i++) {
    const next = start + (distance * i) / steps,
      reason = safeFooting(g, sense, next);
    if (reason) return { x, safe: false, reason, blockedX: next };
    const remembered = g.guide.state.autonomy?.hazards.find(
      (h) =>
        h.roomId === g.room.roomId &&
        ["edge", "hazard"].includes(h.kind) &&
        Math.abs(h.y - g.player.y - g.player.h) < 20 &&
        Math.abs(next - h.x) < 28 &&
        safeFooting(g, sense, h.x, h.y),
    );
    if (remembered)
      return {
        x,
        safe: false,
        reason: remembered.kind,
        blockedX: remembered.x,
        remembered: true,
      };
    if (
      sense.enemies.some(
        (e) =>
          Math.abs(e.x + e.w / 2 - next) < 60 &&
          Math.abs(e.y + e.h - g.player.y - g.player.h) < 70,
      )
    )
      return { x, safe: false, reason: "hazard", blockedX: next };
    x = next;
  }
  return { x, safe: true, reason: null };
}

// A single bounded physical trial, on known static terrain only. Never mutates
// the real body, learns abilities, creates input commands or changes the world.
export function simpleJump(g, sense, direction) {
  if (!g.player.grounded || sense.surfaces.some((s) => s.motion)) return null;
  const p = structuredClone(g.player),
    start = p.x + p.w / 2,
    startFeet = p.y + p.h;
  const physics = {
    ...g.config,
    maxSpeed: g.config.maxSpeed * g.guide.needs.stats.speed,
  };
  let airborne = false;
  for (let i = 0; i < 144; i++) {
    updatePlayer(
      p,
      heroInput(
        [direction > 0 ? "right" : "left", ...(i < 42 ? ["jump"] : [])],
        i === 0 ? ["jump"] : [],
      ),
      g.config.fixedStep,
      sense.surfaces,
      physics,
      { dash: false, wall_grip: false, air_jump: false },
      g.room.worldBounds,
    );
    const x = p.x + p.w / 2;
    if (!p.grounded) airborne = true;
    if (
      x < sense.view.x + 12 ||
      x > sense.view.x + sense.view.w - 12 ||
      Math.abs(x - sense.eye.x) > sense.range - 24
    )
      return null;
    if (
      sense.surfaces.some((s) => s.kind === "hazard" && overlaps(p, s)) ||
      sense.enemies.some((e) => overlaps({ ...p, x: p.x - 40, w: p.w + 80 }, e))
    )
      return null;
    if (
      g.room.exits.some(
        (e) =>
          e.type === "passage" &&
          overlaps({ ...p, x: p.x - 24, w: p.w + 48 }, e.triggerZone),
      )
    )
      return null;
    if (airborne && p.grounded) {
      if (
        direction * (x - start) < 40 ||
        Math.abs(p.y + p.h - startFeet) > 105 ||
        safeFooting(g, sense, x, p.y + p.h)
      )
        return null;
      return {
        x: clamp(x, 12, g.room.worldBounds.w - 12),
        duration: (i + 1) * g.config.fixedStep,
      };
    }
  }
  return null;
}
