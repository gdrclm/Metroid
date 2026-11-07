import test from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  controls,
  config,
  world,
  positionAt,
  player,
  tick,
  roomSurfaces,
} from "./helpers.js";
import { supportsAt, safeStandingPoint } from "../src/physics.js";
import { cameraTarget } from "../src/camera.js";
import { createEnemy, updateEnemy } from "../src/enemies.js";
import { JourneyPilot } from "../tools/pilot.js";
import { encodeSave, decodeSave, newProgress } from "../src/save.js";
import { validateWorld } from "../src/core.js";
import { mapLayout } from "../src/map.js";
import { accessibleInteraction } from "../src/safety.js";

test("street passage crosses by movement, door needs interact, stairs use a direction", () => {
  const { game: g } = fixture();
  const exit = g.room.exits[0];
  Object.assign(g.player, { x: 1230, y: 576, grounded: true });
  g.transitionCooldown = 0;
  g.update(config.fixedStep, controls(["right"]));
  assert.ok(g.transition);
  assert.equal(g.transition.exit.type, "passage");
  g.transition = null;
  g.loadRoom("V02");
  const door = g.room.exits.find((e) => e.targetRoomId === "V03");
  positionAt(g, door);
  g.transitionCooldown = 0;
  g.update(config.fixedStep, controls());
  assert.equal(g.transition, null);
  g.update(config.fixedStep, controls([], ["interact"]));
  assert.equal(g.transition.exit.type, "door");
  g.transition = null;
  g.flag("ability.dash");
  g.loadRoom("P04");
  const ladder = g.room.exits.find((e) => e.targetRoomId === "P05");
  positionAt(g, ladder);
  g.transitionCooldown = 0;
  g.update(config.fixedStep, controls([], ["up"]));
  assert.equal(g.transition.exit.type, "stairs");
});
test("geography rejects wrong exit sides and schematic overlaps; physics uses local origins", () => {
  assert.deepEqual(validateWorld(world, config), []);
  const copy = structuredClone(world);
  copy.rooms[0].exits[0].direction = "left";
  copy.rooms[1].mapShape = { ...copy.rooms[0].mapShape };
  copy.rooms[2].worldBounds.w = -1;
  copy.rooms[3].spawnPoints.start.y -= 20;
  copy.rooms[1].mechanisms[0].duration = 0;
  const errors = validateWorld(copy, config);
  assert.ok(errors.some((s) => s.includes("direction")));
  assert.ok(errors.some((s) => s.includes("overlap")));
  assert.ok(errors.some((s) => s.includes("invalid physics dimensions")));
  assert.ok(errors.some((s) => s.includes("no static support")));
  assert.ok(errors.some((s) => s.includes("invalid mechanism state")));
  assert.ok(
    new Set(world.rooms.map((r) => r.worldBounds.w + "x" + r.worldBounds.h))
      .size >= 6,
  );
});
test("a floating ability is accessible from the real ground, but stale interactions do not award it", () => {
  const { game: g } = fixture();
  g.loadRoom("P04");
  const e = g.room.entities.find((e) => e.type === "ability");
  Object.assign(g.player, { x: e.x - 12, y: 576 });
  assert.ok(accessibleInteraction(g.player, e, g.surfaces));
  g.nearby = e;
  g.player.x = 100;
  g.interact();
  assert.equal(g.abilities.dash, false);
});
test("mechanisms animate, block premature passage, and restore the final state after reload", () => {
  const { game: g } = fixture();
  g.loadRoom("P07");
  const m = [...g.mechanisms.values()][0],
    exit = g.room.exits.find((e) => e.targetRoomId === "P02");
  assert.equal(m.value, 0);
  g.flag("shortcut.pier_gate");
  assert.equal(g.tryExit(exit), false);
  for (let i = 0; i < 120; i++) g.update(config.fixedStep, controls());
  assert.equal(m.value, 1);
  g.loadRoom("P07");
  assert.equal([...g.mechanisms.values()][0].value, 1);
  assert.ok(g.tryExit(exit));
});
test("ordinary enemies stay defeated across room changes and reset after rest or death", () => {
  const { game: g } = fixture();
  g.loadRoom("P03");
  const e = g.enemies[0];
  Object.assign(g.player, { x: e.x - 62, y: e.y, facing: 1, invulnerable: 10 });
  for (let i = 0; i < 120; i++)
    g.update(
      config.fixedStep,
      controls([], i === 0 || i === 60 ? ["attack"] : []),
    );
  assert.equal(e.hp, 0);
  g.loadRoom("P02");
  g.loadRoom("P03");
  assert.equal(g.enemies.length, 0);
  g.die();
  g.respawn();
  g.loadRoom("P03");
  assert.equal(g.enemies.length, 1);
});
test("a failed keeper attempt retries at the arena lamp without losing abilities", () => {
  const { game: g } = fixture();
  g.flag("ability.wall_grip");
  g.loadRoom("R07");
  g.die();
  g.respawn();
  assert.equal(g.room.roomId, "R07");
  assert.equal(g.player.x, g.room.spawnPoints.arena_entry.x);
  assert.equal(g.enemies[0].hp, 12);
  assert.ok(g.abilities.wall_grip);
});
test("short direction taps do not flip camera lead; sustained turns do", () => {
  const { game: g } = fixture();
  g.setViewport(538, 720);
  Object.assign(g.player, { x: 650, facing: 1 });
  g.snapCamera();
  const base = cameraTarget(g);
  g.player.facing = -1;
  for (let i = 0; i < 10; i++) cameraTarget(g, 0.01);
  assert.equal(g.cameraMotion.side, 1);
  for (let i = 0; i < 25; i++) cameraTarget(g, 0.01);
  assert.equal(g.cameraMotion.side, -1);
  assert.ok(cameraTarget(g).x < base.x);
  assert.ok(Math.abs(cameraTarget(g).x - (g.player.x - 269)) <= 120);
  g.loadRoom("R05");
  Object.assign(g.player, { x: 650, y: 600, vy: 0 });
  g.snapCamera();
  const straight = cameraTarget(g).y,
    up = cameraTarget(g, 0.5, false, controls(["up"])).y,
    down = cameraTarget(g, 1, false, controls(["down"])).y;
  assert.ok(up < straight && down > straight);
});
test("P05 camera keeps the player and a visible landing edge on a narrow viewport", () => {
  const { game: g } = fixture();
  g.loadRoom("P05");
  g.setViewport(538, 720);
  Object.assign(g.player, { x: 890, y: 396, facing: -1 });
  g.snapCamera();
  assert.ok(g.player.x >= g.camera.x && g.player.x + 24 <= g.camera.x + 538);
  assert.ok(g.camera.x < 520 && g.camera.x + 538 > 870);
});
test("seen exits are discovered through actual visibility; changing rooms alone does not reveal every exit", () => {
  const { game: g } = fixture();
  g.loadRoom("V02");
  g.setViewport(538, 720);
  assert.equal(g.progress.seenExits.includes("V02.to.V04"), false);
  for (let i = 0; i < 10; i++) g.update(config.fixedStep, controls());
  assert.equal(g.progress.seenExits.includes("V02.to.V04"), false);
  Object.assign(g.player, { x: 1460, y: 576 });
  g.snapCamera();
  g.update(config.fixedStep, controls());
  assert.ok(g.progress.seenExits.includes("V02.to.V04"));
});
test("map forms differ, map pins and found exits survive save, old saves receive defaults", () => {
  const layout = mapLayout(world),
    shaft = layout.rect(world.rooms.find((r) => r.roomId === "R05")),
    normal = layout.rect(world.rooms[0]);
  assert.ok(shaft.h > normal.h);
  const p = newProgress();
  p.markers = [{ roomId: "P03", type: "secret" }];
  p.seenExits = ["P03.to.P04"];
  assert.deepEqual(decodeSave(encodeSave(p)).markers, p.markers);
  const legacy = newProgress();
  delete legacy.markers;
  delete legacy.seenExits;
  delete legacy.stats;
  const restored = decodeSave(encodeSave(legacy));
  assert.deepEqual(restored.markers, []);
  assert.deepEqual(restored.seenExits, []);
});
test("P05 safe lower floor has a usable recovery stair route without wall grip", () => {
  const p = player(1160, 596),
    surfaces = roomSurfaces("P05");
  let phase = 0;
  for (let i = 0; i < 1000; i++) {
    const targets = [
        { x: 1160, y: 560 },
        { x: 1040, y: 500 },
        { x: 1010, y: 440 },
      ],
      t = targets[phase];
    if (!t) break;
    let direction = Math.sign(t.x - p.x - 12),
      held =
        Math.abs(t.x - p.x - 12) > 15
          ? [direction > 0 ? "right" : "left", "jump"]
          : ["jump"];
    const jump =
      p.grounded && p.y + 44 > t.y + 10 && Math.abs(t.x - p.x - 12) < 150;
    tick(
      p,
      controls(held, jump ? ["jump"] : []),
      surfaces,
      { dash: true, wall_grip: false },
      { w: 1280, h: 720 },
    );
    // A full jump may skip the middle step and land directly on the launch.
    if (p.grounded && p.y + 44 <= t.y + 2) phase++;
  }
  assert.equal(phase, 3);
  assert.ok(supportsAt(p, surfaces).some((s) => s.id === "P05.launch"));
});
test("keeper selection depends on distance, recovery is safe, and lunges stay inside the arena", () => {
  const { game: g } = fixture();
  g.loadRoom("R07");
  const e = g.enemies[0];
  g.arenaActive = true;
  Object.assign(g.player, { x: e.x - 250, y: 756, invulnerable: 0 });
  g.snapCamera();
  updateEnemy(e, g.player, config.fixedStep, g.surfaces, g);
  assert.equal(e.attackKind, "wave");
  Object.assign(e, { state: "patrol", timer: 0 });
  g.player.x = e.x - 70;
  updateEnemy(e, g.player, config.fixedStep, g.surfaces, g);
  assert.equal(e.attackKind, "lunge");
  e.state = "recovery";
  e.timer = 1;
  g.player.x = e.x;
  const hp = g.health;
  updateEnemy(e, g.player, config.fixedStep, g.surfaces, g);
  assert.equal(g.health, hp);
  Object.assign(e, { x: 1380, vx: 540, state: "attack", timer: 1 });
  for (let i = 0; i < 120; i++)
    updateEnemy(e, g.player, config.fixedStep, g.surfaces, g);
  assert.ok(e.x + e.w <= g.room.worldBounds.w);
  assert.ok(e.y < 900);
});
test("all 22 rooms can be completed and the early secret revisited with ordinary actions and normal health", () => {
  const { game: g } = fixture(),
    pilot = new JourneyPilot();
  Object.defineProperty(g.debug, "god", { value: false, writable: false });
  Object.defineProperty(g.debug, "fly", { value: false, writable: false });
  for (let i = 0; i < 60000; i++) {
    if (g.mode === "death") g.respawn();
    if (g.mode === "dialogue" || g.mode === "complete") g.mode = "playing";
    const a = pilot.next(g);
    if (pilot.done) break;
    g.update(config.fixedStep, {
      down: (k) => a.held.includes(k),
      pressed: (k) => a.pressed.includes(k),
    });
  }
  assert.ok(
    pilot.done,
    JSON.stringify({
      task: pilot.tasks[pilot.index],
      room: g.room.roomId,
      player: g.player,
    }),
  );
  assert.equal(g.progress.visited.length, 22);
  assert.equal(g.progress.deaths, 0);
  assert.ok(g.flags.includes("pickup.p03_upper"));
  assert.ok(g.flags.includes("story.clockmaker_memory"));
  assert.ok(g.health > 0);
  assert.ok(g.progress.stats.bossAttempts >= 1);
});
