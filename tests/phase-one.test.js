import test from "node:test";
import assert from "node:assert/strict";
import { fixture, controls, config, world, positionAt } from "./helpers.js";
import { Game } from "../src/game.js";
import { validateWorld } from "../src/core.js";
import { captureSimulation, forecast } from "../src/guide/oracle.js";

const run = (g, seconds) => {
  for (let i = 0; i < Math.round(seconds / config.fixedStep); i++)
    g.update(config.fixedStep, controls());
};

test("all field caches have valid static supports and contents; invalid authoring is rejected", () => {
  assert.equal(world.guideCaches.length, 19);
  assert.deepEqual(validateWorld(world, config), []);
  for (const change of [
    (c) => (c.contents = { beans: 0 }),
    (c) => (c.y = 300),
    (c) => (c.roomId = "missing"),
    (c) => (c.id = "P01.floor"),
  ]) {
    const copy = structuredClone(world);
    change(copy.guideCaches[0]);
    assert.ok(validateWorld(copy, config).length > 0);
  }
  const copy = structuredClone(world);
  copy.guideCaches.push(null);
  assert.ok(
    validateWorld(copy, config).some((e) => e.includes("invalid record")),
  );
});

test("a cache is collected only by a reachable Guide interaction and never duplicates after rest, death or reload", () => {
  const { game: g, store } = fixture();
  g.loadRoom("P03");
  assert.equal(g.guide.supplies.available.length, 0);
  g.start(true, true);
  g.loadRoom("P03");
  const cache = g.guide.supplies.available[0],
    initial = g.guide.state.inventory.rations;
  g.guide.commands.enqueue("interact", { targetId: cache.id });
  run(g, 0.02);
  assert.equal(g.guide.state.inventory.rations, initial);
  positionAt(g, cache);
  g.guide.commands.enqueue("interact", { targetId: cache.id });
  run(g, 0.03);
  assert.equal(g.guide.state.inventory.rations, initial + 1);
  assert.equal(g.guide.supplies.available.length, 0);
  g.loadRoom("P02");
  const rest = g.room.entities.find((e) => e.type === "rest");
  positionAt(g, rest);
  g.guide.openSafehouse(rest);
  g.guide.safehouseAction("bed");
  const stock = g.guide.state.inventory.rations;
  g.respawn();
  g.loadRoom("P03");
  g.progress = store.load();
  assert.equal(g.guide.supplies.available.length, 0);
  assert.equal(g.guide.state.inventory.rations, stock);
  positionAt(g, cache);
  assert.equal(g.guide.supplies.collect(cache.id).ok, false);
  assert.equal(g.guide.state.inventory.rations, stock);
});

test("cache rewards cannot pass through walls, fill beyond capacity or be taken remotely using forged coordinates", () => {
  const { game: g } = fixture();
  g.start(true, true);
  g.loadRoom("P03");
  const cache = g.guide.supplies.available[0];
  g.nearby = { ...cache, x: g.player.x + 12, y: g.player.y + 44 };
  g.interact();
  assert.equal(g.guide.state.collectedSupplies.length, 0);
  Object.assign(g.player, { x: 373, y: 576, grounded: true, vx: 0, vy: 0 });
  g.room.collisionLayers.push({
    id: "cache.wall",
    x: 415,
    y: 520,
    w: 10,
    h: 100,
    kind: "solid",
  });
  g.surfaces = g.currentSurfaces();
  assert.equal(g.guide.supplies.collect(cache.id).ok, false);
  g.room.collisionLayers.pop();
  g.surfaces = g.currentSurfaces();
  g.guide.state.inventory.rations = 99;
  assert.equal(g.guide.supplies.collect(cache.id).ok, false);
  assert.equal(g.guide.supplies.available.length, 1);
  g.guide.state.inventory.rations = 98;
  assert.equal(g.guide.supplies.collect(cache.id).ok, true);
  assert.equal(g.guide.state.inventory.rations, 99);
});

test("walking into a rest zone opens the safehouse once, preserves its latch through sleep and permits a later return", () => {
  const { game: g } = fixture();
  g.start(true, true);
  g.loadRoom("P02");
  const rest = g.room.entities.find((e) => e.type === "rest");
  g.guide.commands.enqueue("move", { x: rest.x });
  run(g, 2);
  assert.equal(g.mode, "safehouse");
  assert.equal(g.guide.commands.items.length, 0);
  const stock = structuredClone(g.guide.state.inventory);
  g.guide.safehouseAction("bed");
  g.mode = "playing";
  run(g, 0.2);
  assert.equal(g.mode, "playing");
  assert.deepEqual(g.guide.state.inventory, stock);
  g.guide.commands.enqueue("move", { x: 200 });
  run(g, 1.2);
  assert.equal(g.guide.safehouseLatch, null);
  g.guide.commands.enqueue("move", { x: rest.x });
  run(g, 1.2);
  assert.equal(g.mode, "safehouse");
  assert.deepEqual(g.guide.state.inventory, stock);
});

