import test from "node:test";
import assert from "node:assert/strict";
import { fixture, config, controls, positionAt, world } from "./helpers.js";
import { decodeSave, encodeSave } from "../src/save.js";
import { ACT_ONE_ENTRIES, PLACE_VOICES, GUIDE_HELP } from "../src/story.js";
import { captureSimulation, simulateForecast } from "../src/guide/oracle.js";
import { updateEnemy } from "../src/enemies.js";

const run = (g, seconds) => {
  for (let i = 0; i < Math.round(seconds / config.fixedStep); i++)
    g.update(config.fixedStep, controls());
};
const ids = (g) => g.guide.story.entries.map((e) => e.id);

test("Guide story follows real commands and discoveries and survives room reloads without duplicates", () => {
  const { game: g, store } = fixture();
  g.start(true, true);
  assert.deepEqual(ids(g), ["wake"]);
  assert.equal(g.guide.story.unread, 1);
  g.guide.commands.enqueue("wait", { duration: 0.15 });
  run(g, 0.2);
  assert.deepEqual(ids(g), ["wake", "thread"]);
  g.flag("ability.dash");
  assert.ok(ids(g).includes("breath"));
  assert.ok(!ids(g).includes("grip"));
  const before = ids(g);
  g.save();
  const saved = store.load();
  g.progress = saved;
  g.loadRoom("P01");
  assert.deepEqual(ids(g), before);
  g.guide.story.markRead("path", "breath");
  assert.ok(g.guide.story.state.read.includes("breath"));
  g.loadRoom("P02");
  g.loadRoom("P01");
  assert.equal(ids(g).filter((id) => id === "breath").length, 1);
  assert.equal(g.guide.state.act, 1);
  assert.equal(g.guide.obedience, 1);
});

test("every existing room has an authored journal page and the help covers care, protection and interventions", () => {
  for (const room of world.rooms)
    assert.ok(
      (PLACE_VOICES[room.roomId] || room.journalEntry)?.length > 80,
      room.roomId,
    );
  assert.equal(
    new Set(ACT_ONE_ENTRIES.map((e) => e.id)).size,
    ACT_ONE_ENTRIES.length,
  );
  assert.ok(GUIDE_HELP.some((e) => e.id === "limbs"));
  assert.ok(GUIDE_HELP.some((e) => e.id === "rest"));
  assert.ok(GUIDE_HELP.some((e) => e.id === "focus"));
  for (const e of [...ACT_ONE_ENTRIES, ...GUIDE_HELP])
    assert.ok(
      e.text.every((p) => p.length > 20),
      e.id,
    );
});

test("legacy Guide saves reconstruct only achieved story beats and reject unknown or malformed journal records", () => {
  const { game: g } = fixture();
  g.start(true, true);
  const progress = structuredClone(g.progress);
  delete progress.guide.story;
  progress.flags = ["ability.dash"];
  progress.visited = ["P01", "P02"];
  g.progress = decodeSave(encodeSave(progress));
  g.loadRoom("P02");
  assert.ok(ids(g).includes("breath"));
  assert.ok(!ids(g).includes("station"));
  assert.ok(!ids(g).includes("witness"));
  g.guide.story.markRead("places", "R07");
  assert.ok(!g.guide.story.state.placesRead.includes("R07"));
  g.guide.story.markRead("path", "dawn");
  assert.ok(!g.guide.story.state.read.includes("dawn"));
  progress.guide.story = {
    entries: [
      { id: "wake", at: -7 },
      { id: "wake", at: 12 },
      { id: "not-real", at: 0 },
    ],
    read: ["wake", "dawn"],
    placesRead: ["bad", "P01"],
    helpRead: ["bad", "plan"],
    ending: { time: -1, deaths: 2, commands: 3 },
  };
  const loaded = decodeSave(encodeSave(progress)).guide.story;
  assert.deepEqual(loaded.entries, [{ id: "wake", at: 0 }]);
  assert.deepEqual(loaded.read, ["wake"]);
  assert.deepEqual(loaded.placesRead, ["P01"]);
  assert.equal(loaded.ending, null);
});

