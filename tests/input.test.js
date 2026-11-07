import test from "node:test";
import assert from "node:assert/strict";
import { Input } from "../src/input.js";

test("a tap entirely between render frames is queued exactly once; focus loss releases keys", () => {
  const winHandlers = {},
    docHandlers = {};
  globalThis.window = {
    addEventListener: (name, fn) => (winHandlers[name] = fn),
  };
  globalThis.document = {
    hidden: false,
    addEventListener: (name, fn) => (docHandlers[name] = fn),
    querySelectorAll: () => [],
  };
  const input = new Input(window);
  const event = {
    target: { tagName: "CANVAS" },
    code: "KeyE",
    repeat: false,
    preventDefault() {},
  };
  winHandlers.keydown(event);
  winHandlers.keyup(event);
  input.poll();
  assert.equal(input.down("interact"), false);
  assert.equal(input.pressed("interact"), true);
  input.consume();
  input.poll();
  assert.equal(input.pressed("interact"), false);
  winHandlers.keydown({ ...event, code: "KeyD" });
  input.poll();
  assert.equal(input.down("right"), true);
  let paused = false;
  input.onBlur = () => (paused = true);
  winHandlers.blur();
  input.poll();
  assert.equal(input.down("right"), false);
  assert.ok(paused);
  winHandlers.keydown({ ...event, code: "KeyD", repeat: true });
  input.poll();
  assert.equal(input.down("right"), false);
  // A held Start button must not toggle pause/resume on every frame after clear().
  const pad = {
    axes: [0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
  };
  Object.defineProperty(navigator, "getGamepads", {
    value: () => [pad],
    configurable: true,
  });
  pad.buttons[9].pressed = true;
  input.poll();
  assert.ok(input.pressed("pause"));
  input.clear();
  input.poll();
  assert.equal(input.pressed("pause"), false);
  input.consume();
  input.poll();
  assert.equal(input.pressed("pause"), false);
  pad.buttons[9].pressed = false;
  input.poll();
  pad.buttons[9].pressed = true;
  input.poll();
  assert.ok(input.pressed("pause"));
  delete navigator.getGamepads;
  delete globalThis.window;
  delete globalThis.document;
});

test("multiple touch pointers can hold movement and jump; cancel releases only its own pointer", () => {
  const handlers = new Map();
  const buttons = ["right", "jump"].map((action) => ({
    dataset: { action },
    classList: { add() {}, toggle() {}, remove() {} },
    setPointerCapture() {},
    addEventListener(type, fn) {
      handlers.set(action + "." + type, fn);
    },
  }));
  globalThis.window = { addEventListener() {} };
  globalThis.document = {
    addEventListener() {},
    querySelectorAll: () => buttons,
  };
  const input = new Input(window);
  const press = (action, id) =>
    handlers.get(action + ".pointerdown")({
      pointerId: id,
      preventDefault() {},
    });
  press("right", 1);
  press("jump", 2);
  input.poll();
  assert.ok(input.down("right") && input.down("jump"));
  handlers.get("jump.pointercancel")({ pointerId: 2 });
  input.poll();
  assert.ok(input.down("right"));
  assert.equal(input.down("jump"), false);
  press("right", 3);
  handlers.get("right.pointerup")({ pointerId: 1 });
  input.poll();
  assert.ok(input.down("right"));
  input.clear();
  input.poll();
  assert.equal(input.down("right"), false);
  delete globalThis.window;
  delete globalThis.document;
});

test("swipe and hold supports neutral, reversal, release, cancellation and an independent jump finger", () => {
  const handlers = new Map();
  const element = (name) => ({
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    getBoundingClientRect: () => ({ left: 0, width: 600 }),
    setPointerCapture() {},
    addEventListener(type, fn) {
      handlers.set(name + "." + type, fn);
    },
  });
  const zone = element("zone"),
    canvas = element("canvas"),
    thumb = element("thumb"),
    jump = { ...element("jump"), dataset: { action: "jump" } };
  globalThis.window = { addEventListener() {} };
  globalThis.document = {
    addEventListener() {},
    querySelectorAll: () => [jump],
    getElementById: (id) =>
      ({ game: canvas, "swipe-zone": zone, "swipe-thumb": thumb })[id],
  };
  const input = new Input(window);
  const event = (x, y = 100, id = 1) => ({
    clientX: x,
    clientY: y,
    pointerId: id,
    pointerType: "touch",
    preventDefault() {},
  });
  const start = (e) => handlers.get("zone.pointerdown")(e),
    move = (e) => handlers.get("zone.pointermove")(e);
  start(event(100));
  move(event(106));
  input.poll();
  assert.equal(input.down("right"), false);
  move(event(145));
  input.poll();
  assert.ok(input.down("right"));
  assert.equal(input.down("left"), false);
  handlers.get("jump.pointerdown")(event(500, 100, 2));
  input.poll();
  assert.ok(input.down("jump") && input.down("right"));
  move(event(96));
  input.poll();
  assert.equal(input.down("right"), false);
  assert.equal(input.down("left"), false);
  move(event(50));
  input.poll();
  assert.ok(input.down("left"));
  handlers.get("zone.pointerup")(event(50));
  input.poll();
  assert.equal(input.down("left"), false);
  assert.ok(input.down("jump"));
  handlers.get("jump.pointerup")(event(500, 100, 2));
  input.poll();
  assert.equal(input.down("jump"), false);
  for (const cancel of ["pointercancel", "lostpointercapture"]) {
    start(event(100));
    move(event(150));
    handlers.get("zone." + cancel)(event(150));
    input.poll();
    assert.equal(input.down("right"), false);
  }
  start(event(100));
  move(event(150));
  input.clear();
  move(event(200));
  input.poll();
  assert.equal(input.down("right"), false);
  input.canSwipe = () => false;
  start(event(100));
  move(event(150));
  input.poll();
  assert.equal(input.down("right"), false);
  input.canSwipe = () => true;
  handlers.get("canvas.pointerdown")(event(450));
  handlers.get("canvas.pointermove")(event(390));
  input.poll();
  assert.equal(input.down("left"), false);
  delete globalThis.window;
  delete globalThis.document;
});
