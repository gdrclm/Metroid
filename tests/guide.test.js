import test from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  controls,
  config,
  positionAt,
  memoryStorage,
} from "./helpers.js";
import { createEnemy } from "../src/enemies.js";
import { SaveStore, encodeSave, decodeSave, newProgress } from "../src/save.js";
import { captureSimulation, simulateForecast } from "../src/guide/oracle.js";

function guideArena() {
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
  g.room.exits = [];
  g.room.mechanisms = [];
  g.mechanisms.clear();
  g.surfaces = g.currentSurfaces();
  g.player.grounded = true;
  g.player.invulnerable = 0;
  return f;
}
function run(g, seconds) {
  for (let i = 0; i < Math.round(seconds / config.fixedStep); i++)
    g.update(config.fixedStep, controls());
}
function target(g, hp = 10) {
  const e = createEnemy({
    id: "cultist",
    type: "enemy",
    enemyType: "keeper",
    x: 210,
    y: 620,
    hp,
    patrol: [0, 1280],
  });
  e.state = "recovery";
  e.timer = 30;
  g.enemies = [e];
  g.arenaActive = true;
  return e;
}

test("Act I ignores direct movement, caps the plan at three, and cancellation preserves the successor", () => {
  const { game: g } = guideArena(),
    q = g.guide.commands,
    x = g.player.x;
  for (let i = 0; i < 30; i++)
    g.update(config.fixedStep, controls(["right"], ["jump", "attack"]));
  assert.equal(g.player.x, x);
  assert.equal(g.player.attackId, 0);
  assert.equal(g.guide.obedience, 1);
  const first = q.enqueue("move", { x: 300 });
  q.enqueue("guard");
  const third = q.enqueue("roll");
  assert.equal(q.enqueue("wait").ok, false);
  q.cancel(first.id);
  assert.deepEqual(
    q.items.map((c) => c.type),
    ["guard", "roll"],
  );
  q.cancel(third.id);
  assert.equal(q.current.type, "guard");
  for (const room of g.world.rooms) {
    g.loadRoom(room.roomId);
    assert.equal(g.guide.state.act, 1);
    assert.equal(g.guide.obedience, 1);
  }
});

test("blocked movement clears dependent commands; pause freezes needs, TTL, brain and actors", () => {
  const { game: g } = guideArena();
  g.room.collisionLayers.push({
    id: "wall",
    x: 230,
    y: 450,
    w: 20,
    h: 170,
    kind: "solid",
  });
  g.guide.commands.enqueue("move", { x: 500, timeout: 0.8 });
  g.guide.commands.enqueue("attack");
  run(g, 1);
  assert.equal(g.guide.commands.result.status, "failed");
  assert.equal(g.guide.commands.items.length, 0);
  assert.ok(g.player.x <= 206);
  g.guide.tools.place("platform", 400, 450);
  g.mode = "tactical";
  const snapshot = captureSimulation(g);
  run(g, 5);
  assert.deepEqual(captureSimulation(g), snapshot);
});

test("apex handoff allows two jumps after wall grip while preserving the early ability gate", () => {
  const { game: g } = guideArena();
  g.guide.commands.enqueue("jump");
  g.guide.commands.enqueue("jump");
  run(g, 0.6);
  assert.equal(g.guide.commands.result.status, "failed");
  assert.match(g.guide.commands.result.reason, /заряда/);
  g.loadRoom("P01");
  g.flag("ability.wall_grip");
  g.guide.commands.enqueue("jump");
  g.guide.commands.enqueue("jump");
  let minY = 576;
  for (let i = 0; i < 170; i++) {
    g.update(config.fixedStep, controls());
    minY = Math.min(minY, g.player.y);
  }
  assert.ok(minY < 380, `double jump apex ${minY}`);
  assert.equal(g.guide.commands.result.status, "succeeded");
  run(g, 1);
  assert.equal(g.player.airJumpsLeft, 1);
});

test("dash cancellation ends the physical dash without discarding the following move", () => {
  const { game: g } = guideArena();
  g.flag("ability.dash");
  Object.assign(g.player, { y: 470, grounded: false });
  const dash = g.guide.commands.enqueue("dash");
  const next = g.guide.commands.enqueue("move", { x: 400 });
  run(g, 0.025);
  assert.ok(g.player.dashTime > 0);
  g.guide.commands.cancel(dash.id);
  assert.equal(g.player.dashTime, 0);
  assert.equal(g.guide.commands.current.id, next.id);
  run(g, 0.3);
  assert.equal(g.guide.commands.current.id, next.id);
});

