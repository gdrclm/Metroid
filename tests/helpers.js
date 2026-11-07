import { readFileSync } from "node:fs";
import { Game } from "../src/game.js";
import { SaveStore } from "../src/save.js";
import { createPlayer, updatePlayer, activeSurfaces } from "../src/physics.js";
import { conditionMet } from "../src/core.js";
export const world = JSON.parse(
  readFileSync(new URL("../data/world.json", import.meta.url)),
);
export const config = JSON.parse(
  readFileSync(new URL("../data/physics.json", import.meta.url)),
);
export const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    map,
  };
};
export function fixture() {
  const storage = memoryStorage(),
    store = new SaveStore(storage),
    game = new Game(structuredClone(world), config, store);
  game.start(true);
  return { game, store, storage };
}
export const controls = (held = [], pressed = []) => ({
  down: (k) => held.includes(k),
  pressed: (k) => pressed.includes(k),
});
export const floor = [
  {
    id: "floor",
    x: -10000,
    y: 620,
    w: 30000,
    h: 100,
    kind: "solid",
    grippable: true,
  },
];
export function player(x = 100, y = 576) {
  const p = createPlayer({ x, y }, config);
  p.grounded = true;
  return p;
}
export function tick(
  p,
  input = controls(),
  surfaces = floor,
  abilities = { dash: true, wall_grip: true },
  bounds = { w: 20000, h: 720 },
) {
  updatePlayer(p, input, config.fixedStep, surfaces, config, abilities, bounds);
}
export function jumpMeasure({
  dash = false,
  running = false,
  hold = true,
} = {}) {
  const p = player();
  p.vx = running ? config.maxSpeed : 0;
  let minY = p.y,
    time = 0,
    landed = false;
  for (let i = 0; i < 240; i++) {
    tick(
      p,
      controls(
        ["right", ...(hold || i < 8 ? ["jump"] : [])],
        [...(i === 0 ? ["jump"] : []), ...(dash && i === 30 ? ["dash"] : [])],
      ),
    );
    time += config.fixedStep;
    minY = Math.min(minY, p.y);
    if (i > 2 && p.grounded) {
      landed = true;
      break;
    }
  }
  return { height: 576 - minY, distance: p.x - 100, time, landed };
}
export function roomSurfaces(id, flags = []) {
  return activeSurfaces(
    world.rooms.find((r) => r.roomId === id),
    flags,
    conditionMet,
  );
}
