import test from "node:test";
import assert from "node:assert/strict";
import { moveBody, updatePlayer, activeSurfaces } from "../src/physics.js";
import { conditionMet } from "../src/core.js";
import {
  config,
  world,
  controls,
  player,
  tick,
  jumpMeasure,
  floor,
  roomSurfaces,
  fixture,
} from "./helpers.js";

test("jump metrics and variable height: standing / running / dash", () => {
  const standing = jumpMeasure(),
    running = jumpMeasure({ running: true }),
    dash = jumpMeasure({ dash: true, running: true }),
    short = jumpMeasure({ hold: false });
  console.log(
    "Measured controller:",
    JSON.stringify({ standing, running, dash, short }),
  );
  for (const m of [standing, running, dash, short]) assert.ok(m.landed);
  assert.ok(standing.height > 115 && standing.height < 135);
  assert.ok(short.height < standing.height * 0.7);
  assert.ok(running.distance < 300);
  assert.ok(dash.distance > 420);
});
test("dash is locked before acquisition, horizontal, one charge until landing", () => {
  const p = player();
  p.grounded = false;
  p.y = 450;
  tick(p, controls(["right"], ["dash"]), floor, { dash: false });
  assert.equal(p.dashTime, 0);
  assert.ok(p.vx < config.dashSpeed);
  tick(p, controls(["right"], ["dash"]));
  assert.ok(p.dashTime > 0);
  assert.equal(p.vy, 0);
  assert.equal(p.dashReady, false);
  for (let i = 0; i < 26; i++) tick(p, controls(["right"]));
  tick(p, controls(["right"], ["dash"]));
  assert.equal(p.dashTime, 0);
  for (let i = 0; i < 120; i++) tick(p);
  assert.equal(p.dashReady, true);
});
test("swept collisions stop maximum-speed movement at thin walls and ceilings", () => {
  const p = player(50, 200);
  p.vx = 10000;
  p.vy = -1000;
  moveBody(p, 200, 0, [
    { id: "thin", x: 110, y: 100, w: 3, h: 400, kind: "solid" },
  ]);
  assert.equal(p.x, 86);
  assert.equal(p.vx, 0);
  moveBody(p, 0, -200, [
    { id: "ceiling", x: 0, y: 100, w: 200, h: 8, kind: "solid" },
  ]);
  assert.equal(p.y, 108);
  assert.equal(p.vy, 0);
});
test("coyote time and buffered landing jump both execute", () => {
  const p = player(250);
  p.grounded = false;
  p.coyote = 0.07;
  tick(p, controls(["jump"], ["jump"]));
  assert.ok(p.vy < 0);
  const q = player(300, 560);
  q.grounded = false;
  q.vy = 200;
  tick(q, controls(["jump"], ["jump"]));
  for (let i = 0; i < 18 && !q.grounded; i++) tick(q, controls(["jump"]));
  tick(q, controls(["jump"]));
  assert.ok(q.vy < 0);
});
test("opposite directions cancel and floor seams stay stable", () => {
  const p = player(90);
  const seams = [
    { ...floor[0], x: 0, w: 100 },
    { ...floor[0], id: "next", x: 100, w: 300 },
  ];
  for (let i = 0; i < 60; i++) tick(p, controls(["left", "right"]), seams);
  assert.equal(p.vx, 0);
  assert.equal(p.y, 576);
  assert.equal(p.grounded, true);
});
test("drop-through ignores only one-way platforms; solid floor still catches", () => {
  const p = player(100, 456),
    surfaces = [
      ...floor,
      { id: "one-way", x: 0, y: 500, w: 400, h: 6, kind: "oneWay" },
    ];
  tick(p, controls(["down", "jump"], ["jump"]), surfaces);
  for (let i = 0; i < 100; i++) tick(p, controls(), surfaces);
  assert.equal(p.y, 576);
  assert.ok(p.grounded);
});
test("safe dash tutorial cannot be crossed by an ordinary running jump", () => {
  const surfaces = roomSurfaces("P05");
  for (const dash of [false, true]) {
    const p = player(370, 396);
    p.vx = config.maxSpeed;
    for (let i = 0; i < 160; i++) {
      tick(
        p,
        controls(
          ["right", "jump"],
          [...(i === 0 ? ["jump"] : []), ...(dash && i === 25 ? ["dash"] : [])],
        ),
        surfaces,
        { dash: true, wall_grip: false },
        { w: 1280, h: 720 },
      );
      if (i > 10 && p.grounded) break;
    }
    if (dash) {
      assert.ok(p.x >= 736, "dash must reach landing");
      assert.equal(p.y, 396);
    } else {
      assert.ok(p.x < 736, "ordinary jump must fall short");
      assert.equal(p.y, 596, "safe lower floor catches the player");
    }
  }
});
test("wall slide requires ability and a grippable surface", () => {
  const wall = {
    id: "wall",
    x: 400,
    y: 0,
    w: 20,
    h: 620,
    kind: "solid",
    grippable: true,
  };
  for (const grip of [false, true]) {
    const p = player(376, 200);
    p.grounded = false;
    p.vy = 300;
    tick(p, controls(["right"]), [...floor, wall], { wall_grip: grip });
    assert.equal(p.state === "wall", grip);
    if (grip) assert.equal(p.vy, config.wallSlideSpeed);
  }
  const p = player(376, 200);
  p.grounded = false;
  p.vy = 300;
  tick(p, controls(["right"]), [...floor, { ...wall, grippable: false }], {
    wall_grip: true,
  });
  assert.notEqual(p.state, "wall");
});
test("wall jump pushes away, blocks immediate reattachment and does not recharge dash", () => {
  const p = player(376, 200);
  p.grounded = false;
  p.dashReady = false;
  tick(p, controls(["jump", "right"], ["jump"]), [
    ...floor,
    { id: "wall", x: 400, y: 0, w: 20, h: 620, kind: "solid", grippable: true },
  ]);
  assert.ok(p.vx < 0 && p.vy < 0 && p.wallLock > 0);
  assert.equal(p.dashReady, false);
});
test("moving platforms transfer their displacement to a standing rider", () => {
  const { game } = fixture();
  game.loadRoom("LAB");
  const s = activeSurfaces(game.room, [], conditionMet, game.time).find(
    (s) => s.id === "lab.moving",
  );
  Object.assign(game.player, {
    x: s.x + 35,
    y: s.y - config.height,
    grounded: true,
    support: { id: s.id, x: s.x, y: s.y },
  });
  const start = game.player.x;
  for (let i = 0; i < 60; i++) game.update(config.fixedStep, controls());
  assert.ok(game.player.x > start + 25);
  assert.ok(game.player.grounded);
});
test("physics is independent of render rate for equal fixed steps", () => {
  function run(fps) {
    const p = player();
    let accumulator = 0;
    for (let frame = 0; frame < fps; frame++) {
      accumulator += 1 / fps;
      while (accumulator + 1e-10 >= config.fixedStep) {
        tick(p, controls(["right"]));
        accumulator -= config.fixedStep;
      }
    }
    return p.x;
  }
  assert.ok(Math.abs(run(30) - run(144)) < 0.001);
});
test("R04 and P03 wall shafts reach their upper platforms using actual wall jumps", () => {
  for (const [id, threshold, landing] of [
    ["R04", 176, 176],
    ["P03", 206, 206],
  ]) {
    const p = player(920, 576),
      surfaces = roomSurfaces(id, ["ability.wall_grip"]);
    let dir = 1,
      phase = "climb",
      landed = false;
    for (let i = 0; i < 700; i++) {
      const keys = ["jump"],
        pressed = [];
      if (phase === "climb") {
        const kick = p.grounded || (p.wall && p.wallLock <= 0);
        if (kick && p.wall) dir = -p.wall;
        keys.push(dir === 1 ? "right" : "left");
        if (kick) pressed.push("jump");
        if (p.y < threshold) phase = "land";
      } else if (p.grounded) {
        assert.equal(p.y, landing);
        landed = true;
        break;
      }
      tick(
        p,
        controls(keys, pressed),
        surfaces,
        { dash: true, wall_grip: true },
        { w: 1280, h: 720 },
      );
    }
    assert.ok(landed, id + " upper route must be physically reachable");
  }
});
test("R05 can be climbed, exited and walked back through without a one-way trap", () => {
  const p = player(570, 956),
    surfaces = roomSurfaces("R05", ["ability.wall_grip"]);
  let dir = 1,
    phase = "climb",
    finished = false;
  for (let i = 0; i < 1400; i++) {
    let keys = ["jump"],
      pressed = [];
    if (phase === "climb") {
      const kick = p.grounded || (p.wall && p.wallLock <= 0);
      if (kick && p.wall) dir = -p.wall;
      keys.push(dir === 1 ? "right" : "left");
      if (kick) pressed.push("jump");
      if (p.y < 190) phase = "land";
    } else if (phase === "land") {
      if (p.grounded) {
        assert.equal(p.y, 156);
        phase = "cross";
        pressed = ["jump"];
        keys = ["jump", "right"];
      }
    } else {
      keys = ["jump", "right"];
      if (p.x > 620 && p.y < 120 && p.dashReady) pressed = ["dash"];
      if (p.grounded && p.x > 1000) {
        assert.equal(p.y, 256);
        finished = true;
        break;
      }
    }
    tick(
      p,
      controls(keys, pressed),
      surfaces,
      { dash: true, wall_grip: true },
      { w: 1280, h: 1100 },
    );
  }
  assert.ok(finished, "upper exit must be reachable");
  // The lower entry remains accessible by falling down the outside of the shaft.
  p.x = 120;
  p.y = 500;
  p.vy = 0;
  for (let i = 0; i < 150; i++)
    tick(
      p,
      controls(),
      surfaces,
      { dash: true, wall_grip: true },
      { w: 1280, h: 1100 },
    );
  assert.equal(p.y, 956);
});
test("R06 combines a wall jump with a dash and has a safe lower return route", () => {
  const p = player(126, 396),
    surfaces = roomSurfaces("R06", ["ability.wall_grip"]);
  let phase = "climb",
    finished = false;
  for (let i = 0; i < 900; i++) {
    let pressed = [];
    if (phase === "climb") {
      if (p.grounded || (p.wall === 1 && p.wallLock <= 0)) pressed = ["jump"];
      if (p.grounded && p.y === 236) {
        phase = "cross";
        pressed = ["jump"];
      }
    } else {
      if (p.x > 420 && p.y < 200 && p.dashReady) pressed = ["dash"];
      if (p.grounded && p.x > 700) {
        assert.equal(p.y, 256);
        finished = true;
        break;
      }
    }
    tick(
      p,
      controls(["right", "jump"], pressed),
      surfaces,
      { dash: true, wall_grip: true },
      { w: 1280, h: 720 },
    );
  }
  assert.ok(finished, "rooftops must be physically traversable");
});
