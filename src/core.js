export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const approach = (n, target, amount) =>
  n < target ? Math.min(n + amount, target) : Math.max(n - amount, target);
export const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function conditionMet(condition, flags, local = {}) {
  if (!condition) return true;
  if (condition.scene) return Boolean(local.scenes?.[condition.scene]);
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
    if (room.survival !== undefined) {
      const s = room.survival;
      if (
        !s ||
        !Number.isFinite(s.darkness) ||
        s.darkness < 0 ||
        s.darkness > 1 ||
        !Number.isFinite(s.grimeRate) ||
        s.grimeRate < 0 ||
        !Number.isFinite(s.wetBelowY) ||
        s.wetBelowY < 0 ||
        s.wetBelowY > room.worldBounds?.h
      )
        errors.push(`${room.roomId}: invalid survival profile`);
    }
    const finiteRect = (r) =>
      r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
    if (
      !finiteRect(room.worldBounds) ||
      room.worldBounds.w < physics.width ||
      room.worldBounds.h < physics.height
    )
      errors.push(`${room.roomId}: invalid physics dimensions`);
    if (!finiteRect(room.mapShape))
      errors.push(`${room.roomId}: invalid map dimensions`);
    for (const zone of room.cameraZones)
      if (
        !finiteRect(zone) ||
        zone.x < 0 ||
        zone.y < 0 ||
        zone.x + zone.w > room.worldBounds.w ||
        zone.y + zone.h > room.worldBounds.h
      )
        errors.push(`${room.roomId}: camera zone outside bounds`);
    for (const surface of room.collisionLayers)
      if (!finiteRect(surface))
        errors.push(`${surface.id}: invalid collider dimensions`);
    if (world.geography?.kind === "schematic") {
      if (room.worldBounds.x !== 0 || room.worldBounds.y !== 0)
        errors.push(`${room.roomId}: physics bounds must use the local origin`);
      if (room.mapShape.w <= 0 || room.mapShape.h <= 0)
        errors.push(`${room.roomId}: invalid map dimensions`);
      for (const other of world.rooms)
        if (
          other.roomId > room.roomId &&
          overlaps(room.mapShape, other.mapShape)
        )
          errors.push(`${room.roomId}: schematic overlap with ${other.roomId}`);
    }
    for (const item of [
      ...room.collisionLayers,
      ...room.entities,
      ...room.triggers,
    ])
      unique(item.id, room.roomId);
    for (const e of room.entities) {
      if (
        e.type === "care" &&
        (!["food", "coffee", "donate"].includes(e.action) ||
          (e.action === "donate" &&
            (typeof e.flag !== "string" || !e.flag.startsWith("story."))))
      )
        errors.push(`${e.id}: invalid care station`);
    }
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
        if (world.geography?.kind === "schematic") {
          const dx = target.mapShape.x - room.mapShape.x,
            dy = target.mapShape.y - room.mapShape.y;
          const expected =
            dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
          if (!exit.indirect && exit.direction !== expected)
            errors.push(`${exit.exitId}: direction disagrees with geography`);
          if (!["passage", "door", "stairs", "lift"].includes(exit.type))
            errors.push(`${exit.exitId}: unknown travel type`);
          if (exit.type === "passage" && !exit.triggerZone)
            errors.push(`${exit.exitId}: missing passage trigger`);
        }
      }
    }
    for (const mechanism of room.mechanisms || []) {
      unique(mechanism.id, room.roomId);
      if (
        !["gate", "ladder", "bridge"].includes(mechanism.kind) ||
        !mechanism.flag ||
        !(mechanism.duration > 0)
      )
        errors.push(`${mechanism.id}: invalid mechanism state`);
      for (const id of mechanism.controlledExits || [])
        if (!room.exits.some((e) => e.exitId === id))
          errors.push(`${mechanism.id}: missing controlled exit ${id}`);
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
      if (![point.x, point.y].every(Number.isFinite))
        errors.push(`${room.roomId}/${id}: non-finite spawn`);
      if (
        !room.collisionLayers.some(
          (s) =>
            s.kind !== "hazard" &&
            !s.motion &&
            Math.abs(body.y + body.h - s.y) <= 2 &&
            body.x + body.w > s.x &&
            body.x < s.x + s.w,
        )
      )
        errors.push(`${room.roomId}/${id}: spawn has no static support`);
    }
    if (world.atmosphereVersion) {
      if (!room.narrative || Object.keys(room.narrative).length < 10)
        errors.push(`${room.roomId}: missing narrative card`);
      for (const e of room.emitters || []) {
        unique(e.id, room.roomId);
        if (
          ![e.x, e.y, e.rate, e.direction?.x, e.direction?.y].every(
            Number.isFinite,
          ) ||
          e.rate <= 0 ||
          !["continuous", "burst"].includes(e.mode) ||
          !["back", "middle", "front", "gameplay"].includes(e.layer) ||
          e.life?.length !== 2 ||
          !e.life.every((v) => v > 0) ||
          e.life[0] > e.life[1]
        )
          errors.push(`${e.id}: invalid emitter`);
      }
      for (const source of room.audioSources || []) {
        unique(source.id, room.roomId);
        if (
          ![source.x, source.y, source.radius].every(Number.isFinite) ||
          source.radius <= 0 ||
          !(source.gain >= 0)
        )
          errors.push(`${source.id}: invalid audio source`);
        if (
          source.interval &&
          (source.interval.length !== 2 ||
            !source.interval.every((v) => v > 0) ||
            source.interval[1] < source.interval[0])
        )
          errors.push(`${source.id}: invalid audio interval`);
      }
      for (const event of room.storyEvents || []) {
        unique(event.id, room.roomId);
        if (
          !(event.duration > 0) ||
          !["enter", "interact", "flag", "proximity", "travel"].includes(
            event.trigger?.type,
          )
        )
          errors.push(`${event.id}: invalid story event`);
        for (const effect of event.effects || []) {
          if (
            !Number.isFinite(effect.at) ||
            effect.at < 0 ||
            effect.at > event.duration ||
            !["sound", "particles"].includes(effect.type)
          )
            errors.push(`${event.id}: invalid scene effect`);
          if (
            effect.type === "particles" &&
            !(rooms.get(effect.roomId || room.roomId)?.emitters || []).some(
              (e) => e.id === effect.emitter,
            )
          )
            errors.push(`${event.id}: missing emitter ${effect.emitter}`);
        }
      }
    }
  }
  if (!rooms.has(world.startRoomId)) errors.push("Missing start room");
  if (world.actOne !== undefined) {
    const plan = world.actOne,
      targets = plan?.regionalTargets;
    if (
      !Number.isInteger(plan?.targetRooms) ||
      plan.targetRooms < world.rooms.length ||
      !targets ||
      Object.keys(targets).length !== Object.keys(world.regions).length ||
      Object.entries(world.regions).some(
        ([id]) =>
          !Number.isInteger(targets?.[id]) ||
          targets[id] < world.rooms.filter((r) => r.regionId === id).length,
      ) ||
      Object.values(targets || {}).reduce((sum, n) => sum + n, 0) !==
        plan?.targetRooms
    )
      errors.push("actOne: invalid regional room targets");
    if (
      !Array.isArray(plan?.baseRoomIds) ||
      !plan.baseRoomIds.length ||
      new Set(plan.baseRoomIds).size !== plan.baseRoomIds.length ||
      plan.baseRoomIds.some((id) => !rooms.has(id))
    )
      errors.push("actOne: invalid baseline room IDs");
  }
  if (world.guideCaches !== undefined && !Array.isArray(world.guideCaches))
    errors.push("guideCaches: expected an array");
  for (const cache of Array.isArray(world.guideCaches)
    ? world.guideCaches
    : []) {
    if (!cache || typeof cache !== "object") {
      errors.push("guide cache: invalid record");
      continue;
    }
    unique(cache.id, "guide cache");
    const room = rooms.get(cache.roomId);
    if (!room) {
      errors.push(`${cache.id}: missing cache room`);
      continue;
    }
    const contents = Object.entries(cache.contents || {});
    if (
      !contents.length ||
      contents.some(
        ([key, n]) =>
          !["rations", "beans"].includes(key) ||
          !Number.isInteger(n) ||
          n < 1 ||
          n > 5,
      )
    )
      errors.push(`${cache.id}: invalid cache contents`);
    if (
      typeof cache.title !== "string" ||
      ![cache.x, cache.y].every(Number.isFinite) ||
      cache.x < 16 ||
      cache.x > room.worldBounds.w - 16 ||
      cache.y < 28 ||
      cache.y > room.worldBounds.h
    )
      errors.push(`${cache.id}: invalid cache position`);
    const body = { x: cache.x - 14, y: cache.y - 28, w: 28, h: 28 };
    if (
      room.collisionLayers.some(
        (s) => !s.requires && s.kind !== "oneWay" && overlaps(body, s),
      ) ||
      !room.collisionLayers.some(
        (s) =>
          !s.requires &&
          !s.motion &&
          s.kind !== "hazard" &&
          Math.abs(s.y - cache.y) < 0.1 &&
          cache.x - 14 >= s.x &&
          cache.x + 14 <= s.x + s.w,
      )
    )
      errors.push(`${cache.id}: cache needs a clear static support`);
  }
  return errors;
}