test("shield blocks only incoming frontal hits and consumes stamina; roll has bounded invulnerability", () => {
  const { game: g } = guideArena();
  g.guide.commands.enqueue("guard", { direction: 1 });
  run(g, 0.02);
  const hp = g.health,
    stamina = g.guide.state.needs.stamina;
  assert.equal(g.hurt(1, -1), true);
  assert.equal(g.health, hp);
  assert.equal(g.guide.state.needs.stamina, stamina - 10);
  g.player.invulnerable = 0;
  g.hurt(1, 1);
  assert.equal(g.health, hp - 1);
  g.guide.commands.clear();
  Object.assign(g.player, {
    grounded: true,
    hurtTime: 0,
    invulnerable: 0,
    vx: 0,
    vy: 0,
    y: 576,
  });
  g.guide.commands.enqueue("roll", { direction: -1 });
  run(g, 0.1);
  assert.ok(g.player.rollTime > 0.07 && g.player.rollTime < 0.3);
  assert.equal(g.hurt(1, -1), false);
  run(g, 0.3);
  g.player.invulnerable = 0;
  assert.equal(g.hurt(1, -1), true);
});

test("anatomy targeting needs physical reach; two knee hits bring the head into reach", () => {
  const { game: g } = guideArena(),
    e = target(g);
  g.guide.commands.enqueue("attack", { enemyId: e.id, limb: "head" });
  run(g, 0.5);
  assert.equal(e.hp, 10);
  assert.equal(g.guide.commands.result.status, "failed");
  for (const limb of ["legs", "legs", "head"])
    g.guide.commands.enqueue("attack", { enemyId: e.id, limb });
  run(g, 1.5);
  assert.equal(e.hp, 7);
  assert.ok(e.kneelTime > 0);
  assert.equal(g.guide.commands.result.status, "succeeded");
  run(g, 3);
  assert.equal(e.h, 74);
  assert.equal(e.y, 546);
});

test("a targeted killing blow succeeds and adds corruption once; an enemy behind is not hit", () => {
  const { game: g } = guideArena(),
    e = target(g, 1);
  g.guide.commands.enqueue("attack", { enemyId: e.id, limb: "legs" });
  run(g, 0.6);
  assert.equal(e.hp, 0);
  assert.equal(g.guide.commands.result.status, "succeeded");
  assert.equal(g.guide.state.needs.corruption, 7);
  const other = target(g, 2);
  other.x = g.player.x - 45;
  g.guide.commands.enqueue("attack", { direction: 1 });
  run(g, 0.5);
  assert.equal(other.hp, 2);
});

test("starvation halves real damage and slows movement; exhaustion and grime produce physical debuffs", () => {
  const { game: g } = guideArena(),
    e = target(g);
  Object.assign(g.guide.state.needs, {
    energy: 0,
    satiety: 0,
    stress: 90,
    corruption: 90,
  });
  g.guide.commands.enqueue("attack", { enemyId: e.id, limb: "legs" });
  run(g, 0.5);
  assert.equal(e.hp, 9.5);
  g.enemies = [];
  g.guide.commands.enqueue("move", { x: 1100 });
  run(g, 1);
  assert.ok(Math.abs(g.player.vx) <= config.maxSpeed * 0.7 * 0.88 + 0.001);
  let slept = false;
  for (let i = 0; i < 360; i++) {
    g.update(config.fixedStep, controls());
    slept ||= g.guide.needs.microSleep > 0;
  }
  assert.ok(slept);
  const hp = g.health;
  run(g, 14);
  assert.equal(g.health, hp - 1);
});

test("safehouses replenish needs and escrow coffee for one dangerous room, without duplicating caches", () => {
  const { game: g } = fixture();
  g.start(true, true);
  g.loadRoom("P02");
  const rest = g.room.entities.find((e) => e.type === "rest");
  positionAt(g, rest);
  g.nearby = rest;
  g.interact();
  assert.equal(g.mode, "safehouse");
  const rations = g.guide.state.inventory.rations;
  Object.assign(g.guide.state.needs, {
    energy: 1,
    satiety: 1,
    stress: 90,
    corruption: 95,
  });
  for (const action of ["bed", "food", "wash", "coffee"])
    assert.equal(g.guide.safehouseAction(action).ok, true, action);
  assert.equal(g.guide.state.needs.energy, 100);
  assert.equal(g.guide.state.needs.corruption, 0);
  assert.equal(g.guide.state.inventory.rations, rations - 1);
  assert.equal(g.guide.state.caffeine.state, "armed");
  g.mode = "playing";
  g.loadRoom("P03");
  assert.equal(g.guide.needs.caffeine, true);
  g.guide.needs.spend(90);
  assert.equal(g.guide.state.needs.stamina, 100);
  g.loadRoom("P04");
  assert.equal(g.guide.state.caffeine, null);
  g.loadRoom("P02");
  positionAt(g, rest);
  g.guide.openSafehouse(rest);
  assert.equal(g.guide.state.inventory.rations, rations - 1);
});

