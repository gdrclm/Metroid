export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const approach = (n, target, amount) =>
  n < target ? Math.min(n + amount, target) : Math.max(n - amount, target);
export const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function conditionMet(condition, flags, local = {}) {
  if (!condition) return true;
  if (condition.flag) return flags.includes(condition.flag);
  if (condition.local) return Boolean(local[condition.local]);
  if (condition.and)
    return condition.and.every((c) => conditionMet(c, flags, local));
  if (condition.or)
    return condition.or.some((c) => conditionMet(c, flags, local));
  if (condition.not) return !conditionMet(condition.not, flags, local);
  if (condition.atLeast)
    return (
      condition.atLeast.of.filter((c) => conditionMet(c, flags, local))
        .length >= condition.atLeast.count
    );
  return false;
}
export function validateWorld(world, physics) {
  const errors = [],
    ids = new Set(),
    rooms = new Map(world.rooms.map((r) => [r.roomId, r]));
  const unique = (id, source) => {
    if (!id || ids.has(id))
      errors.push(`${source}: duplicate or missing ID ${id}`);
    ids.add(id);
  };
  for (const room of world.rooms) {
    unique(room.roomId, "room");
    for (const field of [
      "regionId",
      "revision",
      "worldBounds",
      "mapShape",
      "collisionLayers",
      "cameraZones",
      "spawnPoints",
      "entities",
      "triggers",
      "persistentFlags",
      "resetRules",
      "audioProfile",
      "streamingGroup",
      "debugTags",
    ]) {
      if (room[field] === undefined)
        errors.push(`${room.roomId}: missing ${field}`);
    }
    if (!world.regions[room.regionId])
      errors.push(`${room.roomId}: unknown region`);
    for (const item of [
      ...room.collisionLayers,
      ...room.entities,
      ...room.triggers,
    ])
      unique(item.id, room.roomId);
    for (const exit of room.exits) {
      unique(exit.exitId, room.roomId);
      const target = rooms.get(exit.targetRoomId);
      if (!target) errors.push(`${exit.exitId}: missing target room`);
      else {
        if (!target.spawnPoints[exit.spawnPointId])
          errors.push(`${exit.exitId}: missing target spawn`);
        if (
          !exit.oneWay &&
          !target.exits.some((e) => e.targetRoomId === room.roomId)
        )
          errors.push(`${exit.exitId}: missing reciprocal exit`);
      }
    }
    for (const [id, point] of Object.entries(room.spawnPoints)) {
      const body = {
        x: point.x,
        y: point.y,
        w: physics.width,
        h: physics.height,
      };
      if (
        point.x < 0 ||
        point.x + body.w > room.worldBounds.w ||
        point.y < 0 ||
        point.y + body.h > room.worldBounds.h
      )
        errors.push(`${room.roomId}/${id}: spawn outside bounds`);
      if (
        room.collisionLayers.some(
          (s) => s.kind !== "oneWay" && !s.requires && overlaps(body, s),
        )
      )
        errors.push(`${room.roomId}/${id}: spawn in geometry`);
      if (
        room.collisionLayers.some(
          (s) => s.kind === "hazard" && overlaps(body, s),
        )
      )
        errors.push(`${room.roomId}/${id}: spawn in hazard`);
    }
  }
  if (!rooms.has(world.startRoomId)) errors.push("Missing start room");
  return errors;
}

export function objectiveFor(flags) {
  if (!flags.includes("ability.dash"))
    return "Найдите свет на крановой площадке";
  if (!flags.includes("shortcut.pier_gate"))
    return "Откройте решётку с верхних мостков";
  if (!flags.includes("mechanism.pier_lift"))
    return "Запустите старый подъёмник";
  if (!flags.includes("ability.wall_grip"))
    return "Найдите дом без лестниц в городе";
  if (!flags.includes("boss.courtyard_keeper"))
    return "Поднимитесь на крыши к смотрителю";
  if (!flags.includes("mechanism.tower_bridge"))
    return "Запустите мост во дворе смотрителя";
  if (!flags.includes("slice.overlook_seen"))
    return "Поднимитесь к водонапорной башне";
  return "Вернитесь по знакомым путям за секретами";
}
