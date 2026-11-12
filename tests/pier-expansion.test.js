import test from "node:test";
import assert from "node:assert/strict";
import { fixture, world, config, controls, positionAt } from "./helpers.js";
import { conditionMet, validateWorld } from "../src/core.js";
import { runGuideJourney } from "../tools/guide-pilot.js";
import { PierExpansionPilot } from "../tools/pier-expansion-pilot.js";
const pierSlice = world.rooms.filter(
  (r) => r.contentBatch !== "act1.station.expansion",
);

const run = (g, seconds) => {
  for (let i = 0; i < Math.round(seconds / config.fixedStep); i++)
    g.update(config.fixedStep, controls());
};

test("continuous Guide journey visits all 31 rooms, opens both new loops and reads the lighthouse without teleporting", () => {
  const { game: g } = fixture();
  g.start(true, true);
  const result = runGuideJourney(g, { pilot: new PierExpansionPilot() });
  assert.equal(result.completed, true);
  assert.deepEqual(
    new Set(result.visited),
    new Set(pierSlice.map((r) => r.roomId)),
  );
  assert.equal(result.deaths, 0);
  assert.ok(result.health > 0);
  for (const flag of [
    "shortcut.fish_ladder",
    "shortcut.pier_winch",
    "boss.courtyard_keeper",
  ])
    assert.ok(g.flags.includes(flag));
  for (const id of [
    "npc.customs_keeper",
    "note.tide_ledger",
    "note.old_beacon",
  ])
    assert.ok(g.progress.hints.includes(id));
});

test("the same 31-room journey remains physically completable with the classic controller", () => {
  const { game: g } = fixture(),
    pilot = new PierExpansionPilot();
  let last = -1,
    stuck = 0;
  for (let tick = 0; tick < 90000; tick++) {
    assert.notEqual(g.mode, "death");
    if (["dialogue", "complete"].includes(g.mode)) g.mode = "playing";
    const a = pilot.next(g);
    if (pilot.done) break;
    if (pilot.index !== last) {
      last = pilot.index;
      stuck = 0;
    } else stuck++;
    assert.ok(
      stuck < 6000,
      `Classic route stuck in ${g.room.roomId} at task ${pilot.index}`,
    );
    g.update(config.fixedStep, controls(a.held, a.pressed));
  }
  assert.equal(pilot.done, true);
  assert.deepEqual(
    new Set(g.progress.visited),
    new Set(pierSlice.map((r) => r.roomId)),
  );
  assert.equal(g.progress.deaths, 0);
  assert.equal(g.guide.enabled, false);
});

test("new loops preserve ability gates and the original 22 rooms; planned rooms do not masquerade as loaded content", () => {
  function reachable(flags) {
    const seen = new Set([world.startRoomId]);
    for (const id of seen)
      for (const e of world.rooms.find((r) => r.roomId === id).exits)
        if (conditionMet(e.condition, flags)) seen.add(e.targetRoomId);
    return seen;
  }
  const base = new Set(world.actOne.baseRoomIds),
    added = world.rooms.filter((r) => r.contentBatch === "act1.pier.expansion");
  assert.equal(base.size, 22);
  assert.equal(added.length, 9);
  const noAbility = reachable([]),
    dashOnly = reachable(["ability.dash"]),
    both = reachable(["ability.dash", "ability.wall_grip"]);
  for (const r of added) {
    assert.equal(noAbility.has(r.roomId), false);
    assert.equal(dashOnly.has(r.roomId), !["P13", "P18"].includes(r.roomId));
    assert.equal(both.has(r.roomId), true);
  }
  assert.equal(
    world.rooms.some((r) => r.roomId === "R10"),
    false,
  );
  for (const mutate of [
    (w) => (w.actOne.targetRooms = 31),
    (w) => w.actOne.baseRoomIds.push("missing"),
    (w) => (w.rooms.find((r) => r.roomId === "P17").survival.grimeRate = -1),
  ]) {
    const copy = structuredClone(world);
    mutate(copy);
    assert.ok(validateWorld(copy, config).length > 0);
  }
});

test("winch and fisher shortcuts wait for animation, then persist with their physical bridge across reload", () => {
  const { game: g, store } = fixture();
  g.start(true, true);
  g.loadRoom("P14");
  const lever = g.room.entities.find((e) => e.id === "lever.fish_ladder"),
    exit = g.room.exits.find((e) => e.targetRoomId === "P02");
  positionAt(g, lever);
  g.nearby = lever;
  g.interact();
  assert.equal(g.tryExit(exit), false);
  run(g, 1);
  assert.equal(g.tryExit(exit), true);
  run(g, 1);
  assert.equal(g.room.roomId, "P02");
  g.loadRoom("P15");
  const bridge = () =>
    g.currentSurfaces().find((s) => s.id === "P15.return_bridge");
  assert.equal(bridge(), undefined);
  g.flag("shortcut.pier_winch");
  run(g, 0.5);
  assert.equal(bridge(), undefined);
  run(g, 0.9);
  assert.ok(bridge());
  g.save();
  g.progress = store.load();
  g.loadRoom("P15");
  assert.ok(bridge());
  assert.ok(g.flags.includes("shortcut.fish_ladder"));
});

test("tide house contaminates only the wet route and freezes the effect during tactical pause", () => {
  const { game: g } = fixture();
  g.start(true, true);
  g.loadRoom("P17");
  const n = g.guide.state.needs;
  run(g, 2);
  assert.ok(n.corruption > 0.3);
  const wet = n.corruption;
  g.mode = "tactical";
  run(g, 3);
  assert.equal(n.corruption, wet);
  g.mode = "playing";
  Object.assign(g.player, { x: 440, y: 616, grounded: true, vx: 0, vy: 0 });
  run(g, 2);
  assert.equal(n.corruption, wet);
  assert.ok(n.stress > 8);
});

test("new NPC greetings react to fatigue and new discoveries survive save normalization", () => {
  const { game: g, store } = fixture();
  g.start(true, true);
  g.loadRoom("P10");
  const npc = g.room.entities.find((e) => e.id === "npc.customs_keeper"),
    spoken = [];
  g.events.dialogue = (_title, text) => spoken.push(text);
  positionAt(g, npc);
  g.nearby = npc;
  g.interact();
  assert.ok(spoken[0].includes(npc.text));
  g.guide.state.needs.energy = 5;
  g.interact();
  assert.ok(spoken[1].includes(npc.repeatText));
  assert.ok(spoken[1].includes(npc.reactions[0].text));
  g.loadRoom("P13");
  const note = g.room.entities.find((e) => e.id === "note.old_beacon");
  positionAt(g, note);
  g.nearby = note;
  g.interact();
  g.save();
  const saved = store.load();
  assert.ok(saved.visited.includes("P13"));
  assert.ok(saved.hints.includes(note.id));
  assert.equal(saved.hints.filter((id) => id === npc.id).length, 1);
  g.progress = saved;
  assert.equal(g.loadRoom("P13", "from.P18"), true);
  assert.ok(g.guide.enabled);
  assert.equal(g.player.y + g.player.h, 220);
});
