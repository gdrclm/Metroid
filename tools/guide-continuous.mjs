import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Game } from "../src/game.js";
import { SaveStore } from "../src/save.js";
import { runGuideJourney } from "./guide-pilot.js";
import { StationExpansionPilot } from "./station-expansion-pilot.js";
const expanded = process.argv.includes("--expanded");
const world = JSON.parse(
  await readFile(new URL("../data/world.json", import.meta.url), "utf8"),
);
const config = JSON.parse(
  await readFile(new URL("../data/physics.json", import.meta.url), "utf8"),
);
const saves = new Map();
const game = new Game(
  world,
  config,
  new SaveStore(
    {
      getItem: (key) => saves.get(key) || null,
      setItem: (key, value) => saves.set(key, value),
    },
    () => {},
    "last-harbour.guide.v1",
  ),
);
game.start(true, true);
const result = runGuideJourney(game, {
  ...(expanded ? { pilot: new StationExpansionPilot() } : {}),
  onTask: (task) =>
    console.log(
      task.index,
      task.room,
      task.time.toFixed(1),
      task.health,
      task.task?.kind || "done",
    ),
});
await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
await writeFile(
  new URL(
    `../artifacts/guide-${expanded ? "expanded" : "continuous"}-results.json`,
    import.meta.url,
  ),
  JSON.stringify(result, null, 2) + "\n",
);
if (
  !result.completed ||
  result.visited.length !==
    (expanded ? world.rooms.length : world.actOne.baseRoomIds.length) ||
  result.deaths > 0
)
  process.exitCode = 1;
console.log("GUIDE JOURNEY", JSON.stringify({ ...result, trace: undefined }));
