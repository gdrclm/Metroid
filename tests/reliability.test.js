import test from "node:test";
import assert from "node:assert/strict";
import { player, tick, controls, floor, fixture, config } from "./helpers.js";
import {
  lineBlocked,
  safeStandingPoint,
  activeSurfaces,
} from "../src/physics.js";
import {
  accessibleInteraction,
  lockReason,
  safeReturnPoint,
} from "../src/safety.js";
import { conditionMet } from "../src/core.js";
import { updateEnemy, createEnemy } from "../src/enemies.js";

test("down+jump cannot penetrate solid ground, including edges, moving supports and a solid/one-way seam", () => {
  for (const [x, surfaces] of [
    [100, floor],
    [100, [...floor, { id: "grate", x: 0, y: 620, w: 120, h: 6, kind: "oneWay" }]],
    [90, [{ id: "edge", x: 100, y: 620, w: 200, h: 80, kind: "solid" }]],
    [150, [{ id: "moving-solid", x: 100, y: 620, w: 200, h: 20, kind: "solid", motion: { axis: "x", distance: 50, period: 4 } }]],
  ]) {
    const p = player(x);
    for (let i = 0; i < 200; i++)
      tick(p, controls(["down", "jump"], i === 0 ? ["jump"] : []), surfaces);
    assert.equal(p.y, 576);
    assert.equal(p.grounded, true);
  }
});
test("drop-through ignores only the supporting grate and catches a lower grate", () => {
  const p = player(100, 456),
    surfaces = [
      ...floor,
      { id: "top", x: 0, y: 500, w: 400, h: 8, kind: "oneWay" },
      { id: "bottom", x: 0, y: 540, w: 400, h: 8, kind: "oneWay" },
    ];
  tick(p, controls(["down", "jump"], ["jump"]), surfaces);
  for (let i = 0; i < 100; i++) tick(p, controls(), surfaces);
  assert.equal(p.y, 496);
  assert.ok(p.grounded);
});
test("safe return rejects an edge, a moving support, occupied body volume and nearby hazards", () => {
  const bounds = { w: 800, h: 720 },
    base = { id: "island", x: 100, y: 620, w: 200, h: 100, kind: "solid" };
  assert.equal(safeStandingPoint(player(95), [base], bounds), false);
  assert.equal(
    safeStandingPoint(
      player(150),
      [{ ...base, motion: { axis: "x" } }],
      bounds,
    ),
    false,
  );
  assert.equal(
    safeStandingPoint(
      player(150),
      [base, { id: "box", x: 150, y: 580, w: 40, h: 30, kind: "solid" }],
      bounds,
    ),
    false,
  );
  assert.equal(
    safeStandingPoint(
      player(150),
      [base, { id: "spike", x: 178, y: 600, w: 10, h: 20, kind: "hazard" }],
      bounds,
    ),
    false,
  );
  assert.ok(safeStandingPoint(player(150), [base], bounds));
});
test("local return falls back when the former platform moved away or the point became blocked", () => {
  const p = player(500, 300),
    bounds = { w: 800, h: 720 },
    surfaces = [
      { id: "safe", x: 0, y: 620, w: 300, h: 100, kind: "solid" },
      {
        id: "moving",
        x: 600,
        y: 450,
        w: 100,
        h: 12,
        kind: "oneWay",
        motion: { axis: "x" },
      },
    ];
  const q = safeReturnPoint(p, surfaces, bounds, [
    { x: 500, y: 406 },
    { x: 120, y: 576 },
  ]);
  assert.deepEqual(q, { x: 120, y: 576 });
});
test("interactions behind a thin wall or another floor are not available", () => {
  const p = player(100),
    target = { type: "lever", x: 160, y: 620 };
  assert.ok(accessibleInteraction(p, target, floor));
  assert.equal(
    accessibleInteraction(p, target, [
      ...floor,
      { id: "wall", x: 140, y: 540, w: 4, h: 80, kind: "solid" },
    ]),
    false,
  );
  const high = player(100, 470),
    below = { type: "npc", x: 140, y: 580 };
  assert.equal(
    accessibleInteraction(high, below, [
      { id: "floor-between", x: 0, y: 530, w: 300, h: 10, kind: "solid" },
    ]),
    false,
  );
});
test("LOS uses the actual segment and blocks sight through solid floors and opaque one-way floors", () => {
  const a = { x: 10, y: 50 },
    b = { x: 210, y: 200 },
    wall = { id: "floor", x: 50, y: 100, w: 200, h: 10, kind: "solid" };
  assert.equal(lineBlocked(a, b, [wall]), true);
  assert.equal(lineBlocked({ x: 10, y: 50 }, { x: 210, y: 50 }, [wall]), false);
  assert.equal(
    lineBlocked(a, b, [{ ...wall, kind: "oneWay" }], { includeOneWay: true }),
    true,
  );
  const enemy = createEnemy({
    id: "e",
    x: 100,
    y: 300,
    type: "enemy",
    enemyType: "watchman",
    hp: 2,
    patrol: [0, 500],
  });
  const g = {
    arenaActive: false,
    projectiles: [],
    hurt() {},
    player: player(150, 100),
  };
  updateEnemy(
    enemy,
    g.player,
    config.fixedStep,
    [{ id: "floor-between", x: 0, y: 200, w: 500, h: 20, kind: "solid" }],
    g,
  );
  assert.notEqual(enemy.state, "chase");
});
test("locked pickups explain their required ability rather than an unrelated boss", () => {
  assert.match(
    lockReason({ requires: { flag: "ability.wall_grip" } }),
    /когти/,
  );
  assert.equal(
    lockReason({ lockedReason: "Открывается из двора" }),
    "Открывается из двора",
  );
});
