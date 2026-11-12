import test from "node:test";
import assert from "node:assert/strict";
import { fixture, controls, config } from "./helpers.js";
import { captureSimulation, simulateForecast } from "../src/guide/oracle.js";
import { createEnemy } from "../src/enemies.js";
import { normalizeAutonomyState } from "../src/hero/brain-state.js";
import { perceive } from "../src/hero/perception.js";
import { scanWalk } from "../src/hero/navigation.js";

function arena() {
  const f = fixture(),
    g = f.game;
  g.start(true, true);
  g.room.collisionLayers = [
    {
      id: "floor",
      x: 0,
      y: 620,
      w: 1280,
      h: 100,
      kind: "solid",
      grippable: true,
    },
  ];
  g.room.entities = [];
  g.room.mechanisms = [];
  g.mechanisms.clear();
  g.room.exits = [
    {
      exitId: "observe.door",
      type: "door",
      x: 1150,
      y: 620,
      w: 42,
      h: 76,
      targetRoomId: "P02",
      spawnPointId: "start",
    },
  ];
  Object.assign(g.player, {
    x: 100,
    y: 576,
    vx: 0,
    vy: 0,
    grounded: true,
    invulnerable: 0,
  });
  g.surfaces = g.currentSurfaces();
  g.guide.brain.roomEntered();
  return { ...f, g };
}
function run(g, seconds) {
  for (let i = 0; i < Math.round(seconds / config.fixedStep); i++)
    g.update(config.fixedStep, controls());
}
function wall(g, x = 230, height = 170) {
  g.room.collisionLayers.push({
    id: "wall",
    x,
    y: 620 - height,
    w: 30,
    h: height,
    kind: "solid",
    grippable: false,
  });
  g.surfaces = g.currentSurfaces();
}

test("a real non-grippable obstacle clears the move in both directions, before the old 12 second timeout", () => {
  for (const direction of [-1, 1]) {
    const { g } = arena();
    wall(g);
    if (direction < 0) g.player.x = 310;
    const order = g.guide.commands.enqueue("move", {
      x: direction > 0 ? 600 : 100,
    });
    g.guide.commands.enqueue("attack");
    run(g, 0.8);
    assert.equal(g.guide.commands.items.length, 0);
    assert.equal(g.guide.commands.result.id, order.id);
    assert.equal(g.guide.commands.result.status, "failed");
    assert.match(g.guide.commands.result.reason, /препятствие/);
    const x = g.player.x;
    run(g, 2);
    assert.equal(g.player.x, x);
    assert.equal(g.player.state, "idle");
    assert.equal(g.guide.brain.describe().state, "blocked");
  }
});
test("clear paths, braking and real airborne movement are not mistaken for a stuck move", () => {
  const { g } = arena();
  g.guide.commands.enqueue("move", { x: 500 });
  run(g, 2);
  assert.equal(g.guide.commands.result.status, "succeeded");
  assert.ok(Math.abs(g.player.x + 12 - 500) < 12);
  wall(g, 540);
  Object.assign(g.player, { x: 520, y: 390, grounded: false, vy: 50 });
  g.guide.commands.enqueue("move", { x: 800 });
  run(g, 0.15);
  assert.equal(g.guide.commands.current.type, "move");
  assert.equal(g.guide.commands.current.stuckFor, 0);
});

test("vertical platform travel against a wall keeps the move while the body still makes physical progress", () => {
  const { g } = arena();
  g.time = Math.PI;
  g.room.collisionLayers = [
    {
      id: "lift",
      x: 0,
      y: 620,
      w: 1280,
      h: 16,
      kind: "oneWay",
      motion: { axis: "y", distance: 4, speed: 1 },
    },
  ];
  wall(g, 160);
  g.player.support = { id: "lift", x: 0, y: 620 };
  g.guide.commands.enqueue("move", { x: 600 });
  run(g, 0.6);
  assert.equal(g.guide.commands.current?.type, "move");
  assert.equal(g.guide.commands.current.stuckFor, 0);
  assert.ok(g.player.y < 575);
});

test("memory adds distance from a familiar edge but observing a repaired floor permits walking there again", () => {
  const { g } = arena();
  g.room.collisionLayers[0].w = 320;
  g.surfaces = g.currentSurfaces();
  g.guide.state.autonomy.hazards.push({
    roomId: "P01",
    kind: "edge",
    x: 325,
    y: 620,
  });
  let r = scanWalk(g, perceive(g), 310);
  assert.equal(r.remembered, true);
  assert.ok(r.x < 300);
  g.room.collisionLayers[0].w = 1280;
  g.surfaces = g.currentSurfaces();
  r = scanWalk(g, perceive(g), 310);
  assert.equal(r.safe, true);
});

