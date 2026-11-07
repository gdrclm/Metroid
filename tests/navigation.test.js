import test from "node:test";
import assert from "node:assert/strict";
import { currentObjective, objectiveFor, conditionMet } from "../src/core.js";
import { questNavigation } from "../src/navigation.js";
import { world } from "./helpers.js";

const stages = [
  ["ability.dash", "P04"],
  ["shortcut.pier_gate", "P07"],
  ["mechanism.pier_lift", "P08"],
  ["ability.wall_grip", "R04"],
  ["boss.courtyard_keeper", "R07"],
  ["mechanism.tower_bridge", "R07"],
  ["slice.overlook_seen", "R08"],
];
test("every main quest marker points to its actual room and entity and advances with progress", () => {
  const flags = [];
  for (const [flag, id] of stages) {
    const objective = currentObjective(flags);
    assert.equal(objective.roomId, id);
    assert.equal(objectiveFor(flags), objective.text);
    assert.ok(
      world.rooms
        .find((r) => r.roomId === id)
        .entities.some((e) => e.id === objective.entityId),
    );
    flags.push(flag);
  }
  assert.equal(currentObjective(flags).roomId, "P03");
  for (const pickup of [
    "pickup.p03_upper",
    "pickup.p06_dash",
    "pickup.p03_lower",
    "pickup.clockmaker",
  ])
    flags.push(pickup);
  assert.equal(currentObjective(flags).roomId, null);
});
test("the house quest guides a player from the station to unvisited R04 without requiring wall grip", () => {
  const flags = stages.slice(0, 3).map(([f]) => f),
    nav = questNavigation(world, "V02", flags);
  assert.equal(nav.target.name, "Дом без лестниц");
  assert.equal(nav.next.roomId, "V04");
  assert.deepEqual(nav.route, ["V02", "V04", "R01", "R02", "R03", "R04"]);
  const rooms = new Map(world.rooms.map((r) => [r.roomId, r]));
  for (let i = 0; i < nav.route.length - 1; i++)
    assert.ok(
      rooms
        .get(nav.route[i])
        .exits.some(
          (e) =>
            e.targetRoomId === nav.route[i + 1] &&
            conditionMet(e.condition, flags),
        ),
    );
});
test("navigation uses open shortcuts and never proposes a closed gate", () => {
  const flags = ["ability.dash", "shortcut.pier_gate", "mechanism.pier_lift"];
  assert.deepEqual(questNavigation(world, "P02", flags).route.slice(0, 4), [
    "P02",
    "P07",
    "P06",
    "P08",
  ]);
  const closed = questNavigation(world, "P02", [
    "ability.dash",
    "mechanism.pier_lift",
  ]);
  assert.equal(closed.target.roomId, "P07");
  assert.equal(closed.next.roomId, "P03");
  assert.equal(closed.route.includes("P05"), true);
});
test("arriving at the target keeps its marker until the quest is done; completed quests have no marker", () => {
  const flags = stages.slice(0, 3).map(([f]) => f);
  const here = questNavigation(world, "R04", flags);
  assert.equal(here.next, null);
  assert.deepEqual(here.route, ["R04"]);
  const all = [
    ...stages.map(([f]) => f),
    "pickup.p03_upper",
    "pickup.p06_dash",
    "pickup.p03_lower",
    "pickup.clockmaker",
  ];
  assert.deepEqual(questNavigation(world, "R08", all).route, []);
  assert.equal(questNavigation(world, "R08", all).target, null);
});