test("platforms expire at three seconds; barricades stop shots and bodies until their fourth hit", () => {
  const { game: g } = guideArena(),
    tools = g.guide.tools;
  assert.equal(tools.place("platform", 400, 440).ok, true);
  const focus = g.guide.state.focus;
  assert.equal(tools.place("platform", 400, 440).ok, false);
  assert.equal(g.guide.state.focus, focus);
  run(g, 2.99);
  assert.equal(tools.structures.length, 1);
  run(g, 0.02);
  assert.equal(tools.structures.length, 0);
  assert.equal(tools.place("barricade", 300, 620).ok, true);
  g.guide.commands.enqueue("move", { x: 500 });
  run(g, 0.6);
  assert.ok(g.player.x + g.player.w <= 278.01);
  for (let i = 0; i < 4; i++)
    assert.equal(
      tools.projectileImpact({ x: 290, y: 570, w: 12, h: 16, life: 1 }),
      true,
    );
  assert.equal(
    tools.projectileImpact({ x: 290, y: 570, w: 12, h: 16, life: 1 }),
    false,
  );
  run(g, 0.5);
  assert.equal(g.guide.commands.items.length, 0);
  assert.ok(g.player.x + g.player.w <= 278.01);
  g.guide.commands.enqueue("move", { x: 500 });
  run(g, 0.5);
  assert.ok(g.player.x > 300);
});

test("airdrop pickup consumes escrow once; reload and room changes refund only unclaimed stock", () => {
  const { game: g } = guideArena(),
    tools = g.guide.tools,
    initial = g.guide.state.inventory.rations;
  g.guide.state.needs.satiety = 10;
  assert.equal(tools.place("rations", g.player.x + 12, 540).ok, true);
  assert.equal(g.guide.state.inventory.rations, initial - 1);
  run(g, 0.5);
  assert.ok(g.guide.state.needs.satiety > 60);
  assert.equal(g.guide.state.deliveries.length, 0);
  assert.equal(
    decodeSave(encodeSave(g.progress)).guide.inventory.rations,
    initial - 1,
  );
  tools.place("rations", 800, 500);
  const once = decodeSave(encodeSave(g.progress));
  assert.equal(once.guide.inventory.rations, initial - 1);
  assert.equal(once.guide.deliveries.length, 0);
  assert.equal(
    decodeSave(encodeSave(once)).guide.inventory.rations,
    initial - 1,
  );
  g.loadRoom("P02");
  assert.equal(g.guide.state.inventory.rations, initial - 1);
});

test("lure walks only an idle hero; classic and Guide saves stay independent and always decode as Act I", () => {
  const { game: g } = guideArena();
  g.guide.tools.place("lure", 450, 580);
  run(g, 0.5);
  assert.ok(g.player.x > 200);
  g.guide.commands.enqueue("guard");
  const x = g.player.x;
  run(g, 0.8);
  assert.ok(g.player.x - x < 30);
  const storage = memoryStorage(),
    classic = new SaveStore(storage),
    guide = new SaveStore(storage, () => {}, "last-harbour.guide.v1");
  const a = newProgress(),
    b = newProgress();
  a.flags = ["classic"];
  b.flags = ["guide"];
  b.guide.enabled = true;
  b.guide.act = 3;
  classic.write(a);
  guide.write(b);
  assert.deepEqual(classic.load().flags, ["classic"]);
  assert.deepEqual(guide.load().flags, ["guide"]);
  assert.equal(guide.load().guide.act, 1);
});

test("Oracle exactly reproduces the live executor and temporary geometry without side effects", () => {
  const { game: g, storage } = guideArena();
  g.flag("ability.dash");
  g.guide.tools.place("platform", 390, 500);
  g.guide.commands.enqueue("jump");
  g.guide.commands.enqueue("dash");
  g.guide.commands.enqueue("move", { x: 850 });
  const before = captureSimulation(g),
    saved = [...storage.map],
    worldBefore = JSON.stringify(g.world);
  const f = simulateForecast(g.world, config, before);
  assert.deepEqual(captureSimulation(g), before);
  assert.deepEqual([...storage.map], saved);
  assert.equal(JSON.stringify(g.world), worldBefore);
  for (let i = 0; i < f.steps; i++) g.update(config.fixedStep, controls());
  assert.deepEqual(f.endpoint, { x: g.player.x, y: g.player.y });
  assert.equal(f.health, g.health);
  assert.deepEqual(f.result, g.guide.commands.result);
});

