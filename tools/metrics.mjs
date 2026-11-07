import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createPlayer, updatePlayer } from "../src/physics.js";
const config = JSON.parse(
  await readFile(new URL("../data/physics.json", import.meta.url), "utf8"),
);
const floor = {
  id: "measurement.floor",
  x: 0,
  y: 620,
  w: 20000,
  h: 100,
  kind: "solid",
  grippable: true,
};
function measure(running, dash, landingOffset = 0) {
  const p = createPlayer({ x: 100, y: 576 }, config);
  p.grounded = true;
  p.vx = running ? config.maxSpeed : 0;
  let high = p.y,
    time = 0;
  const surfaces = landingOffset
    ? [
        { ...floor, w: 180 },
        { ...floor, id: "measurement.target", x: 280, y: 620 + landingOffset },
      ]
    : [floor];
  for (let i = 0; i < 360; i++) {
    updatePlayer(
      p,
      {
        down: (k) => ["right", "jump"].includes(k),
        pressed: (k) =>
          (k === "jump" && i === 0) || (k === "dash" && dash && i === 30),
      },
      config.fixedStep,
      surfaces,
      config,
      { dash: true, wall_grip: true },
      { w: 20000, h: 1200 },
    );
    high = Math.min(high, p.y);
    time += config.fixedStep;
    if (i > 2 && p.grounded)
      return {
        H: +(576 - high).toFixed(2),
        distance: +(p.x - 100).toFixed(2),
        T: +time.toFixed(3),
        landed: true,
      };
  }
  return {
    H: +(576 - high).toFixed(2),
    distance: +(p.x - 100).toFixed(2),
    T: +time.toFixed(3),
    landed: false,
  };
}
const measurements = {
  units: "world pixels / seconds",
  step: config.fixedStep,
  colliderWidth: config.width,
  comfortableLandingWidth: 80,
  comfortableShaftWidth: 160,
  standing: measure(false, false),
  running: measure(true, false),
  runningDash: measure(true, true),
  higher100: measure(true, false, -100),
  lower80: measure(true, false, 80),
  dashTutorialGap: 350,
};
console.log(JSON.stringify(measurements, null, 2));
await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../artifacts/metrics.json", import.meta.url),
  JSON.stringify(measurements, null, 2) + "\n",
);
