import { clamp } from "./core.js";
const profiles = {
  street: { lead: 0.13, maxLead: 120, follow: 4, turnDelay: 0.16 },
  shaft: { lead: 0.06, maxLead: 50, follow: 5, turnDelay: 0.2 },
  arena: { lead: 0.08, maxLead: 65, follow: 4, turnDelay: 0.22 },
  overlook: { lead: 0.08, maxLead: 80, follow: 3, turnDelay: 0.2 },
  room: { lead: 0.1, maxLead: 90, follow: 4, turnDelay: 0.16 },
  lab: { lead: 0.13, maxLead: 120, follow: 4, turnDelay: 0.16 },
};
export function cameraTarget(game, dt = 0, snap = false, input = null) {
  const p = game.player,
    v = game.viewport;
  const zone =
    game.room.cameraZones.find(
      (z) =>
        p.x + p.w / 2 >= z.x &&
        p.x + p.w / 2 <= z.x + z.w &&
        p.y + p.h / 2 >= z.y &&
        p.y + p.h / 2 <= z.y + z.h,
    ) || game.room.cameraZones[0];
  const profile = {
    ...(profiles[zone?.profile] || profiles.room),
    ...zone?.settings,
  };
  const state =
    game.cameraMotion ||
    (game.cameraMotion = {
      side: p.facing,
      pending: p.facing,
      turn: 0,
      look: 0,
    });
  if (snap) {
    state.side = p.facing;
    state.turn = 0;
  }
  if (p.facing !== state.side) {
    if (state.pending !== p.facing) {
      state.pending = p.facing;
      state.turn = 0;
    }
    state.turn += dt;
    if (state.turn >= profile.turnDelay) state.side = p.facing;
  } else state.turn = 0;
  const look = input
    ? Number(input.down("down")) - Number(input.down("up"))
    : 0;
  state.look += (look * 100 - state.look) * (snap ? 1 : 1 - Math.exp(-dt * 4));
  const minX = zone?.x || 0,
    minY = zone?.y || 0;
  const maxX = Math.max(
    minX,
    (zone?.x || 0) + (zone?.w || game.room.worldBounds.w) - v.w,
  );
  const maxY = Math.max(
    minY,
    (zone?.y || 0) + (zone?.h || game.room.worldBounds.h) - v.h,
  );
  let x =
    p.x - v.w / 2 + state.side * Math.min(v.w * profile.lead, profile.maxLead);
  let y = p.y - v.h * 0.56 + (p.vy > 300 ? 70 : 0) + state.look;
  if (zone?.composition) {
    const target = zone.composition;
    if (
      target.minX !== undefined &&
      target.maxX - target.minX <= v.w &&
      p.x >= target.minX - 120 &&
      p.x <= target.maxX + 120
    )
      x = clamp(
        (target.minX + target.maxX - v.w) / 2,
        p.x - v.w + 80,
        p.x - 80,
      );
    if (target.minY !== undefined && target.maxY - target.minY <= v.h)
      y = (target.minY + target.maxY - v.h) / 2;
  }
  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY),
    follow: profile.follow,
  };
}
export function updateCamera(game, dt, input = null, snap = false) {
  const t = cameraTarget(game, dt, snap, input),
    a = snap ? 1 : 1 - Math.exp(-dt * t.follow);
  game.camera.x += (t.x - game.camera.x) * a;
  game.camera.y += (t.y - game.camera.y) * a;
}
