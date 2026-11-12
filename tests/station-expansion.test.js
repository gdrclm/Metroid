import test from "node:test";
import assert from "node:assert/strict";
import { fixture, world, config, controls, positionAt } from "./helpers.js";
import { validateWorld, conditionMet } from "../src/core.js";
import { runGuideJourney } from "../tools/guide-pilot.js";
import {
  StationExpansionPilot,
  stationExpansionTasks,
} from "../tools/station-expansion-pilot.js";
import { useCareStation } from "../src/hero/care.js";
import { captureSimulation, simulateForecast } from "../src/guide/oracle.js";

const run = (g, seconds) => {
  for (let i = 0; i < Math.round(seconds / config.fixedStep); i++)
    g.update(config.fixedStep, controls());
};
function canteen() {
  const f = fixture(),
    g = f.game;
  g.start(true, true);
  g.loadRoom("V08");
  return { ...f, g };
}
const station = (g, action) =>
  g.room.entities.find((e) => e.type === "care" && e.action === action);

test("continuous public Guide commands complete all 43 rooms and the station mechanisms without deaths or state injection", () => {
  const { game: g } = fixture();
  g.start(true, true);
  const result = runGuideJourney(g, { pilot: new StationExpansionPilot() });
  assert.equal(result.completed, true);
  assert.equal(result.deaths, 0);
  assert.deepEqual(
    new Set(result.visited),
    new Set(world.rooms.map((r) => r.roomId)),
  );
  for (const flag of [
    "story.station_meal",
    "shortcut.station_canteen",
    "mechanism.dispatch_grid",
    "mechanism.station_signal",
    "shortcut.station_service_lift",
    "shortcut.station_gallery",
  ])
    assert.ok(g.flags.includes(flag), flag);
  for (const id of [
    "note.clock_timing",
    "note.undelivered_letter",
    "note.archive_register",
  ])
    assert.ok(g.progress.hints.includes(id));
  assert.ok(g.guide.state.collectedSupplies.includes("guide.cache.v08"));
});
test("all 43 rooms remain reachable using the original classic physics", () => {
  const { game: g } = fixture(),
    pilot = new StationExpansionPilot(stationExpansionTasks({ care: false }));
  let last = -1,
    stuck = 0;
  for (let i = 0; i < 90000; i++) {
    assert.notEqual(g.mode, "death");
    if (["dialogue", "complete"].includes(g.mode)) g.mode = "playing";
    const a = pilot.next(g);
    if (pilot.done) break;
    if (last !== pilot.index) {
      last = pilot.index;
      stuck = 0;
    } else stuck++;
    assert.ok(stuck < 6000, `Classic station route stuck in ${g.room.roomId}`);
    g.update(config.fixedStep, controls(a.held, a.pressed));
  }
  assert.ok(pilot.done);
  assert.equal(g.progress.visited.length, 43);
  assert.equal(g.progress.deaths, 0);
});
test("three physical care stations consume real supplies exactly once and forecast never spends the real inventory", () => {
  const { g, store } = canteen();
  g.guide.state.inventory = { rations: 2, beans: 1 };
  g.guide.state.needs.satiety = 20;
  g.guide.state.caffeine = null;
  // Put the three authored stations within reach for this isolated transaction test.
  const targets = [
    station(g, "food"),
    station(g, "coffee"),
    station(g, "donate"),
  ];
  targets.forEach((e) => (e.x = 410));
  positionAt(g, targets[0]);
  for (const e of targets)
    g.guide.commands.enqueue("interact", { targetId: e.id });
  g.save();
  const before = JSON.stringify(g.progress),
    saved = store.load();
  const result = simulateForecast(
    g.world,
    g.config,
    captureSimulation(g),
    null,
    0.2,
  );
  assert.equal(result.result.status, "succeeded");
  assert.equal(result.risk, 0);
  assert.equal(JSON.stringify(g.progress), before);
  assert.deepEqual(store.load(), saved);
  run(g, 0.05);
  assert.deepEqual(g.guide.state.inventory, { rations: 0, beans: 0 });
  assert.ok(g.guide.state.needs.satiety > 74);
  assert.equal(g.guide.state.caffeine.state, "armed");
  assert.ok(g.flags.includes("story.station_meal"));
  g.progress = store.load();
  g.loadRoom("V08");
  const basket = station(g, "donate");
  positionAt(g, basket);
  assert.equal(useCareStation(g, basket.id).ok, false);
  assert.equal(g.guide.state.inventory.rations, 0);
});
test("care rejects remote, paused, blocked and empty-inventory commands with a useful failure and no resource loss", () => {
  const { g } = canteen(),
    food = station(g, "food");
  const initial = g.guide.state.inventory.rations;
  assert.equal(useCareStation(g, food.id).ok, false);
  positionAt(g, food);
  g.mode = "tactical";
  assert.equal(useCareStation(g, food.id).ok, false);
  assert.equal(g.guide.state.inventory.rations, initial);
  g.mode = "playing";
  g.guide.state.needs.satiety = 20;
  const wall = {
    id: "care.wall",
    x: 385,
    y: 510,
    w: 10,
    h: 110,
    kind: "solid",
  };
  g.surfaces.push(wall);
  assert.equal(useCareStation(g, food.id).ok, false);
  assert.equal(g.guide.state.inventory.rations, initial);
  g.surfaces.pop();
  g.guide.state.inventory.rations = 0;
  g.guide.commands.enqueue("interact", { targetId: food.id });
  g.guide.commands.enqueue("wait");
  run(g, 0.05);
  assert.equal(g.guide.commands.items.length, 0);
  assert.equal(g.guide.commands.result.status, "failed");
  assert.match(g.guide.commands.result.reason, /паёк/);
  assert.equal(g.guide.state.inventory.rations, 0);
});
test("giving a ration changes the server's dialogue and signal repairs persist without introducing a fourth rest point", () => {
  const { g, store } = canteen(),
    basket = station(g, "donate");
  positionAt(g, basket);
  assert.ok(useCareStation(g, basket.id).ok);
  const stock = g.guide.state.inventory.rations;
  g.loadRoom("V07");
  const npc = g.room.entities.find((e) => e.type === "npc");
  positionAt(g, npc);
  g.nearby = npc;
  let text;
  g.events.dialogue = (_speaker, line) => (text = line);
  g.interact();
  assert.match(text, /Твой паёк/);
  g.loadRoom("V11");
  const lever = g.room.entities.find((e) => e.type === "lever");
  positionAt(g, lever);
  g.nearby = lever;
  g.interact();
  g.progress = store.load();
  g.loadRoom("V06");
  const settler = g.room.entities.find((e) => e.type === "npc");
  positionAt(g, settler);
  g.nearby = settler;
  g.interact();
  assert.match(text, /Сигнал снова/);
  assert.equal(g.guide.state.inventory.rations, stock);
  assert.equal(
    world.rooms.flatMap((r) => r.entities.filter((e) => e.type === "rest"))
      .length,
    3,
  );
});
test("station authoring rejects malformed care and keeps late gallery and Archive branches behind real abilities", () => {
  const copy = structuredClone(world);
  copy.rooms
    .find((r) => r.roomId === "V08")
    .entities.find((e) => e.type === "care").action = "free_food";
  assert.ok(
    validateWorld(copy, config).some((e) => e.includes("invalid care station")),
  );
  const flags = [
    "mechanism.clockwork",
    "mechanism.dispatch_grid",
    "shortcut.station_gallery",
    "shortcut.station_service_lift",
  ];
  for (const [room, to] of [
    ["V12", "V13"],
    ["V04", "V16"],
    ["V02", "V13"],
    ["V09", "V14"],
  ]) {
    const e = world.rooms
      .find((r) => r.roomId === room)
      .exits.find((e) => e.targetRoomId === to);
    assert.equal(conditionMet(e.condition, flags), false);
    assert.equal(
      conditionMet(e.condition, [...flags, "ability.wall_grip"]),
      true,
    );
  }
  assert.equal(
    world.rooms
      .find((r) => r.roomId === "V16")
      .exits.some((e) => !world.rooms.some((r) => r.roomId === e.targetRoomId)),
    false,
  );
});
