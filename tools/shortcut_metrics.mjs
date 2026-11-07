import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Game } from "../src/game.js";
import { SaveStore } from "../src/save.js";
import { JourneyPilot, journeyTasks } from "./pilot.js";
const world = JSON.parse(
    await readFile(new URL("../data/world.json", import.meta.url), "utf8"),
  ),
  config = JSON.parse(
    await readFile(new URL("../data/physics.json", import.meta.url), "utf8"),
  );
function run(kind, opened) {
  const list = journeyTasks(),
    pier = kind === "pier",
    index = pier
      ? list.findIndex((t) => t.room === "P07" && t.kind === "arrive")
      : list.findIndex((t) => t.kind === "boss");
  let tasks = list.slice(0, index + 1);
  if (opened)
    tasks.push({
      room: pier ? "P07" : "R07",
      kind: "use",
      id: pier ? "lever.pier_gate" : "lever.fire_stairs",
      flag: pier ? "shortcut.pier_gate" : "shortcut.fire_stairs",
    });
  tasks.push(
    {
      room: pier ? "P07" : "R07",
      kind: "move",
      x: pier ? 281 : 500,
      feet: pier ? 620 : 800,
    },
    { room: pier ? "P07" : "R07", kind: "wait", seconds: 1 },
  );
  const measure = tasks.length;
  tasks.push({ room: pier ? "P02" : "R02", kind: "arrive" });
  const data = new Map();
  let g;
  g = new Game(
    structuredClone(world),
    config,
    new SaveStore({
      getItem: (k) => data.get(k) || null,
      setItem: (k, v) => data.set(k, v),
    }),
    { dialogue: () => (g.mode = "dialogue") },
  );
  g.start(true);
  const pilot = new JourneyPilot(tasks);
  let start = null;
  for (let i = 0; i < 80000; i++) {
    if (g.mode === "dialogue") g.mode = "playing";
    if (g.mode === "death") g.respawn();
    if (pilot.index === measure && start === null) start = g.time;
    const a = pilot.next(g);
    if (pilot.done)
      return {
        seconds: +(g.time - start).toFixed(3),
        deaths: g.progress.deaths,
      };
    g.update(config.fixedStep, {
      down: (k) => a.held.includes(k),
      pressed: (k) => a.pressed.includes(k),
    });
  }
  throw Error(
    "Shortcut measurement stuck " +
      kind +
      " " +
      opened +
      " " +
      JSON.stringify({
        task: tasks[pilot.index],
        room: g.room.roomId,
        p: g.player,
        state: pilot.state,
      }),
  );
}
const result = {
  method:
    "Fixed-step real controller; same approach position; normal health and enemy AI. Timing starts after the opening animation, excludes the initial journey and combat.",
};
for (const kind of ["pier", "fire_stairs"]) {
  const before = run(kind, false),
    after = run(kind, true);
  result[kind] = {
    before,
    after,
    savedSeconds: +(before.seconds - after.seconds).toFixed(3),
    speedup: +(before.seconds / after.seconds).toFixed(2),
  };
}
console.log(JSON.stringify(result, null, 2));
await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../artifacts/shortcuts.json", import.meta.url),
  JSON.stringify(result, null, 2) + "\n",
);