test("even a learned jump is refused when its simulated landing crosses a known hazard", () => {
  const { g } = arena();
  wall(g, 240, 65);
  g.guide.state.autonomy.jumpSuccesses = 2;
  g.room.collisionLayers.push({
    id: "danger",
    x: 310,
    y: 590,
    w: 260,
    h: 30,
    kind: "hazard",
  });
  g.surfaces = g.currentSurfaces();
  run(g, 6);
  assert.ok(g.player.x + g.player.w <= 240);
  assert.equal(g.health, 5);
  assert.equal(g.guide.state.autonomy.jumpSuccesses, 2);
});
test("without orders a novice walks known flat ground and stops at an unfamiliar ledge", () => {
  const { g } = arena();
  g.room.collisionLayers = [
    { id: "edge.floor", x: 0, y: 620, w: 320, h: 100, kind: "solid" },
  ];
  g.surfaces = g.currentSurfaces();
  const hp = g.health;
  run(g, 5);
  assert.ok(g.player.x > 150);
  assert.ok(g.player.x + g.player.w <= 320);
  assert.ok(g.player.grounded);
  assert.equal(g.health, hp);
  assert.equal(g.progress.visited.length, 1);
  assert.equal(g.guide.commands.items.length, 0);
  assert.ok(g.guide.state.autonomy.hazards.some((h) => h.kind === "edge"));
});
test("autonomous exploration stops short of an automatic room passage", () => {
  const { g } = arena();
  g.room.exits = [
    {
      exitId: "observe.passage",
      type: "passage",
      direction: "right",
      x: 400,
      y: 620,
      triggerZone: { x: 400, y: 530, w: 40, h: 100 },
      targetRoomId: "P02",
      spawnPointId: "start",
    },
  ];
  run(g, 8);
  assert.equal(g.room.roomId, "P01");
  assert.equal(g.transition, null);
  assert.ok(g.player.x + g.player.w < 400);
});
test("a novice waits at a low wall; learned physical skill permits a simulated safe jump", () => {
  const novice = arena().g,
    learned = arena().g;
  wall(novice, 240, 65);
  wall(learned, 240, 65);
  learned.guide.state.autonomy.jumpSuccesses = 2;
  let airborne = false;
  for (let i = 0; i < 720; i++) {
    novice.update(config.fixedStep, controls());
    learned.update(config.fixedStep, controls());
    airborne ||= learned.player.y < 545;
  }
  assert.ok(novice.player.x + novice.player.w <= 240);
  assert.ok(airborne);
  assert.ok(learned.player.x > 300, `learned position ${learned.player.x}`);
  assert.equal(learned.health, 5);
});
test("successful real landings train physical skill and survive a save; failed or interrupted jumps do not", () => {
  const { g, store } = arena();
  for (let i = 0; i < 2; i++) {
    g.guide.commands.enqueue("jump", { direction: 0 });
    run(g, 1);
  }
  assert.equal(g.guide.state.autonomy.jumpSuccesses, 2);
  g.save();
  assert.equal(store.load().guide.autonomy.jumpSuccesses, 2);
  const before = g.guide.state.autonomy.jumpSuccesses;
  g.guide.commands.enqueue("jump", { direction: 0 });
  run(g, 0.2);
  g.health--;
  run(g, 1);
  assert.equal(g.guide.state.autonomy.jumpSuccesses, before);
});

