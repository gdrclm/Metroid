import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateWorld } from "../src/core.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const world = JSON.parse(await readFile(root + "data/world.json", "utf8")),
  physics = JSON.parse(await readFile(root + "data/physics.json", "utf8"));
const errors = validateWorld(world, physics);
if (errors.length) throw new Error(errors.join("\n"));
await rm(root + "dist", { force: true, recursive: true });
await mkdir(root + "dist");
for (const path of ["src", "data", "style.css"])
  await cp(root + path, root + "dist/" + path, { recursive: true });
const html = (await readFile(root + "index.html", "utf8")).replace(
  'content="development"',
  'content="production"',
);
await writeFile(root + "dist/index.html", html);
await writeFile(root + "dist/.nojekyll", "");
console.log(
  "✓ Production build in dist/ · no external assets or runtime dependencies · debug access disabled",
);
