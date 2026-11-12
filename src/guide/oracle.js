import { Game } from "../game.js";
import { HeroDirector } from "../hero/director.js";
import { heroInput } from "../hero/commands.js";

// Only data crosses the worker boundary. Game.update and Commands.step remain
// the sole implementation of movement, combat, needs and temporary geometry.
const FIELDS = [
  "progress",
  "time",
  "hitStop",
  "viewport",
  "requestedViewport",
  "camera",
  "shake",
  "transition",
  "transitionCooldown",
  "defeatedOrdinary",
  "mechanisms",
  "safeHistory",
  "safePoint",
  "player",
  "enemies",
  "projectiles",
  "health",
  "arenaActive",
  "blockedExitLatch",
  "ambientSeen",
  "demonstration",
];
export function captureSimulation(game) {
  const data = Object.fromEntries(FIELDS.map((key) => [key, game[key]]));
  return structuredClone({
    ...data,
    roomId: game.room.roomId,
    guide: game.guide.snapshot(),
  });
}
export function cloneSimulation(world, config, snapshot) {
  world = structuredClone(world);
  const state = structuredClone(snapshot),
    g = Object.create(Game.prototype);
  for (const key of FIELDS) g[key] = state[key];
  g.world = world;
  g.config = config;
  g.rooms = new Map(
    [...world.rooms, ...(world.testRoom ? [world.testRoom] : [])].map((r) => [
      r.roomId,
      r,
    ]),
  );
  g.room = g.rooms.get(state.roomId);
  g.mode = "playing";
  g.prediction = true;
  g.events = {};
  g.store = { write: () => true };
  g.debug = {};
  g.particles = [];
  g.frameTimes = [];
  g.nearby = null;
  // Atmosphere is decorative; it does not apply forces or damage to actors.
  g.atmosphere = {
    active: new Map(),
    load() {},
    trigger() {},
    update() {},
    feedback() {},
    particles: { burst() {} },
  };
  g.guide = new HeroDirector(g);
  g.guide.restore(state.guide);
  g.surfaces = g.currentSurfaces();
  return g;
}
export function simulateForecast(
  world,
  config,
  snapshot,
  proposal = null,
  seconds = 6,
) {
  const g = cloneSimulation(world, config, snapshot),
    startRoom = g.room.roomId;
  if (proposal) {
    g.guide.commands.clear();
    for (const command of proposal)
      g.guide.commands.enqueue(command.type, command);
  }
  const points = [],
    initialHealth = g.health;
  let risk = 0,
    reason = "За 6 секунд повреждений не предвидится",
    steps = 0;
  for (let i = 0; i < Math.round(seconds / config.fixedStep); i++) {
    g.update(config.fixedStep, heroInput());
    steps++;
    let pointRisk = 0;
    if (g.health < initialHealth || g.mode === "death") {
      pointRisk = 2;
      reason =
        g.mode === "death" ? "Герой погибнет" : "Путь приводит к повреждению";
    } else if (g.guide.commands.result?.status === "failed") {
      pointRisk = 1;
      reason = g.guide.commands.result.reason;
    } else if (
      g.enemies.some(
        (e) =>
          e.hp > 0 &&
          ["windup", "lunge", "attack"].includes(e.state) &&
          Math.hypot(e.x - g.player.x, e.y - g.player.y) < 140,
      )
    ) {
      pointRisk = 1;
      reason = "Рядом готовится атака: проверьте щит и перекат";
    }
    risk = Math.max(risk, pointRisk);
    if (i % 4 === 0)
      points.push({
        x: g.player.x + g.player.w / 2,
        y: g.player.y + g.player.h / 2,
        risk: pointRisk,
        t: steps * config.fixedStep,
      });
    if (g.room.roomId !== startRoom || g.transition || g.mode !== "playing") {
      if (g.mode !== "death") {
        risk = Math.max(risk, 1);
        reason = "Прогноз заканчивается у перехода или взаимодействия";
      }
      break;
    }
  }
  if (
    g.guide.commands.items.length &&
    steps * config.fixedStep >= seconds - 0.01 &&
    risk === 0
  ) {
    risk = 1;
    reason = "Часть очереди за пределами прогноза на 6 секунд";
  }
  return {
    points,
    risk,
    reason,
    steps,
    endpoint: { x: g.player.x, y: g.player.y },
    health: g.health,
    result: g.guide.commands.result,
    remaining: g.guide.commands.items.length,
  };
}
export function forecast(world, config, snapshot) {
  const queue = simulateForecast(world, config, snapshot);
  const alternatives = [];
  if (!snapshot.guide.commands.items.length) {
    const direction = snapshot.player.facing,
      x = snapshot.player.x + 12 + direction * 140;
    for (const [label, commands] of [
      ["Шаг", [{ type: "move", x }]],
      ["Прыжок", [{ type: "jump", direction }]],
      ["Перекат", [{ type: "roll", direction }]],
    ])
      alternatives.push({
        label,
        commands,
        ...simulateForecast(world, config, snapshot, commands),
      });
  }
  let recommendation = null;
  const goal = [...snapshot.guide.commands.items]
    .reverse()
    .find((c) => c.type === "move");
  if (goal && (queue.risk > 0 || queue.remaining > 0)) {
    const direction =
      goal.x >= snapshot.player.x + snapshot.player.w / 2 ? 1 : -1;
    const move = { type: "move", x: goal.x };
    const candidates = [
      ["Прыжок и путь", [{ type: "jump", direction }, move]],
      ["Перекат и путь", [{ type: "roll", direction }, move]],
      ["Выждать и пройти", [{ type: "wait", duration: 1.2 }, move]],
    ];
    const p = snapshot.player,
      surfaces = cloneSimulation(world, config, snapshot).surfaces;
    const obstacle = surfaces
      .filter(
        (s) =>
          s.kind !== "oneWay" &&
          s.y < p.y + p.h - 2 &&
          s.y + s.h > p.y &&
          (direction > 0
            ? s.x >= p.x + p.w - 2 && s.x < goal.x
            : s.x + s.w <= p.x + 2 && s.x + s.w > goal.x),
      )
      .sort((a, b) => direction * (a.x - b.x))[0];
    if (obstacle) {
      const edge = direction > 0 ? obstacle.x : obstacle.x + obstacle.w;
      candidates.push([
        "Подойти, прыгнуть и пройти",
        [
          { type: "move", x: edge - direction * (p.w / 2 + 34) },
          { type: "jump", direction },
          move,
        ],
      ]);
    }
    if (snapshot.progress.flags.includes("ability.dash"))
      candidates.push([
        "Прыжок с рывком",
        [{ type: "jump", direction }, { type: "dash", direction }, move],
      ]);
    if (snapshot.progress.flags.includes("ability.wall_grip"))
      candidates.push([
        "Два прыжка и путь",
        [{ type: "jump", direction }, { type: "jump", direction }, move],
      ]);
    for (const [label, commands] of candidates)
      alternatives.push({
        label,
        commands,
        ...simulateForecast(world, config, snapshot, commands),
      });
    const safe = alternatives.filter(
      (a) =>
        a.risk === 0 &&
        a.remaining === 0 &&
        a.result?.status === "succeeded" &&
        Math.abs(a.endpoint.x + snapshot.player.w / 2 - goal.x) < 18,
    );
    safe.sort(
      (a, b) =>
        a.commands.length - b.commands.length ||
        Math.abs(a.endpoint.x + snapshot.player.w / 2 - goal.x) -
          Math.abs(b.endpoint.x + snapshot.player.w / 2 - goal.x),
    );
    recommendation = safe[0] || null;
  }
  return { queue, alternatives, recommendation };
}