test("Oracle never writes or reveals a story entry and predicts the same combat after the balance change", () => {
  const { game: g, storage } = fixture();
  g.start(true, true);
  g.loadRoom("R07", "arena_entry");
  const enemy = g.enemies[0];
  g.guide.commands.enqueue("attack", { enemyId: enemy.id, limb: "legs" });
  const before = captureSimulation(g),
    saves = [...storage.map];
  const forecast = simulateForecast(g.world, config, before);
  assert.deepEqual(captureSimulation(g), before);
  assert.deepEqual([...storage.map], saves);
  for (let i = 0; i < forecast.steps; i++)
    g.update(config.fixedStep, controls());
  assert.deepEqual(forecast.endpoint, { x: g.player.x, y: g.player.y });
  assert.equal(forecast.health, g.health);
});

test("first-light summary is captured once while later visits can reopen the epilogue", () => {
  const { game: g, store } = fixture();
  g.start(true, true);
  g.flag("boss.courtyard_keeper");
  g.flag("mechanism.tower_bridge");
  g.loadRoom("R08");
  const ending = g.room.entities.find((e) => e.type === "ending");
  positionAt(g, ending);
  g.nearby = ending;
  let opened = 0;
  g.events.complete = () => opened++;
  g.interact();
  assert.equal(opened, 1);
  assert.ok(ids(g).includes("dawn"));
  const first = structuredClone(g.guide.story.state.ending);
  run(g, 2);
  g.nearby = ending;
  g.interact();
  assert.equal(opened, 2);
  assert.deepEqual(g.guide.story.state.ending, first);
  g.save();
  assert.deepEqual(store.load().guide.story.ending, first);
  assert.equal(g.guide.state.act, 1);
});

test("NPC dialogue retains the quest instruction and adds the Guide relationship only in Guide mode", () => {
  const { game: g } = fixture();
  g.start(true, true);
  g.loadRoom("V02");
  const npc = g.room.entities.find((e) => e.id === "npc.station_keeper");
  positionAt(g, npc);
  g.nearby = npc;
  let line = "";
  g.events.dialogue = (_, text) => (line = text);
  g.interact();
  assert.match(line, /дом без лестниц/);
  assert.match(line, /голос/iu);
  assert.ok(ids(g).includes("keeper"));
  g.guide.state.enabled = false;
  g.nearby = npc;
  g.interact();
  assert.ok(!line.includes("не прячь от него усталость"));
});

test("hits during kneeling do not bank another knockdown; the keeper regains four seconds of footing", () => {
  const { game: g } = fixture();
  g.start(true, true);
  g.loadRoom("R07", "arena_entry");
  const e = g.enemies[0];
  g.guide.attackTarget = { enemyId: e.id, limb: "legs" };
  g.guide.enemyHit(e);
  g.guide.enemyHit(e);
  assert.equal(e.kneelTime, 2.4);
  const feet = e.y + e.h;
  for (let i = 0; i < 10; i++) g.guide.enemyHit(e);
  assert.equal(e.legHits, 0);
  assert.equal(e.kneelTime, 2.4);
  for (let i = 0; i < 290; i++)
    updateEnemy(e, g.player, config.fixedStep, g.surfaces, g);
  assert.equal(e.kneelTime, 0);
  assert.ok(e.kneelCooldown > 3.9);
  assert.ok(Math.abs(e.y + e.h - feet) < 0.001);
  for (let i = 0; i < 10; i++) g.guide.enemyHit(e);
  assert.equal(e.kneelTime, 0);
  assert.equal(e.legHits, 0);
  for (let i = 0; i < 490; i++)
    updateEnemy(e, g.player, config.fixedStep, g.surfaces, g);
  assert.equal(e.kneelCooldown, 0);
  g.guide.enemyHit(e);
  assert.equal(e.kneelTime, 0);
  g.guide.enemyHit(e);
  assert.equal(e.kneelTime, 2.4);
});