test("Oracle marks actual hazard damage red and blocked commands yellow", () => {
  const { game: g } = guideArena();
  g.room.collisionLayers.push({
    id: "spikes",
    x: 300,
    y: 600,
    w: 150,
    h: 20,
    kind: "hazard",
  });
  g.guide.commands.enqueue("move", { x: 520 });
  const f = simulateForecast(g.world, config, captureSimulation(g));
  assert.equal(f.risk, 2);
  assert.ok(f.points.some((p) => p.risk === 2));
  g.room.collisionLayers = g.room.collisionLayers.filter(
    (s) => s.id !== "spikes",
  );
  g.room.collisionLayers.push({
    id: "wall",
    x: 230,
    y: 450,
    w: 20,
    h: 170,
    kind: "solid",
  });
  g.guide.commands.clear();
  g.guide.commands.enqueue("move", { x: 600, timeout: 1 });
  assert.equal(simulateForecast(g.world, config, captureSimulation(g)).risk, 1);
});

test("Guide orders cross the real P05 gap and climb the R05 shaft without moving coordinates directly", () => {
  const { game: g } = fixture();
  g.start(true, true);
  g.flag("ability.dash");
  g.loadRoom("P05");
  g.guide.commands.enqueue("move", { x: 910 });
  run(g, 1.25);
  for (const type of ["jump", "dash", "move"])
    g.guide.commands.enqueue(type, { direction: -1, x: 420 });
  run(g, 2);
  assert.ok(g.player.x < 520 && g.player.grounded);
  assert.equal(g.player.y, 396);
  assert.equal(g.health, 5);
  g.flag("ability.wall_grip");
  g.loadRoom("R05");
  g.guide.commands.enqueue("move", { x: 686 });
  run(g, 5 / 3);
  for (let i = 0; i < 4000; i++) {
    const p = g.player,
      q = g.guide.commands;
    if (p.y < 210 && p.grounded) break;
    if (
      !q.items.length &&
      (p.grounded ||
        (p.wall && p.wallLock <= 0) ||
        (p.airJumpsLeft > 0 && p.vy >= 0))
    )
      q.enqueue("jump", { direction: p.wall ? -p.wall : p.x < 680 ? 1 : -1 });
    g.update(config.fixedStep, controls());
  }
  assert.equal(g.player.y, 156);
  assert.equal(g.player.grounded, true);
  assert.equal(g.health, 5);
});

test("the real keeper can be defeated with Guide movement, guard and anatomy commands at normal health", () => {
  const { game: g } = fixture();
  g.start(true, true);
  g.loadRoom("R07", "arena_entry");
  for (let i = 0; i < 8000 && !g.flags.includes("boss.courtyard_keeper"); i++) {
    const q = g.guide.commands,
      p = g.player,
      e = g.enemies.find((e) => e.hp > 0);
    if (g.mode === "death") break;
    if (!q.items.length && e) {
      const dx = e.x + e.w / 2 - p.x - p.w / 2,
        direction = Math.sign(dx) || p.facing;
      if (e.state === "windup" && e.timer < 0.3)
        q.enqueue("guard", { direction, duration: 1.2 });
      else if (Math.abs(dx) < 105 && Math.abs(e.y + e.h - p.y - p.h) < 60)
        q.enqueue("attack", { enemyId: e.id, limb: "legs" });
      else
        q.enqueue("move", {
          x:
            p.x +
            12 +
            direction * Math.min(80, Math.max(15, Math.abs(dx) - 75)),
          timeout: 1,
        });
    }
    g.update(config.fixedStep, controls());
  }
  assert.ok(g.flags.includes("boss.courtyard_keeper"));
  assert.equal(g.progress.deaths, 0);
  assert.ok(g.health > 0);
});

test("all 22 Act I rooms, the keeper and the late secret are reachable continuously through Guide commands", async () => {
  const { runGuideJourney } = await import("../tools/guide-pilot.js");
  const { game: g } = fixture();
  g.start(true, true);
  const result = runGuideJourney(g);
  assert.equal(result.completed, true);
  assert.equal(result.visited.length, 22);
  assert.equal(result.deaths, 0);
  for (const flag of [
    "ability.dash",
    "ability.wall_grip",
    "boss.courtyard_keeper",
    "slice.overlook_seen",
    "pickup.p03_upper",
    "story.clockmaker_memory",
  ])
    assert.ok(g.flags.includes(flag), flag);
  assert.equal(g.guide.state.act, 1);
  assert.equal(g.debug.god, false);
  assert.equal(g.progress.settings.assist, false);
});