test("learned independent jumping works on the real first-step geometry in P01", () => {
  const { game: g } = fixture();
  g.start(true, true);
  g.guide.state.autonomy.jumpSuccesses = 2;
  let airborne = false;
  for (let i = 0; i < 840; i++) {
    g.update(config.fixedStep, controls());
    airborne ||= g.player.y < 540;
  }
  assert.ok(airborne);
  assert.ok(g.player.x > 520);
  assert.equal(g.health, 5);
  assert.equal(g.room.roomId, "P01");
});
test("idle reflexes react to a visible windup through real defense and never attack the keeper", () => {
  const { g } = arena(),
    e = createEnemy({
      id: "test.keeper",
      enemyType: "keeper",
      x: 250,
      y: 620,
      hp: 12,
      patrol: [0, 1280],
    });
  e.state = "windup";
  e.timer = 0.5;
  e.attackKind = "lunge";
  g.enemies = [e];
  g.arenaActive = true;
  run(g, 0.15);
  assert.ok(
    ["guard", "dodge", "retreat"].includes(g.guide.brain.describe().state),
  );
  assert.ok(g.player.guard || g.player.rollTime > 0 || g.player.x < 100);
  assert.equal(g.player.attackId, 0);
  assert.equal(e.hp, 12);
});
test("a hidden enemy is heard as a warning without exposing its position or generating a target", () => {
  const { g } = arena();
  wall(g, 180);
  const e = createEnemy({
    id: "hidden.keeper",
    enemyType: "keeper",
    x: 260,
    y: 620,
    hp: 12,
    patrol: [0, 1280],
  });
  e.state = "windup";
  e.timer = 1;
  g.enemies = [e];
  run(g, 0.1);
  const s = g.guide.brain.describe();
  assert.deepEqual(s.visibleEnemies, []);
  assert.equal(s.heardWarnings, 1);
  assert.equal(s.target, null);
  assert.equal(s.state, "observe");
  assert.equal(g.player.guard, false);
});
test("an explicit wait or risky move has priority over autonomous reactions and edge avoidance", () => {
  const { g } = arena();
  const e = createEnemy({
    id: "visible.keeper",
    enemyType: "keeper",
    x: 250,
    y: 620,
    hp: 12,
    patrol: [0, 1280],
  });
  e.state = "windup";
  e.timer = 0.5;
  e.attackKind = "lunge";
  g.enemies = [e];
  g.arenaActive = true;
  g.guide.commands.enqueue("wait", { duration: 1 });
  run(g, 0.1);
  assert.equal(g.guide.brain.describe().state, "obey");
  assert.equal(g.player.guard, false);
  assert.equal(g.player.rollTime, 0);
  const risky = arena().g;
  risky.room.collisionLayers[0].w = 240;
  risky.surfaces = risky.currentSurfaces();
  risky.guide.commands.enqueue("move", { x: 700 });
  run(risky, 0.55);
  assert.ok(risky.player.x > 240);
});
test("a tired idle hero independently approaches a visible safehouse without changing rooms", () => {
  const { g } = arena();
  g.loadRoom("P02");
  const rest = g.room.entities.find((e) => e.type === "rest");
  Object.assign(g.player, {
    x: rest.x - 270,
    y: rest.y - 44,
    grounded: true,
    vx: 0,
    vy: 0,
  });
  g.guide.brain.roomEntered();
  g.guide.state.needs.energy = 10;
  run(g, 3);
  assert.equal(g.mode, "safehouse");
  assert.equal(g.room.roomId, "P02");
  assert.equal(g.guide.safehouseId, rest.id);
});
test("pause freezes perception and intentions; Oracle clones autonomous behavior without changing real memory or saves", () => {
  const { g, storage } = arena();
  run(g, 0.5);
  g.mode = "tactical";
  const paused = captureSimulation(g);
  run(g, 3);
  assert.deepEqual(captureSimulation(g), paused);
  g.mode = "playing";
  const before = captureSimulation(g),
    saves = [...storage.map];
  const forecast = simulateForecast(g.world, config, before, null, 4);
  assert.deepEqual(captureSimulation(g), before);
  assert.deepEqual([...storage.map], saves);
  for (let i = 0; i < forecast.steps; i++)
    g.update(config.fixedStep, controls());
  assert.deepEqual(forecast.endpoint, { x: g.player.x, y: g.player.y });
  assert.equal(forecast.health, g.health);
});
test("legacy and malformed AI memory normalize to bounded safe values", () => {
  assert.deepEqual(normalizeAutonomyState(null), {
    walkSuccesses: 0,
    jumpSuccesses: 0,
    independentMoves: 0,
    hazards: [],
  });
  const s = normalizeAutonomyState({
    walkSuccesses: -1,
    jumpSuccesses: Infinity,
    independentMoves: 50000,
    hazards: [
      null,
      { roomId: "P01", kind: "wall", x: 230, y: 620 },
      { roomId: "P01", kind: "wall", x: NaN, y: 620 },
    ],
  });
  assert.equal(s.walkSuccesses, 0);
  assert.equal(s.jumpSuccesses, 0);
  assert.equal(s.independentMoves, 1000);
  assert.equal(s.hazards.length, 1);
});
