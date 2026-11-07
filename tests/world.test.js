import test from "node:test";
import assert from "node:assert/strict";
import { world, config, fixture, controls } from "./helpers.js";
import { validateWorld, conditionMet } from "../src/core.js";
import { maxHealth, fragmentCount } from "../src/save.js";

test("all 20 rooms conform to the contract; stable IDs, reciprocal exits and safe spawns", () => {
  assert.equal(world.rooms.length, 20);
  assert.deepEqual(validateWorld(world, config), []);
  assert.equal(
    world.rooms.reduce((n, r) => n + r.exits.length, 0),
    42,
  );
  assert.equal(
    world.rooms
      .find((r) => r.roomId === "P06")
      .exits.some((e) => e.targetRoomId === "P03"),
    false,
  );
});
test("validator rejects missing references, duplicates and obstructed spawn points", () => {
  const broken = structuredClone(world);
  broken.rooms[0].exits[0].targetRoomId = "missing";
  broken.rooms[0].spawnPoints.start.y = 630;
  broken.rooms[1].entities[0].id = broken.rooms[0].entities[0].id;
  const e = validateWorld(broken, config);
  assert.ok(e.some((s) => s.includes("missing target")));
  assert.ok(e.some((s) => s.includes("duplicate")));
  assert.ok(e.some((s) => s.includes("geometry")));
});
test("data conditions support AND, OR, NOT and count thresholds", () => {
  const flags = ["a", "b"];
  assert.ok(
    conditionMet({ and: [{ flag: "a" }, { not: { flag: "c" } }] }, flags),
  );
  assert.ok(conditionMet({ or: [{ flag: "z" }, { flag: "b" }] }, flags));
  assert.ok(
    conditionMet(
      {
        atLeast: {
          count: 2,
          of: [{ flag: "a" }, { flag: "b" }, { flag: "c" }],
        },
      },
      flags,
    ),
  );
  assert.equal(conditionMet({ flag: "no" }, flags), false);
});
test("entire graph can be completed without acquiring an ability behind its own gate", () => {
  const rooms = new Map(world.rooms.map((r) => [r.roomId, r])),
    visited = new Set(["P01"]),
    flags = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...visited]) {
      const r = rooms.get(id);
      for (const e of r.entities) {
        const flag = e.flag || e.defeatedFlag;
        if (flag && !flags.includes(flag) && conditionMet(e.requires, flags)) {
          flags.push(flag);
          changed = true;
        }
      }
      for (const e of r.exits)
        if (conditionMet(e.condition, flags) && !visited.has(e.targetRoomId)) {
          visited.add(e.targetRoomId);
          changed = true;
        }
    }
  }
  assert.equal(visited.size, 20);
  assert.ok(flags.includes("slice.overlook_seen"));
  // With both shortcuts, the late secret is reachable from the tower and back.
  function reachable(start, end) {
    const q = [start],
      seen = new Set(q);
    while (q.length) {
      const r = rooms.get(q.shift());
      if (r.roomId === end) return true;
      for (const e of r.exits)
        if (conditionMet(e.condition, flags) && !seen.has(e.targetRoomId)) {
          q.push(e.targetRoomId);
          seen.add(e.targetRoomId);
        }
    }
    return false;
  }
  assert.ok(reachable("R08", "P03") && reachable("P03", "R08"));
});
test("dash, wall grip, both shortcuts, lift and tower bridge reject locked exits", () => {
  const { game } = fixture();
  for (const [id, target] of [
    ["P04", "P05"],
    ["R04", "R05"],
    ["P07", "P02"],
    ["R07", "R02"],
    ["P08", "V01"],
    ["R06", "R08"],
  ]) {
    game.loadRoom(id);
    assert.equal(
      game.tryExit(game.room.exits.find((e) => e.targetRoomId === target)),
      false,
    );
    assert.equal(game.transition, null);
  }
});
test("ability is awarded once, persists through death and room reload", () => {
  const { game, store } = fixture();
  game.loadRoom("P04");
  const ability = game.room.entities.find((e) => e.type === "ability");
  game.nearby = ability;
  game.interact();
  game.interact();
  assert.equal(game.flags.filter((f) => f === "ability.dash").length, 1);
  game.die();
  game.respawn();
  assert.equal(game.abilities.dash, true);
  assert.ok(store.load().flags.includes("ability.dash"));
  game.loadRoom("R04");
  game.nearby = game.room.entities.find((e) => e.type === "ability");
  game.interact();
  game.die();
  game.respawn();
  assert.ok(game.abilities.wall_grip);
});
test("rest point is reusable across application restart and heals the player", () => {
  const { game, storage } = fixture();
  game.loadRoom("V02");
  game.health = 1;
  game.nearby = game.room.entities.find((e) => e.type === "rest");
  game.interact();
  assert.equal(game.health, 5);
  const restored = new game.constructor(
    structuredClone(world),
    config,
    new game.store.constructor(storage),
  );
  restored.start();
  assert.equal(restored.room.roomId, "V02");
  assert.equal(restored.player.y, 576);
  assert.ok(restored.progress.rests.includes("rest.station"));
});
test("pickups and NPC gifts cannot duplicate rewards; heart updates max health", () => {
  const { game } = fixture();
  game.progress.flags.push("ability.wall_grip");
  game.loadRoom("P03");
  for (const target of game.room.entities.filter((e) => e.type === "pickup")) {
    game.nearby = target;
    game.interact();
    game.interact();
  }
  assert.equal(maxHealth(game.progress), 6);
  assert.equal(game.health, 6);
  assert.equal(fragmentCount(game.progress), 1);
  game.loadRoom("V03");
  game.nearby = game.room.entities.find((e) => e.type === "npc");
  game.interact();
  game.interact();
  assert.equal(fragmentCount(game.progress), 2);
});
test("room transitions are single, reversible and pause-safe, including the elevator", () => {
  const { game } = fixture();
  game.flag("mechanism.pier_lift");
  game.loadRoom("P08");
  const exit = game.room.exits.find((e) => e.type === "lift");
  assert.ok(game.tryExit(exit));
  assert.equal(game.tryExit(exit), false);
  game.mode = "pause";
  game.update(1, controls());
  assert.equal(game.transition.elapsed, 0);
  game.mode = "playing";
  for (let i = 0; i < 240; i++) game.update(config.fixedStep, controls());
  assert.equal(game.room.roomId, "V01");
  assert.equal(game.transition, null);
  assert.ok(game.tryExit(game.room.exits.find((e) => e.type === "lift")));
  for (let i = 0; i < 240; i++) game.update(config.fixedStep, controls());
  assert.equal(game.room.roomId, "P08");
});
test("each swing hits a target at most once; walls block damage", () => {
  const { game } = fixture();
  game.loadRoom("R03");
  const e = game.enemies.find((e) => e.enemyType === "watchman");
  Object.assign(game.player, {
    x: e.x - 70,
    y: e.y,
    facing: 1,
    grounded: true,
  });
  for (let i = 0; i < 35; i++)
    game.update(config.fixedStep, controls([], i === 0 ? ["attack"] : []));
  assert.equal(e.hp, 1);
  const before = e.hp;
  game.surfaces.push({
    id: "testwall",
    x: e.x - 20,
    y: e.y - 20,
    w: 10,
    h: 100,
    kind: "solid",
  });
  // Test through the collision layer so it is retained during simulation.
  game.room.collisionLayers.push({
    id: "testwall",
    x: e.x - 20,
    y: e.y - 20,
    w: 10,
    h: 100,
    kind: "solid",
  });
  game.player.attackTime = 0;
  game.player.x = e.x - 70;
  for (let i = 0; i < 35; i++)
    game.update(config.fixedStep, controls([], i === 0 ? ["attack"] : []));
  assert.equal(e.hp, before);
});
test("boss resets after a failed attempt; victory persists and clears active projectiles", () => {
  const { game } = fixture();
  game.loadRoom("R07");
  game.enemies[0].hp = 3;
  game.die();
  game.respawn();
  game.loadRoom("R07");
  assert.equal(game.enemies[0].hp, 12);
  const boss = game.enemies[0];
  boss.hp = 1;
  Object.assign(game.player, {
    x: boss.x - 70,
    y: 576,
    facing: 1,
    invulnerable: 10,
  });
  game.projectiles.push({
    owner: boss.id,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    w: 10,
    h: 10,
    life: 10,
  });
  for (let i = 0; i < 30; i++)
    game.update(config.fixedStep, controls([], i === 0 ? ["attack"] : []));
  assert.ok(game.flags.includes("boss.courtyard_keeper"));
  assert.equal(game.projectiles.length, 0);
  game.loadRoom("R07");
  assert.equal(game.enemies.length, 0);
});
test("hundreds of room reloads do not accumulate combat objects", () => {
  const { game } = fixture();
  for (let i = 0; i < 200; i++) {
    game.loadRoom("R03");
    assert.equal(game.enemies.length, 2);
    game.projectiles.push({});
    game.particles.push({});
    game.loadRoom("V02");
    assert.equal(game.enemies.length, 0);
    assert.equal(game.projectiles.length, 0);
    assert.equal(game.particles.length, 0);
  }
});

test("camera reaches the upper room bound without leaving the player above the viewport", () => {
  const { game } = fixture();
  game.loadRoom("R05");
  Object.assign(game.player, { x: 550, y: 156, grounded: true });
  for (let i = 0; i < 120; i++) game.update(config.fixedStep, controls());
  assert.ok(game.camera.y < 5);
  assert.ok(game.player.y - game.camera.y > 100);
});
