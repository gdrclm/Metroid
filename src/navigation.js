import { conditionMet, currentObjective } from "./core.js";

// Follow open exits, including shortcuts and the lift; never route through a locked gate.
export function questNavigation(world, roomId, flags) {
  const objective = currentObjective(flags);
  const rooms = new Map(world.rooms.map((room) => [room.roomId, room]));
  const target = rooms.get(objective.roomId);
  if (!target) return { objective, target: null, route: [], next: null };
  const queue = [[roomId]],
    seen = new Set([roomId]);
  for (let index = 0; index < queue.length; index++) {
    const route = queue[index],
      id = route.at(-1);
    if (id === target.roomId)
      return { objective, target, route, next: rooms.get(route[1]) || null };
    for (const exit of rooms.get(id)?.exits || []) {
      if (!seen.has(exit.targetRoomId) && conditionMet(exit.condition, flags)) {
        seen.add(exit.targetRoomId);
        queue.push([...route, exit.targetRoomId]);
      }
    }
  }
  return { objective, target, route: [], next: null };
}