test("washing protection and active coffee survive a genuine application restart and remain frozen on pause", () => {
  const { game: g, store } = fixture();
  g.start(true, true);
  g.loadRoom("R07", "arena_entry");
  g.guide.needs.cleanTime = 80;
  g.guide.state.caffeine = { state: "active", roomId: "R07" };
  g.save();
  const restored = new Game(g.world, config, store);
  restored.start(false, true);
  assert.equal(restored.room.roomId, "R07");
  assert.equal(restored.guide.needs.caffeine, true);
  assert.equal(restored.guide.needs.cleanTime, 80);
  assert.ok(restored.guide.needs.conditions.some((c) => c.id === "coffee"));
  restored.mode = "tactical";
  run(restored, 3);
  assert.equal(restored.guide.needs.cleanTime, 80);
  restored.mode = "playing";
  run(restored, 0.1);
  assert.ok(restored.guide.needs.cleanTime < 80);
  restored.loadRoom("R06");
  assert.ok(!restored.guide.needs.conditions.some((c) => c.id === "coffee"));
});

test("fragile platforms shatter on the first projectile and disappear from collision geometry immediately", () => {
  const { game: g } = fixture();
  g.start(true, true);
  assert.equal(g.guide.tools.place("platform", 360, 450).ok, true);
  const surface = g.guide.tools.structures[0];
  assert.ok(g.surfaces.some((s) => s.id === surface.id));
  assert.equal(
    g.guide.tools.projectileImpact({ x: 355, y: 449, w: 12, h: 16, life: 1 }),
    true,
  );
  assert.ok(!g.currentSurfaces().some((s) => s.id === surface.id));
  assert.ok(!g.surfaces.some((s) => s.id === surface.id));
  assert.equal(
    g.guide.tools.projectileImpact({ x: 355, y: 449, w: 12, h: 16, life: 1 }),
    false,
  );
});

test("Oracle finds a bounded safe plan around the real P01 obstruction and live execution matches it", () => {
  const { game: g, storage } = fixture();
  g.start(true, true);
  g.guide.commands.enqueue("move", { x: 740 });
  g.mode = "tactical";
  const before = captureSimulation(g),
    saved = [...storage.map],
    f = forecast(g.world, config, before);
  assert.equal(f.queue.risk, 1);
  assert.ok(f.recommendation);
  assert.ok(f.recommendation.commands.length <= 3);
  assert.deepEqual(captureSimulation(g), before);
  assert.deepEqual([...storage.map], saved);
  assert.equal(g.guide.commands.replace(f.recommendation.commands).ok, true);
  g.mode = "playing";
  for (let i = 0; i < f.recommendation.steps; i++)
    g.update(config.fixedStep, controls());
  assert.deepEqual(f.recommendation.endpoint, { x: g.player.x, y: g.player.y });
  assert.equal(g.health, 5);
  assert.ok(Math.abs(g.player.x + 12 - 740) < 18);
});

test("invalid Oracle replacement preserves the old plan and an impossible tall wall gets no safe recommendation", () => {
  const { game: g } = fixture();
  g.start(true, true);
  g.guide.commands.enqueue("move", { x: 740 });
  g.mode = "tactical";
  const old = structuredClone(g.guide.commands.items);
  assert.equal(
    g.guide.commands.replace([{ type: "wait" }, { type: "unknown" }]).ok,
    false,
  );
  assert.deepEqual(g.guide.commands.items, old);
  g.room.collisionLayers.push({
    id: "tall.wall",
    x: 460,
    y: 0,
    w: 24,
    h: 620,
    kind: "solid",
  });
  assert.equal(
    forecast(g.world, config, captureSimulation(g)).recommendation,
    null,
  );
});

test("vertical jump holds horizontal position and the upper P06 coffee is reachable with ordinary Guide orders", () => {
  const { game: g } = fixture();
  g.start(true, true);
  const x = g.player.x;
  g.guide.commands.enqueue("jump", { direction: 0 });
  run(g, 1);
  assert.ok(Math.abs(g.player.x - x) < 0.001);
  assert.equal(g.player.grounded, true);
  g.flag("ability.dash");
  g.loadRoom("P06", "from.P05");
  function plan(commands) {
    for (const c of commands) g.guide.commands.enqueue(c.type, c);
    for (let i = 0; i < 800; i++) {
      g.update(config.fixedStep, controls());
      if (i > 4 && !g.guide.commands.items.length && g.player.grounded) break;
    }
    assert.equal(g.guide.commands.result.status, "succeeded");
  }
  plan([
    { type: "jump", direction: -1 },
    { type: "move", x: 1060 },
  ]);
  plan([
    { type: "jump", direction: -1 },
    { type: "move", x: 820 },
  ]);
  plan([
    { type: "jump", direction: -1 },
    { type: "dash", direction: -1 },
    { type: "move", x: 245 },
  ]);
  plan([{ type: "jump", direction: 0 }]);
  assert.equal(g.player.y + g.player.h, 335);
  const cache = g.guide.supplies.available[0],
    stock = g.guide.state.inventory.beans;
  plan([{ type: "interact", targetId: cache.id }]);
  assert.equal(g.guide.state.inventory.beans, stock + 1);
  assert.equal(g.progress.deaths, 0);
});
