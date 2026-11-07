import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Game } from "../src/game.js";
import { SaveStore } from "../src/save.js";
import { JourneyPilot } from "./pilot.js";
const world = JSON.parse(
    await readFile(new URL("../data/world.json", import.meta.url), "utf8"),
  ),
  config = JSON.parse(
    await readFile(new URL("../data/physics.json", import.meta.url), "utf8"),
  );
const data = new Map(),
  store = new SaveStore({
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
  });
let game;
game = new Game(world, config, store, {
  dialogue: () => (game.mode = "dialogue"),
  complete: () => (game.mode = "complete"),
});
game.start(true);
const pilot = new JourneyPilot(),
  record = [];
let last = -1,
  stuck = 0;
for (let tick = 0; tick < 90000; tick++) {
  if (game.mode === "death") {
    if (game.progress.deaths > 8) throw Error("Too many deaths");
    game.respawn();
  }
  if (game.mode === "dialogue" || game.mode === "complete")
    game.mode = "playing";
  const action = pilot.next(game);
  if (pilot.index !== last) {
    console.log(
      pilot.index,
      JSON.stringify(pilot.tasks[pilot.index]),
      "t",
      game.time.toFixed(1),
      "health",
      game.health,
      "position",
      Math.round(game.player.x),
      Math.round(game.player.y),
    );
    last = pilot.index;
    stuck = 0;
  } else stuck++;
  if (pilot.done) break;
  if (stuck > 5000) {
    console.error("STUCK", {
      task: pilot.tasks[pilot.index],
      room: game.room.roomId,
      player: game.player,
      state: pilot.state,
      nearby: game.nearby,
      health: game.health,
      enemies: game.enemies,
    });
    process.exitCode = 1;
    break;
  }
  game.update(config.fixedStep, {
    down: (k) => action.held.includes(k),
    pressed: (k) => action.pressed.includes(k),
  });
  record.push(action);
}
if (!pilot.done) process.exitCode = 1;
await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../artifacts/continuous-inputs.json", import.meta.url),
  JSON.stringify(record),
);
await writeFile(
  new URL("../artifacts/continuous-results.json", import.meta.url),
  JSON.stringify(
    {
      completed: pilot.done,
      visited: game.progress.visited,
      health: game.health,
      deaths: game.progress.deaths,
      time: game.time,
      trace: pilot.trace,
      stats: game.progress.stats,
    },
    null,
    2,
  ),
);
console.log(
  "RESULT",
  JSON.stringify({
    completed: pilot.done,
    rooms: game.progress.visited.length,
    health: game.health,
    deaths: game.progress.deaths,
    time: game.time,
  }),
);