export function currentObjective(flags) {
  if (!flags.includes("ability.dash"))
    return {
      id: "dash",
      roomId: "P04",
      entityId: "gift.dash",
      text: "Найдите свет на крановой площадке",
    };
  if (!flags.includes("shortcut.pier_gate"))
    return {
      id: "pier_gate",
      roomId: "P07",
      entityId: "lever.pier_gate",
      text: "Откройте решётку с верхних мостков",
    };
  if (!flags.includes("mechanism.pier_lift"))
    return {
      id: "lift",
      roomId: "P08",
      entityId: "lever.pier_lift",
      text: "Запустите старый подъёмник",
    };
  if (!flags.includes("ability.wall_grip"))
    return {
      id: "wall_grip",
      roomId: "R04",
      entityId: "gift.wall_grip",
      text: "Найдите дом без лестниц в городе",
    };
  if (!flags.includes("boss.courtyard_keeper"))
    return {
      id: "keeper",
      roomId: "R07",
      entityId: "boss.courtyard_keeper",
      text: "Поднимитесь на крыши к смотрителю",
    };
  if (!flags.includes("mechanism.tower_bridge"))
    return {
      id: "bridge",
      roomId: "R07",
      entityId: "lever.tower_bridge",
      text: "Запустите мост во дворе смотрителя",
    };
  if (!flags.includes("slice.overlook_seen"))
    return {
      id: "overlook",
      roomId: "R08",
      entityId: "slice.overlook",
      text: "Поднимитесь к водонапорной башне",
    };
  for (const [flag, roomId, text] of [
    ["pickup.p03_upper", "P03", "Найдите сердце в верхней нише склада"],
    ["pickup.p06_dash", "P09", "Найдите осколок в галерее цепей"],
    ["pickup.p03_lower", "P03", "Найдите осколок на соляном складе"],
    ["pickup.clockmaker", "V03", "Загляните в мастерскую часовщика"],
  ])
    if (!flags.includes(flag))
      return {
        id: flag,
        roomId,
        entityId: flag === "pickup.clockmaker" ? "npc.clockmaker" : flag,
        text,
      };
  return {
    id: "explore",
    roomId: null,
    entityId: null,
    text: "Все цели среза выполнены. Исследуйте город.",
  };
}
export function objectiveFor(flags) {
  return currentObjective(flags).text;
}
