import { readFile } from "node:fs/promises";
import { validateWorld } from "../src/core.js";
export const readData = async () =>
  Promise.all(
    ["world", "physics"].map((n) =>
      readFile(new URL(`../data/${n}.json`, import.meta.url), "utf8").then(
        JSON.parse,
      ),
    ),
  );
const [world, physics] = await readData();
const errors = validateWorld(world, physics);
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else
  console.log(
    `✓ ${world.rooms.length} rooms · ${world.rooms.reduce((n, r) => n + r.exits.length, 0)} exits · IDs, references, spawns and geometry valid`,
  );
