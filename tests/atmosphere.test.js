import test from "node:test";
import assert from "node:assert/strict";
import { fixture, controls, config, positionAt } from "./helpers.js";
import { Audio, audibility } from "../src/audio.js";
import { Game } from "../src/game.js";
import { decodeSave, encodeSave, newProgress } from "../src/save.js";
import { validateWorld } from "../src/core.js";

function advance(g, seconds) {
  for (let i = 0; i < seconds / config.fixedStep; i++)
    g.update(config.fixedStep, controls());
}
test("local audio attenuates with distance, pans and is muffled by closed geometry", () => {
  const source = { x: 300, y: 100, radius: 400 },
    near = { x: 280, y: 100 },
    far = { x: 0, y: 100 };
  assert.ok(
    audibility(source, near, []).gain > audibility(source, far, []).gain,
  );
  const blocked = audibility(source, far, [
    { id: "door", x: 140, y: 50, w: 10, h: 100, kind: "solid" },
  ]);
  assert.ok(blocked.blocked);
  assert.ok(blocked.gain < audibility(source, far, []).gain * 0.3);
  assert.equal(audibility(source, { x: -200, y: 100 }, []).gain, 0);
  assert.ok(audibility(source, far, []).pan > 0);
});
test("step and impact variations never reuse either of the previous two variants", () => {
  const a = new Audio({});
  const values = [];
  for (let i = 0; i < 200; i++) {
    const value = a.variant("step.wood");
    assert.ok(!values.slice(-2).includes(value));
    values.push(value);
  }
});
test("boat scene keeps control available and interruption settles to its saved endpoint without replay", () => {
  const { game: g, store } = fixture();
  assert.equal(g.atmosphere.phase("scene.boat_departed"), 0);
  const x = g.player.x;
  for (let i = 0; i < 30; i++) g.update(config.fixedStep, controls(["right"]));
  assert.ok(g.player.x > x + 10);
  assert.ok(g.atmosphere.phase("scene.boat_departed") > 0);
  const events = [];
  const resumed = new Game(g.world, config, store, {
    sound: (name) => events.push(name),
  });
  resumed.start();
  assert.equal(resumed.atmosphere.phase("scene.boat_departed"), 1);
  assert.equal(resumed.atmosphere.active.size, 0);
  assert.equal(events.includes("boat"), false);
  assert.equal(
    resumed.particles.some((p) => p.kind === "spray"),
    false,
  );
});
test("warm house responds to the first rest once; later visits retain the changed local sources", () => {
  const { game: g } = fixture(),
    heard = [];
  g.events.sound = (name) => heard.push(name);
  g.loadRoom("P02");
  const rest = g.room.entities.find((e) => e.type === "rest");
  positionAt(g, rest);
  g.nearby = rest;
  g.interact();
  advance(g, 1.5);
  assert.ok(
    g.particles.some((p) => p.kind === "soot") ||
      g.progress.scenes["scene.warm_house"],
  );
  assert.ok(g.atmosphere.condition({ scene: "scene.warm_house" }));
  assert.equal(
    g.atmosphere.condition({ not: { scene: "scene.warm_house" } }),
    false,
  );
  positionAt(g, rest);
  g.nearby = rest;
  g.interact();
  advance(g, 0.3);
  assert.equal(heard.filter((name) => name === "music.warm").length, 1);
});
test("first ascent carries its scene across the actual lift and never repeats its debris on reload", () => {
  const { game: g } = fixture();
  g.flag("mechanism.pier_lift");
  g.loadRoom("P08");
  const lift = g.room.exits.find((e) => e.type === "lift");
  assert.ok(g.tryExit(lift));
  advance(g, 0.2);
  assert.ok(g.particles.some((p) => p.kind === "rust"));
  advance(g, 1.2);
  assert.equal(g.room.roomId, "V01");
  assert.ok(g.atmosphere.active.has("scene.first_ascent"));
  g.loadRoom("P02");
  g.loadRoom("P08");
  assert.equal(g.atmosphere.phase("scene.first_ascent"), 1);
  assert.equal(g.particles.length, 0);
});
test("ladder scene follows the opened shortcut into the kitchen and survives death without another burst", () => {
  const { game: g } = fixture();
  g.loadRoom("R07");
  g.flag("boss.courtyard_keeper");
  g.enemies = [];
  g.flag("shortcut.fire_stairs");
  advance(g, 0.2);
  assert.ok(g.particles.some((p) => p.kind === "rust"));
  g.loadRoom("R02");
  assert.ok(g.atmosphere.phase("scene.fire_ladder") > 0);
  g.die();
  g.respawn();
  g.loadRoom("R02");
  assert.equal(g.atmosphere.phase("scene.fire_ladder"), 1);
  assert.ok(!g.particles.some((p) => p.kind === "rust"));
});
test("particle budget reserves room for gameplay and low quality reduces decoration without removing action cues", () => {
  const { game: g } = fixture();
  g.loadRoom("P02");
  const fx = g.atmosphere.particles;
  const e = {
    effect: "dust",
    x: 300,
    y: 300,
    area: { w: 80, h: 100 },
    life: [2, 2],
  };
  fx.emit(e, 300, 0);
  assert.equal(g.particles.length, 88);
  fx.burst("dash", 300, 300, 120);
  assert.equal(g.particles.length, 160);
  assert.equal(g.particles.filter((p) => p.priority === 2).length, 120);
  g.particles = [];
  g.progress.settings.particleQuality = "low";
  fx.emit(e, 100, 0);
  assert.equal(g.particles.length, 32);
  fx.burst("dash", 300, 300, 1);
  assert.ok(g.particles.some((p) => p.kind === "dash"));
  g.particles = [];
  fx.emit({ ...e, x: 10000 }, 100, 0);
  assert.equal(g.particles.length, 0);
});
test("debug previews never write narrative flags and legacy saves gain safe atmosphere settings", () => {
  const { game: g } = fixture();
  g.loadRoom("R02");
  const saved = JSON.stringify(g.progress);
  g.debug.atmospherePreview = "after";
  assert.equal(g.atmosphere.phase("scene.fire_ladder"), 1);
  g.debug.atmospherePreview = "before";
  assert.equal(g.atmosphere.phase("scene.fire_ladder"), 0);
  assert.equal(JSON.stringify(g.progress), saved);
  const legacy = newProgress();
  delete legacy.scenes;
  delete legacy.settings.mix;
  delete legacy.settings.particleQuality;
  legacy.playTime = 10;
  const loaded = decodeSave(encodeSave(legacy));
  assert.equal(loaded.scenes["scene.boat_departed"], true);
  assert.equal(loaded.settings.particleQuality, "high");
  assert.equal(loaded.settings.mix.actions, 1);
});
test("room validation catches dangling scene effects, invalid sound radii and malformed emitters", () => {
  const { game: g } = fixture();
  const copy = structuredClone(g.world),
    r = copy.rooms[0];
  r.audioSources[0].radius = -1;
  r.emitters[0].life = [3, 1];
  r.storyEvents[0].effects.push({
    at: 1,
    type: "particles",
    emitter: "missing",
  });
  const errors = validateWorld(copy, config);
  assert.ok(errors.some((e) => e.includes("invalid audio source")));
  assert.ok(errors.some((e) => e.includes("invalid emitter")));
  assert.ok(errors.some((e) => e.includes("missing emitter")));
});
