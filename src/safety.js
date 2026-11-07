import { overlaps } from "./core.js";
import { lineBlocked, safeStandingPoint } from "./physics.js";

export function interactionAnchor(target) {
  return (
    target.interactionPoint || {
      x: target.x,
      y: target.y - (["pickup", "ability"].includes(target.type) ? 0 : 32),
    }
  );
}
export function accessibleInteraction(player, target, surfaces) {
  const floating = ["pickup", "ability"].includes(target.type);
  const zone = target.interactionZone || {
    x: target.x - 78,
    y: target.y - (floating ? 74 : 90),
    w: 156,
    h: floating ? 148 : 94,
  };
  if (!overlaps(player, zone)) return false;
  return !lineBlocked(
    { x: player.x + player.w / 2, y: player.y + player.h / 2 },
    interactionAnchor(target),
    surfaces,
    { ignoreId: target.colliderId },
  );
}
export function lockReason(target) {
  if (target.lockedReason) return target.lockedReason;
  const c = JSON.stringify(target.requires || target.condition || {});
  if (c.includes("ability.wall_grip"))
    return "Нужны медные когти: вернитесь с зацепом.";
  if (c.includes("ability.dash")) return "Нужен воздушный рывок.";
  if (c.includes("boss.courtyard_keeper"))
    return "Механизм удерживает смотритель двора.";
  return "Проход пока закрыт. Найдите управляющий механизм.";
}
export function safeReturnPoint(player, surfaces, bounds, candidates) {
  for (const point of candidates) {
    if (
      point &&
      safeStandingPoint({ ...player, x: point.x, y: point.y }, surfaces, bounds)
    )
      return { x: point.x, y: point.y };
  }
  const options = [];
  for (const s of surfaces)
    if (s.kind !== "hazard" && !s.motion && s.w >= player.w + 32) {
      for (const x of [
        Math.max(s.x + 12, Math.min(s.x + s.w - player.w - 12, player.x)),
        s.x + 16,
        s.x + s.w - player.w - 16,
      ]) {
        const q = { x, y: s.y - player.h };
        if (safeStandingPoint({ ...player, ...q }, surfaces, bounds))
          options.push(q);
      }
    }
  options.sort(
    (a, b) =>
      Math.hypot(a.x - player.x, a.y - player.y) -
      Math.hypot(b.x - player.x, b.y - player.y),
  );
  return options[0] || null;
}
